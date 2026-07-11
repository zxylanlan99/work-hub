# -*- coding: utf-8 -*-
"""
资讯爬虫「入库门禁」单元测试（T05）

直接 import backend/news_utils.py（纯标准库，零第三方依赖，秒级运行），
验证 filter_news_items 的硬性过滤规则与 extract_body 正文抽取质量。

核心关注：【正文永不为 summary】
  - filter_news_items 以 body 字段为唯一正文判定来源，summary 永远不参与正文判定。
  - 无 body / 正文过短 / 无来源 → 丢弃；合规真实正文 → 放行。
  - 即便摘要自身很长，只要没 body 仍被丢弃（摘要绝不被当正文）。

运行：
  cd backend && .venv/bin/python -m pytest ../tests/backend/test_news_gatekeeper.py -v
  （或从仓库根：python3 -m pytest tests/backend/test_news_gatekeeper.py -v）
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
# backend/news_utils.py 在同仓库 backend/ 目录
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "..", "backend"))

import news_utils  # noqa: E402

LONG_BODY = "内容" * 30  # 60 字
REAL_BODY = (
    "真实正文至少五十个字符的真实正文内容用于验证过滤逻辑是否生效"
    "且额外补充足够字符以满足长度要求确保该条目能通过入库校验落库。"
)
LONG_SUMMARY = (
    "这是一段足够长的摘要文本用于验证即使摘要本身长度超过五十个字符"
    "只要没有真实正文 body 字段依然必须被丢弃而不是被当成正文入库。"
)


def test_filter_drops_no_body():
    res = news_utils.filter_news_items(
        [{"title": "t", "body": "", "source": "https://e.com"}]
    )
    assert len(res["valid"]) == 0
    assert res["dropped"][0]["reason"] == "no_body"


def test_filter_drops_short_body():
    res = news_utils.filter_news_items(
        [{"title": "t", "body": "太短", "source": "https://e.com"}]
    )
    assert res["dropped"][0]["reason"] == "body_too_short"


def test_filter_drops_no_source():
    res = news_utils.filter_news_items(
        [{"title": "t", "body": LONG_BODY, "source": ""}]
    )
    assert res["dropped"][0]["reason"] == "no_source"


def test_filter_keeps_valid_real_body():
    res = news_utils.filter_news_items(
        [{"title": "合规", "body": REAL_BODY, "source": "https://news.example.com/a1"}]
    )
    assert len(res["valid"]) == 1
    assert res["dropped"] == []


def test_filter_long_summary_without_body_is_dropped():
    """【核心断言】长摘要无 body → 丢弃；摘要永不被当正文"""
    res = news_utils.filter_news_items(
        [{"title": "t", "summary": LONG_SUMMARY, "source": "https://e.com"}]
    )
    assert len(res["valid"]) == 0
    assert res["dropped"][0]["reason"] == "no_body"


def test_validate_news_item_no_summary_fallback():
    """is_valid_news_item 仅看 body，summary 不参与——契约说明：正文来源唯一是 body"""
    ok, reason = news_utils.is_valid_news_item(
        {"title": "t", "summary": LONG_SUMMARY, "source": "s"}
    )
    assert ok is False and reason == "no_body"


def test_extract_body_strips_script_and_style():
    html = (
        "<html><head><script>var x=1;alert('x');</script>"
        "<style>.a{color:red}</style></head>"
        "<body><p>真实正文第一段内容在这里。</p>"
        "<p>真实正文第二段内容也在这里展示。</p></body></html>"
    )
    text = news_utils.extract_body(html)
    assert "var x=1" not in text
    assert ".a{color:red}" not in text
    assert "真实正文第一段内容在这里" in text
    assert "真实正文第二段内容也在这里展示" in text


def test_extract_body_preserves_paragraphs():
    html = "<body><div>第一段真实内容。</div><div>第二段真实内容。</div></body>"
    text = news_utils.extract_body(html)
    # 段落间应有空行分隔（块级还原），且两段都在
    assert "第一段真实内容" in text and "第二段真实内容" in text
    assert "\n\n" in text


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
