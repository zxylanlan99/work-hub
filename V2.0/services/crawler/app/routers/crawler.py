"""crawler-service 对外路由。

端点 (T07 任务规范):
  POST /api/crawler/rss/fetch    拉取启用 RSS 源 -> 逐篇抽取正文 -> 红线过滤 -> 返回通过/拦截结果
  POST /api/crawler/search       联网搜索 (DuckDuckGo HTML, SSRF/超时约束)
  GET  /api/crawler/redline/check 单条新闻红线自检 (调试用)

C2 硬约束: 本服务不自动入库; 通过红线的条目交由 web / T08 调 data-service /api/news 入库。
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.fetch_rss import run_crawl, search_web
from app.ingest import ingest_news
from app.redline import NewsCandidate, RedlineEngine

router = APIRouter(prefix="/api/crawler", tags=["crawler"])


class FetchRequest(BaseModel):
    """POST /api/crawler/rss/fetch 请求体。source_id 省略则抓取全部启用源。"""

    source_id: Optional[int] = None


class SearchRequest(BaseModel):
    """POST /api/crawler/search 请求体。"""

    query: str
    top_k: int = 5


@router.post("/rss/fetch")
def rss_fetch(payload: FetchRequest):
    """拉取 RSS 并跑红线过滤, 不在此入库。

    返回经红线过滤后的新闻 (passed) 与被拦截项 (rejected + reason)。
    """
    result = run_crawl(payload.source_id)
    return {"code": 0, "data": result, "message": "ok"}


@router.post("/search")
def search(payload: SearchRequest):
    """联网搜索, 返回 [{title, url, snippet}] (已剔除 SSRF 不安全链接)。"""
    results = search_web(payload.query, top_k=payload.top_k)
    return {"code": 0, "data": results, "message": "ok"}


@router.get("/redline/check")
def redline_check(
    title: str = Query(..., description="新闻标题"),
    url: str = Query(..., description="新闻链接 (走 SSRF 校验)"),
    source: str = Query("", description="来源名"),
    content: str = Query("", description="正文 (R2 判定)"),
    summary: str = Query("", description="摘要"),
):
    """单条新闻红线自检 (调试用)。返回 {passed, reasons}。"""
    item = NewsCandidate(
        title=title, url=url, source=source, content=content, summary=summary
    )
    # 调试用: 单条检查, 不受批次预算/单源上限影响 -> 用全新引擎
    engine = RedlineEngine()
    passed, reasons = engine.check(item, source=source or None)
    return {"code": 0, "data": {"passed": passed, "reasons": reasons}, "message": "ok"}


class NewsIngestItem(BaseModel):
    """单条待入库资讯（应已通过上游红线；入库前会再次双保险）。"""
    title: str
    url: str
    source: str = ""
    content: str = ""
    summary: str = ""
    published_at: Optional[str] = None


class NewsIngestRequest(BaseModel):
    """POST /api/crawler/news/ingest 请求体。"""
    items: List[NewsIngestItem]


@router.post("/news/ingest")
async def news_ingest(payload: NewsIngestRequest):
    """资讯入库知识库管线 (T08, V2-NEWS-001/002)。

    对每条 items 再次执行红线双保险（R1-R5，C2 禁止无正文入库），通过后写入
    news_items（pending），再调 kb-service 入库；成功回写 backend_collection_id，
    失败标记 failed（避免「资讯已落库但知识未切片」半成品）。返回逐条结果与汇总。
    """
    summary = await ingest_news([item.model_dump() for item in payload.items])
    return {"code": 0, "data": summary, "message": "ok"}
