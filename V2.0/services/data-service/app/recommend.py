"""News recommendation scoring (T17 / V2-NEWS-003).

针对已入库 ``NewsItem`` 计算 5 维度加权评分，并复用 crawler 红线风格做服务端再校验
（R2 正文非空 / R3 关键词 / R4 去重）。红线仅做标记（``passed`` / ``dropReason``），
不参与 ``score`` 计算（C2 硬约束：评分与红线解耦）。

维度说明（权重可配，缺省见 ``DEFAULT_WEIGHTS``）：
  relevance    相关度   —— 以「信息丰满度」代理：summary + content 越充实越高
  recency      时效性   —— 以 published_at（回退 created_at）距今指数衰减
  authority    权威性   —— 以来源域名（.edu / .gov / 知名媒体）评估
  completeness 完整度   —— title + summary + content + url 齐备程度
  dedup        去重     —— 同批内与已选更高分项的相似度（镜像 crawler R4）

> 权威红线 R1（SSRF）/ R5（预算）属抓取期约束，对已入库项不适用，
> 故服务端再校验只覆盖 R2 / R3 / R4。抓取期的权威红线由 crawler-service 执行。
"""
from __future__ import annotations

import difflib
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app import models
from app.schemas import NewsRecommendItem, RecommendWeights

# 缺省权重（和为 1，可在请求体 weights 中覆盖任意维度）。
DEFAULT_WEIGHTS: Dict[str, float] = {
    "relevance": 0.25,
    "recency": 0.25,
    "authority": 0.15,
    "completeness": 0.20,
    "dedup": 0.15,
}

# 与 crawler-service/app/redline.py 保持一致的红线阈值与关键词（仅 R2 / R3 / R4 适用）。
MIN_BODY_LEN: int = 200
DEDUP_THRESHOLD: float = 0.85
KEYWORD_BLACKLIST: List[str] = [
    "赌博", "博彩", "私彩", "色情", "代开发票", "违规广告",
    "casino", "porn", "pornography",
]
# 权威性白名单（域名后缀 / 关键字）；命中视为权威源。
AUTHORITY_DOMAINS: tuple = (
    ".edu", ".gov", ".edu.cn", ".gov.cn",
    "people.com.cn", "xinhuanet.com", "nature.com", "science.org",
    "ieee.org", "acm.org", "wikipedia.org", "arxiv.org",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _domain_of(url: str) -> str:
    m = re.match(r"https?://([^/]+)/?", (url or "").lower())
    return m.group(1) if m else ""


def _title_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def score_relevance(item: models.NewsItem) -> float:
    """相关度代理：信息丰满度（summary + content 长度归一）。"""
    summary_len = len((item.summary or "").strip())
    content_len = len((item.content or "").strip())
    s = (min(summary_len / 200.0, 1.0) * 0.5) + (min(content_len / 2000.0, 1.0) * 0.5)
    return _clamp(s)


def score_recency(item: models.NewsItem, now: Optional[datetime] = None) -> float:
    """时效性：published_at（回退 created_at）距今指数衰减（半衰期 ~30 天）。"""
    now = now or _now()
    ts = item.published_at or item.created_at
    if not ts:
        return 0.5
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - ts).total_seconds() / 86400.0)
    return _clamp(0.5 ** (age_days / 30.0))


def score_authority(item: models.NewsItem) -> float:
    """权威性：来源域名评估。"""
    domain = _domain_of(item.url)
    if not domain:
        return 0.4
    for ad in AUTHORITY_DOMAINS:
        if domain == ad or domain.endswith(ad):
            return 1.0
    return 0.5


def score_completeness(item: models.NewsItem) -> float:
    """完整度：title + summary + content + url 齐备程度。"""
    parts = [
        bool((item.title or "").strip()),
        bool((item.summary or "").strip()),
        len((item.content or "").strip()) >= MIN_BODY_LEN,
        bool((item.url or "").strip()),
    ]
    return _clamp(sum(0.25 for p in parts if p))


def _redline_revalidate(item: models.NewsItem) -> List[str]:
    """服务端再校验（镜像 crawler R2 / R3 / R4）。返回触发原因列表；空 = 通过。

    红线不参与 score（C2 评分与红线解耦），仅做标记。
    """
    reasons: List[str] = []
    body = (item.content or "").strip()
    # R2 正文非空（C2 硬约束）
    if len(body) < MIN_BODY_LEN:
        reasons.append(f"R2:正文过短或缺失 ({len(body)}<{MIN_BODY_LEN})")
    # R3 关键词红线
    haystack = f"{item.title} {item.content} {item.summary}".lower()
    for kw in KEYWORD_BLACKLIST:
        if kw and kw.lower() in haystack:
            reasons.append(f"R3:命中敏感词 ({kw})")
            break
    return reasons


def recommend_items(
    rows: List[models.NewsItem],
    weights: Optional[RecommendWeights] = None,
) -> List[dict]:
    """对一批 NewsItem 计算推荐评分，返回按 score 降序的字典列表。

    每个元素含 NewsItem 全部字段 + ``score`` / ``passed`` / ``dropReason``。
    ``score`` 由维度权重计算；``passed`` / ``dropReason`` 来自红线再校验（不参与 score）。
    """
    w = weights or RecommendWeights()
    wmap = {
        "relevance": w.relevance,
        "recency": w.recency,
        "authority": w.authority,
        "completeness": w.completeness,
        "dedup": w.dedup,
    }
    total_w = sum(v for v in wmap.values() if v > 0) or 1.0
    now = _now()

    # 第一遍：计算基础四维（dedup 需跨项比较，第二遍处理）
    base: List[Dict] = []
    for it in rows:
        base.append(
            {
                "item": it,
                "dims": {
                    "relevance": score_relevance(it),
                    "recency": score_recency(it, now),
                    "authority": score_authority(it),
                    "completeness": score_completeness(it),
                },
            }
        )

    # 第二遍：dedup（与已选更高分项比对）+ 加权总分 + 红线再校验
    results: List[Dict] = []
    for entry in base:
        it: models.NewsItem = entry["item"]
        dims = entry["dims"]
        # dedup 维度：与已处理（更高分）项相似度
        dedup_score = 1.0
        norm_url = (it.url or "").lower().rstrip("/")
        for prev in results:
            pit: models.NewsItem = prev["item"]
            if norm_url and (pit.url or "").lower().rstrip("/") == norm_url:
                dedup_score = 0.2
                break
            if _title_similarity(it.title or "", pit.title or "") >= DEDUP_THRESHOLD:
                dedup_score = 0.2
                break
        dims["dedup"] = dedup_score

        score = sum(dims[k] * wmap[k] for k in dims) / total_w
        score = _clamp(score)

        drop_reason = _redline_revalidate(it)
        passed = len(drop_reason) == 0

        obj = NewsRecommendItem.model_validate(it)
        obj.score = round(score, 4)
        obj.passed = passed
        obj.dropReason = drop_reason
        results.append({"item": it, "obj": obj})

    results.sort(key=lambda r: r["obj"].score, reverse=True)
    return [r["obj"].model_dump() for r in results]
