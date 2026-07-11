"""红线引擎 R1-R5 (服务端统一执行, C2 硬约束).

红线定义 (按 T07 任务规范):
  R1 来源 / SSRF    -> 调 ssrf.check_url_safety, 内网/保留地址/非白名单一律拒绝
  R2 正文非空 (C2)  -> body 为空或 < min_body_len 视为无正文, 不通过
  R3 内容安全       -> 命中敏感词/违规词表拦截
  R4 去重           -> url 归一 + 正文 hash + 标题相似度去重
  R5 速率 / 预算    -> 单批不超过 BUDGET 秒; 每源不超过 MAX_PER_SOURCE

每条新闻经 check() 返回 (passed: bool, reasons: List[str])。
reasons 中的元素以 "R1:..."/"R2:..." 等前缀标注触发了哪条红线, 供前端展示。
"""
from __future__ import annotations

import difflib
import hashlib
import os
import time
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from urllib.parse import urlparse

from app import config as _cfg
from app import ssrf

# 默认敏感词 / 违规词表 (可经环境变量 REDLINE_KEYWORD_BLACKLIST 覆盖)
DEFAULT_KEYWORDS: List[str] = [
    "赌博",
    "博彩",
    "私彩",
    "色情",
    "代开发票",
    "违规广告",
    "casino",
    "porn",
    "pornography",
]


@dataclass
class RedlineConfig:
    """红线配置, 可由环境变量 / data-service redline_config 覆盖。"""

    min_body_len: int = 200
    source_blacklist: List[str] = field(default_factory=list)
    keyword_blacklist: List[str] = field(default_factory=list)
    dedup_threshold: float = 0.85
    budget: float = 45.0          # 单批预算 (秒)
    max_per_source: int = 10      # 每源上限
    allowed_hosts: Optional[List[str]] = None


@dataclass
class NewsCandidate:
    """待校验的新闻候选。"""

    title: str
    url: str
    source: str = ""
    content: str = ""
    summary: str = ""
    published_at: Optional[str] = None


def _csv(name: str, default: Optional[List[str]] = None) -> List[str]:
    val = os.getenv(name)
    if not val:
        return list(default or [])
    return [v.strip() for v in val.split(",") if v.strip()]


def default_config() -> RedlineConfig:
    """基于环境变量构造默认红线配置。"""
    return RedlineConfig(
        min_body_len=int(os.getenv("REDLINE_MIN_BODY_LEN", str(_cfg.REDLINE_MIN_BODY_LEN))),
        source_blacklist=_csv("REDLINE_SOURCE_BLACKLIST"),
        keyword_blacklist=_csv("REDLINE_KEYWORD_BLACKLIST") or list(DEFAULT_KEYWORDS),
        dedup_threshold=float(
            os.getenv("REDLINE_DEDUP_THRESHOLD", str(_cfg.REDLINE_DEDUP_THRESHOLD))
        ),
        budget=_cfg.BUDGET,
        max_per_source=_cfg.MAX_PER_SOURCE,
        allowed_hosts=_csv("REDLINE_ALLOWED_HOSTS") or None,
    )


def normalize_url(url: str) -> str:
    """url 归一: 小写 scheme+host, 去掉 fragment, 去路径尾部斜杠。"""
    if not url:
        return ""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    path = parsed.path.rstrip("/")
    if not path:
        path = ""
    norm = f"{parsed.scheme.lower()}://{host}{path}"
    if parsed.query:
        norm = f"{norm}?{parsed.query}"
    return norm


def content_hash(content: str) -> str:
    return hashlib.sha256(content.strip().encode("utf-8")).hexdigest()


def _title_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()


class RedlineEngine:
    """红线引擎实例, 通常一个抓取批次对应一个实例 (用于 R5 预算/去重跨条目跟踪)。"""

    def __init__(self, cfg: Optional[RedlineConfig] = None):
        self.config = cfg or default_config()
        self.started_at = time.monotonic()
        self._source_counts: dict = {}
        self._seen_urls: set = set()
        self._seen_hashes: set = set()
        self._seen_titles: List[str] = []

    def reset(self) -> None:
        """清空批次状态 (去重集合 / 计数 / 计时)。"""
        self.started_at = time.monotonic()
        self._source_counts.clear()
        self._seen_urls.clear()
        self._seen_hashes.clear()
        self._seen_titles.clear()

    def check(
        self, item: NewsCandidate, source: Optional[str] = None
    ) -> Tuple[bool, List[str]]:
        """对单条新闻执行 R1-R5, 返回 (passed, reasons)。

        注意: 无论通过与否都会登记去重指纹 (url/hash/title), 保证真实重复稳定拦截。
        """
        reasons: List[str] = []

        # ---- R1 来源 / SSRF ----
        safe, reason = ssrf.check_url_safety(item.url, self.config.allowed_hosts)
        if not safe:
            reasons.append(f"R1:{reason}")

        # ---- R2 正文非空 (C2) ----
        body = (item.content or "").strip()
        if len(body) < self.config.min_body_len:
            reasons.append(
                f"R2:正文过短或缺失 ({len(body)}<{self.config.min_body_len})"
            )

        # ---- R3 内容安全 (敏感词) ----
        if self.config.keyword_blacklist:
            haystack = f"{item.title} {item.content} {item.summary}".lower()
            for kw in self.config.keyword_blacklist:
                if kw and kw.lower() in haystack:
                    reasons.append(f"R3:命中敏感词 ({kw})")
                    break

        # ---- R4 去重 (url 归一 + 正文 hash + 标题相似) ----
        nu = normalize_url(item.url)
        if nu and nu in self._seen_urls:
            reasons.append("R4:重复链接 (url 归一)")
        if body:
            h = content_hash(body)
            if h in self._seen_hashes:
                reasons.append("R4:重复正文 (hash)")
        if item.title:
            for seen_title in self._seen_titles:
                if _title_similarity(item.title, seen_title) >= self.config.dedup_threshold:
                    reasons.append("R4:标题高度相似 (重复)")
                    break

        # ---- R5 速率 / 预算 ----
        elapsed = time.monotonic() - self.started_at
        if elapsed > self.config.budget:
            reasons.append(f"R5:单批预算超时 ({elapsed:.1f}s>{self.config.budget:.0f}s)")
        if source:
            count = self._source_counts.get(source, 0)
            if count >= self.config.max_per_source:
                reasons.append(
                    f"R5:单源超额 ({source} >= {self.config.max_per_source})"
                )

        # ---- 登记去重指纹 (无论通过与否) ----
        if nu:
            self._seen_urls.add(nu)
        if body:
            self._seen_hashes.add(content_hash(body))
        if item.title:
            self._seen_titles.append(item.title)
        if source:
            self._source_counts[source] = self._source_counts.get(source, 0) + 1

        passed = len(reasons) == 0
        return (passed, reasons)
