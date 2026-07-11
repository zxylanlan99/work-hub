"""正文抽取 (trafilatura 优先, beautifulsoup4 兜底).

核心约束 (C2): 只接受有实质正文的条目; 无法抽取到正文则返回 None,
由 redline R2 判定为不通过, 绝不入库。
"""
from __future__ import annotations

import requests
from bs4 import BeautifulSoup
from trafilatura import extract as trafilatura_extract

from app import config
from app.ssrf import check_url_safety

# 正文截断长度 (字符)
MAX_CONTENT_LEN: int = 8000

# 兜底抽取时移除的噪声标签
_NOISE_TAGS = ("script", "style", "nav", "footer", "header", "aside", "form", "iframe")


def fetch_html(url: str, timeout: float = config.FETCH_TIMEOUT) -> Optional[str]:
    """抓取页面 HTML, 先做 SSRF 校验, 失败/不可达返回 None。"""
    safe, _reason = check_url_safety(url)
    if not safe:
        return None
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": config.USER_AGENT},
            verify=True,
            allow_redirects=True,
        )
        resp.raise_for_status()
        # 优先用明确声明的编码, 否则让 requests 推断
        resp.encoding = resp.encoding or resp.apparent_encoding
        return resp.text
    except Exception:
        return None


def extract_content(
    url: str, html: Optional[str] = None, max_len: int = MAX_CONTENT_LEN
) -> Optional[str]:
    """抽取正文文本。

    Args:
        url: 文章地址 (用于 SSRF 校验; 若已传入 html 仍会校验 url 安全性)
        html: 预抓取的 HTML; 为 None 时内部调用 fetch_html
        max_len: 截断长度, 默认 8000

    Returns:
        正文文本 (已截断); 无正文返回 None
    """
    if html is None:
        html = fetch_html(url)
    if not html:
        return None

    text: Optional[str] = None

    # 1) trafilatura 主路径 (质量最高)
    try:
        text = trafilatura_extract(
            html,
            include_comments=False,
            include_tables=False,
            favor_precision=True,
        )
    except Exception:
        text = None

    # 2) beautifulsoup4 兜底
    if not text or not text.strip():
        try:
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(_NOISE_TAGS):
                tag.decompose()
            raw = soup.get_text(separator="\n")
            lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
            text = "\n".join(lines)
        except Exception:
            text = None

    if not text or not text.strip():
        return None

    text = text.strip()
    if len(text) > max_len:
        text = text[:max_len]
    return text or None
