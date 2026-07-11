"""RSS 抓取编排 + 联网搜索。

- fetch_rss_sources_from_data_service: 从 data-service /api/rss 拉取启用源
- crawl_source: 用 feedparser 解析单源, 逐篇抽取正文, 跑红线, 汇总 passed/rejected
- run_crawl: 批量抓取全部/指定启用源, 受 BUDGET 与 MAX_PER_SOURCE 约束 (R5)
- search_web: 简单 DuckDuckGo HTML 搜索 (受 SSRF/超时约束), 供 /api/crawler/search 使用

C2: 只返回通过红线的条目, 不在此处入库 (由 web 或 T08 调 data-service /api/news)。
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

import feedparser
import httpx
import requests
from bs4 import BeautifulSoup

from app import config
from app.extract import extract_content
from app.redline import NewsCandidate, RedlineEngine
from app.ssrf import check_url_safety


# --------------------------------------------------------------------------- #
# data-service 来源获取
# --------------------------------------------------------------------------- #
def fetch_rss_sources_from_data_service() -> List[dict]:
    """从 data-service /api/rss 拉取 RSS 源, 仅保留 enabled 的。"""
    try:
        resp = httpx.get(
            f"{config.DATA_SERVICE_URL}/api/rss",
            timeout=config.FETCH_TIMEOUT,
        )
        resp.raise_for_status()
        payload = resp.json()
        data = payload.get("data", []) if isinstance(payload, dict) else payload
        if not isinstance(data, list):
            return []
    except Exception:
        return []
    return [s for s in data if s.get("enabled", True)]


# --------------------------------------------------------------------------- #
# RSS 条目 -> 候选
# --------------------------------------------------------------------------- #
def _parse_published(entry: dict) -> Optional[str]:
    pp = entry.get("published_parsed") or entry.get("updated_parsed")
    if pp:
        try:
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", pp)
        except Exception:
            pass
    raw = entry.get("published") or entry.get("updated")
    return raw or None


def _entry_to_candidate(entry: dict, source_name: str) -> NewsCandidate:
    url = entry.get("link") or entry.get("id") or ""
    title = entry.get("title") or "(无标题)"
    summary = entry.get("summary") or entry.get("description") or ""
    published_at = _parse_published(entry)
    return NewsCandidate(
        title=title,
        url=url,
        source=source_name,
        summary=summary,
        published_at=published_at,
    )


def _candidate_to_news(item: NewsCandidate) -> Dict[str, Any]:
    return {
        "source": item.source,
        "title": item.title,
        "url": item.url,
        "content": item.content,
        "summary": item.summary,
        "published_at": item.published_at,
    }


# --------------------------------------------------------------------------- #
# 单源抓取
# --------------------------------------------------------------------------- #
def crawl_source(
    source: dict, engine: RedlineEngine, max_per_source: int = config.MAX_PER_SOURCE
) -> Dict[str, Any]:
    """抓取并校验单个 RSS 源。"""
    url = source.get("url") or ""
    source_name = source.get("title") or url
    result: Dict[str, Any] = {
        "source": source_name,
        "source_url": url,
        "fetched": 0,
        "passed": [],
        "rejected": [],
    }
    if not url:
        return result

    parsed = feedparser.parse(url)
    # 入口级报错 (feedparser 用 bozo 标记解析异常)
    if getattr(parsed, "bozo", 0) and not parsed.entries:
        result["error"] = str(getattr(parsed, "bozo_exception", "parse error"))
        return result

    for entry in parsed.entries[:max_per_source]:
        item = _entry_to_candidate(entry, source_name)
        # 逐篇正文抽取 (C2 前置: 无正文 extract 返回 None)
        if item.url:
            body = extract_content(item.url)
            if body:
                item.content = body
        passed, reasons = engine.check(item, source=source_name)
        result["fetched"] += 1
        if passed:
            result["passed"].append(_candidate_to_news(item))
        else:
            result["rejected"].append(
                {
                    "title": item.title,
                    "url": item.url,
                    "source": source_name,
                    "reason": ";".join(reasons),
                }
            )
    return result


# --------------------------------------------------------------------------- #
# 批量抓取
# --------------------------------------------------------------------------- #
def run_crawl(source_id: Optional[int] = None) -> Dict[str, Any]:
    """执行一轮 RSS 抓取。

    Args:
        source_id: 仅抓取该 id 的源 (None 表示全部启用源)

    Returns:
        {
          passed: [news...],
          rejected: [{title,url,source,reason}...],
          sources: [{source, source_url, fetched, passed_count, rejected_count}],
          failed_sources: [{source, reason}],
        }
    """
    sources = fetch_rss_sources_from_data_service()
    if source_id is not None:
        sources = [s for s in sources if s.get("id") == source_id]

    engine = RedlineEngine()
    engine.started_at = time.monotonic()
    deadline = engine.started_at + config.BUDGET

    overall: Dict[str, Any] = {
        "passed": [],
        "rejected": [],
        "sources": [],
        "failed_sources": [],
    }

    for src in sources:
        # R5 预算: 超预算停止继续抓取新源, 已得结果照常返回
        if time.monotonic() > deadline:
            overall["failed_sources"].append(
                {"source": src.get("url"), "reason": "budget exceeded"}
            )
            continue
        try:
            res = crawl_source(src, engine)
            overall["sources"].append(
                {
                    "source": res["source"],
                    "source_url": res["source_url"],
                    "fetched": res["fetched"],
                    "passed_count": len(res["passed"]),
                    "rejected_count": len(res["rejected"]),
                    "error": res.get("error"),
                }
            )
            overall["passed"].extend(res["passed"])
            overall["rejected"].extend(res["rejected"])
        except Exception as exc:  # 单源失败不影响其他源
            overall["failed_sources"].append(
                {"source": src.get("url"), "reason": str(exc)}
            )

    return overall


# --------------------------------------------------------------------------- #
# 联网搜索 (DuckDuckGo HTML, 受 SSRF / 超时约束)
# --------------------------------------------------------------------------- #
def search_web(
    query: str, top_k: int = 5, timeout: float = config.FETCH_TIMEOUT
) -> List[Dict[str, Any]]:
    """简单联网搜索, 返回 [{title, url, snippet}]。

    仅请求 duckduckgo 公网端点; 结果中每条 url 再经 SSRF 校验, 不安全链接剔除。
    """
    if not query or not query.strip():
        return []

    url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(query)}"
    safe, _ = check_url_safety(url)
    if not safe:
        return []

    results: List[Dict[str, Any]] = []
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": config.USER_AGENT},
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for node in soup.select(".result")[: top_k * 2]:
            a = node.select_one(".result__a")
            snippet = node.select_one(".result__snippet")
            if not a:
                continue
            link = a.get("href") or ""
            title = a.get_text(strip=True)
            # DuckDuckGo 的 302 跳转链接需解 uddg 参数
            link = _normalize_ddg_url(link)
            if not link:
                continue
            s_safe, _ = check_url_safety(link)
            if not s_safe:
                continue
            results.append(
                {
                    "title": title,
                    "url": link,
                    "snippet": snippet.get_text(strip=True) if snippet else "",
                }
            )
            if len(results) >= top_k:
                break
    except Exception:
        return results
    return results


def _normalize_ddg_url(href: str) -> str:
    """从 DuckDuckGo 跳转链接中提取真实 url。"""
    from urllib.parse import parse_qs, urlparse

    if not href:
        return ""
    parsed = urlparse(href)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        q = parse_qs(parsed.query)
        uddg = q.get("uddg")
        if uddg:
            return uddg[0]
    return href
