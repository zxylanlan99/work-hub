"""web_search 工具：调用 crawler-service 的实时联网搜索（POST /api/crawler/search）。

供需要实时 / 外部信息的智能体（如 general，后续 planner / writer）使用。
- 统一响应信封：{"code":0, "data":[{"title","url","snippet"}], "message":"ok"}。
- crawler 服务端已对结果 url 做 SSRF 二次校验，本工具不再额外处置（见 T07）。
- crawler 不可达 / 出错时返回友好提示（不抛异常中断对话）。
"""

from __future__ import annotations

import httpx

from app.config import settings


def web_search(query: str, top_k: int = 5) -> str:
    """联网检索实时信息以补充回答。

    当用户问题需要最新资讯、外部事实、或知识库中缺失的内容时，
    调用本工具向 crawler-service 发起联网搜索并返回相关结果（标题、链接、摘要）。
    请勿用于纯概念解释或知识库已覆盖的内容。
    """
    url = f"{settings.CRAWLER_SERVICE_URL.rstrip('/')}/api/crawler/search"
    payload = {"query": query, "top_k": top_k}
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.RequestError as exc:
        return (
            f"[联网搜索失败] 无法连接爬虫服务（{settings.CRAWLER_SERVICE_URL}）：{exc}。"
            "请确认 crawler-service 已启动，或稍后重试。"
        )
    except Exception as exc:  # noqa: BLE001
        return f"[联网搜索失败] 搜索时发生错误：{exc}"

    # 统一信封：data 为结果列表；code != 0 视为失败
    if isinstance(data, dict) and data.get("code", 0) != 0:
        return f"[联网搜索失败] 爬虫服务返回错误：{data.get('message', '未知错误')}"

    results = (data or {}).get("data") or []
    if not results:
        return "未检索到相关结果。"

    lines = []
    for i, item in enumerate(results, start=1):
        title = item.get("title", "无标题")
        url_field = item.get("url", "")
        snippet = item.get("snippet", "")
        lines.append(f"[{i}] {title}\n{url_field}\n{snippet}")
    return "\n\n".join(lines)
