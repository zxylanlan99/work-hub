"""资讯入库知识库管线（T08，V2-NEWS-001 / 002）。

流程（saga / 补偿事务）：
  1) 对每条「已通过红线」的 items 再次执行红线双保险（R1-R5）。C2 硬约束：
     无正文 / 命中黑名单 / 敏感词 / 仅摘要 / 重复 的资讯一律拒绝入库。
  2) 写 ``news_items``，标记为 ``pending``（先落库，保证可追踪）。
  3) 调 kb-service ``POST /api/kb/ingest-news`` 入库
     （建文档 + 切片 + BGE-M3 向量化，返回 collectionId / chunkCount）。
  4) 成功 -> 回写 ``backend_collection_id`` / ``chunk_count``，标记 ``imported``；
     失败 -> 标记 ``failed``（避免出现「资讯已落库但知识未切片」的半成品）。
失败项保留 ``failed`` 状态，可重试（重新调用本端点；data-service 侧按幂等补写）。

所有出站调用使用异步 httpx，超时取 ``min(INGEST_TIMEOUT, 45)``（约束：
单请求超时 <=45s，超时不重试，防烧 token）。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from app import config
from app.redline import NewsCandidate, RedlineEngine


def _timeout() -> float:
    return min(float(config.INGEST_TIMEOUT), 45.0)


async def _create_news(item: Dict[str, Any], status: str) -> Optional[Dict[str, Any]]:
    """写 news_items，返回 data-service 信封中的 data（含 id）；失败返回 None。"""
    payload = {
        "title": item.get("title", ""),
        "url": item.get("url", ""),
        "source": item.get("source", ""),
        "content": item.get("content", ""),
        "summary": item.get("summary", ""),
        "published_at": item.get("published_at"),
        "status": status,
        "imported_to_kb": False,
    }
    url = f"{config.DATA_SERVICE_URL.rstrip('/')}/api/news"
    try:
        async with httpx.AsyncClient(timeout=_timeout()) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None
    if isinstance(data, dict) and data.get("code", 0) != 0:
        return None
    return data.get("data") if isinstance(data, dict) else None


async def _update_news(news_id: int, patch: Dict[str, Any]) -> None:
    """回写 news_items 状态 / backend_collection_id（失败静默，不阻断主流程）。"""
    url = f"{config.DATA_SERVICE_URL.rstrip('/')}/api/news/{news_id}"
    try:
        async with httpx.AsyncClient(timeout=_timeout()) as client:
            resp = await client.put(url, json=patch)
            resp.raise_for_status()
    except Exception:
        return


async def _ingest_to_kb(
    text: str, title: str, meta: Optional[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """调 kb-service 入库，返回 {collectionId, chunkCount}；失败返回 None。"""
    url = f"{config.KB_SERVICE_URL.rstrip('/')}/api/kb/ingest-news"
    payload = {"text": text, "title": title, "meta": meta or {}}
    try:
        async with httpx.AsyncClient(timeout=_timeout()) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return None
    if isinstance(data, dict) and data.get("code", 0) != 0:
        return None
    return data.get("data") if isinstance(data, dict) else None


async def ingest_news(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """执行资讯入库管线，返回汇总与逐条结果。

    Returns:
        {
          total, imported, failed, rejected, error,
          results: [{id?, title, url, status, ...}]
        }
    """
    engine = RedlineEngine()
    results: List[Dict[str, Any]] = []
    counts = {"imported": 0, "failed": 0, "rejected": 0, "error": 0}

    for item in items:
        title = item.get("title", "")
        url = item.get("url", "")
        content = item.get("content", "")

        # ---- 红线双保险（R1-R5）----
        candidate = NewsCandidate(
            title=title,
            url=url,
            source=item.get("source", ""),
            content=content,
            summary=item.get("summary", ""),
            published_at=item.get("published_at"),
        )
        passed, reasons = engine.check(candidate, source=item.get("source") or None)
        if not passed:
            results.append(
                {"title": title, "url": url, "status": "rejected", "reasons": reasons}
            )
            counts["rejected"] += 1
            continue

        # ---- 1) 写 news_items（pending）----
        created = await _create_news(item, status="pending")
        if created is None or created.get("id") is None:
            results.append(
                {
                    "title": title,
                    "url": url,
                    "status": "error",
                    "reasons": ["写入 news_items 失败"],
                }
            )
            counts["error"] += 1
            continue
        news_id = int(created["id"])

        # ---- 2) 调 kb-service 入库 ----
        meta = {
            "source": item.get("source", ""),
            "url": url,
            "published_at": item.get("published_at"),
        }
        kb = await _ingest_to_kb(content, title, meta)
        if kb is None:
            # 补偿：标记 failed（资讯已落库但未切片）
            await _update_news(news_id, {"status": "failed"})
            results.append(
                {
                    "id": news_id,
                    "title": title,
                    "url": url,
                    "status": "failed",
                    "reasons": ["kb-service 入库失败"],
                }
            )
            counts["failed"] += 1
            continue

        # ---- 3) 成功：回写 backend_collection_id / chunk_count ----
        await _update_news(
            news_id,
            {
                "status": "imported",
                "imported_to_kb": True,
                "backend_collection_id": kb.get("collectionId"),
                "chunk_count": kb.get("chunkCount"),
            },
        )
        results.append(
            {
                "id": news_id,
                "title": title,
                "url": url,
                "status": "imported",
                "collectionId": kb.get("collectionId"),
                "chunkCount": kb.get("chunkCount"),
            }
        )
        counts["imported"] += 1

    return {
        "total": len(items),
        "imported": counts["imported"],
        "failed": counts["failed"],
        "rejected": counts["rejected"],
        "error": counts["error"],
        "results": results,
    }
