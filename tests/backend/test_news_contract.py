# -*- coding: utf-8 -*-
"""
资讯爬虫后端「联调」契约测试（T05）

通过 requests 直接打真实运行的 FastAPI 后端（默认 http://127.0.0.1:8765），
验证三类 crawler action 的接口契约，并覆盖核心验收断言：

  【核心断言 · 正文永不为 summary】
    1. 仅含 summary、无 body 的条目，经 /api/news/validate 必须被丢弃
       reason=no_body（绝不把"长摘要"当正文入库）。
    2. 含真实 body(>=50) 的条目，经 validate 进入 valid。
    3. /api/news/extract 离线（无外网）时返回 success:false 且 content:'' 干净返回、不崩。
    4. /api/news/rss 离线返回 {success,data,count,failedSources} 结构正确。
    5. POST /api/news action 分发器（extract/validate/rss）契约正确。

运行（需先启动后端）：
  cd backend && .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8765 &
  python3 -m pytest tests/backend/test_news_contract.py -v

后端地址可用环境变量 NEWS_BACKEND_URL 覆盖。若后端未启动，本套用例自动 skip（不误判）。
"""
import os
import sys

import pytest
import requests

BACKEND = os.environ.get("NEWS_BACKEND_URL", "http://127.0.0.1:8765").rstrip("/")

# 真实正文（>=50 字符），与"摘要"文本明显不同
REAL_BODY = (
    "真实正文至少五十个字符的真实正文内容用于验证过滤逻辑是否生效"
    "且额外补充足够字符以满足长度要求确保该条目能通过入库校验落库。"
)
SUMMARY_ONLY = "只是一句短摘要"
LONG_SUMMARY = (
    "这是一段足够长的摘要文本用于验证即使摘要本身长度超过五十个字符"
    "只要没有真实正文 body 字段依然必须被丢弃而不是被当成正文入库。"
)  # >=50 字，但仅作 teaser


def _session():
    """构造忽略环境代理的 requests 会话（localhost 直连，穿透公司代理）。"""
    s = requests.Session()
    s.trust_env = False
    s.proxies.update({"http": None, "https": None})
    return s


@pytest.fixture(scope="module")
def http():
    s = _session()
    try:
        r = s.get(BACKEND + "/", timeout=5)
        if r.status_code != 200:
            pytest.skip(f"后端未就绪 (HTTP {r.status_code})")
    except requests.RequestException as e:
        pytest.skip(f"后端不可达，跳过联调用例：{e}")
    return s


def _post(http, path, payload):
    return http.post(
        BACKEND + path,
        json=payload,
        headers={"Content-Type": "application/json"},
        timeout=30,
    )


# ── validate 契约 ────────────────────────────────────────────
def test_validate_drops_summary_only(http):
    """仅摘要、无 body → dropped reason=no_body（核心：摘要永不当正文）"""
    r = _post(http, "/api/news/validate", {
        "items": [{"title": "x", "summary": SUMMARY_ONLY, "source": "srcA"}]
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["success"] is True
    assert d["valid"] == []
    assert len(d["dropped"]) == 1
    assert d["dropped"][0]["reason"] == "no_body"


def test_validate_keeps_real_body(http):
    """含真实 body(>=50) → valid 含该项"""
    r = _post(http, "/api/news/validate", {
        "items": [{"title": "x", "body": REAL_BODY, "source": "srcA"}]
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["valid"]) == 1
    assert d["valid"][0]["body"] == REAL_BODY
    # 核心：进入 valid 的正文绝不等于摘要文本
    assert d["valid"][0]["body"] != SUMMARY_ONLY


def test_validate_long_summary_without_body_is_dropped(http):
    """【核心断言】即便摘要自身 >=50 字，只要无 body 仍被丢弃（摘要永不被当正文）"""
    r = _post(http, "/api/news/validate", {
        "items": [{"title": "x", "summary": LONG_SUMMARY, "source": "srcA"}]
    })
    d = r.json()
    assert len(d["valid"]) == 0
    assert d["dropped"][0]["reason"] == "no_body"


def test_validate_drops_no_source(http):
    r = _post(http, "/api/news/validate", {
        "items": [{"title": "x", "body": REAL_BODY, "source": ""}]
    })
    d = r.json()
    assert len(d["valid"]) == 0
    assert d["dropped"][0]["reason"] == "no_source"


def test_validate_drops_short_body(http):
    r = _post(http, "/api/news/validate", {
        "items": [{"title": "x", "body": "太短", "source": "srcA"}]
    })
    d = r.json()
    assert d["dropped"][0]["reason"] == "body_too_short"


def test_validate_mixed_summary_and_real_body(http):
    """混合：[摘要-only, 真实正文] → valid 只含真实正文，dropped 含摘要-only"""
    r = _post(http, "/api/news/validate", {
        "items": [
            {"title": "s", "summary": SUMMARY_ONLY, "source": "srcA"},
            {"title": "b", "body": REAL_BODY, "source": "srcA"},
        ]
    })
    d = r.json()
    assert len(d["valid"]) == 1 and d["valid"][0]["body"] == REAL_BODY
    assert len(d["dropped"]) == 1 and d["dropped"][0]["reason"] == "no_body"
    # 任何进入 valid 的内容都不允许等于摘要
    for it in d["valid"]:
        assert (it.get("body") or it.get("content") or "") != SUMMARY_ONLY


# ── extract 契约（离线预期）──────────────────────────────────
def test_extract_offline_clean_failure(http):
    """无外网时 extract 必须 success:false 且 content:'' 干净返回、不崩"""
    r = _post(http, "/api/news/extract", {
        "url": "https://nonexistent-domain-qa-12345.invalid/article"
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("success") is False
    assert d.get("content") == ""


# ── rss 契约（离线预期）─────────────────────────────────────
def test_rss_offline_structure(http):
    """无外网时 rss 返回 {success,data,count,failedSources} 结构正确"""
    r = _post(http, "/api/news/rss", {
        "sources": ["https://nonexistent-domain-qa-12345.invalid/rss"]
    })
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["success"] is True
    assert isinstance(d["data"], list)
    assert isinstance(d["count"], int)
    assert isinstance(d["failedSources"], list)
    assert d["count"] == len(d["data"])
    # 离线抓取失败 → data 为空，绝不回填 RSS 摘要当正文
    assert d["data"] == []
    assert len(d["failedSources"]) >= 1


# ── /api/news 分发器契约 ────────────────────────────────────
def test_dispatcher_action_validate(http):
    r = _post(http, "/api/news", {
        "action": "validate",
        "items": [{"title": "x", "summary": SUMMARY_ONLY, "source": "s"}],
    })
    d = r.json()
    assert d["success"] is True
    assert d["dropped"][0]["reason"] == "no_body"


def test_dispatcher_action_extract_offline(http):
    r = _post(http, "/api/news", {
        "action": "extract",
        "url": "https://nonexistent-domain-qa-12345.invalid/article",
    })
    d = r.json()
    assert d.get("success") is False
    assert d.get("content") == ""


def test_dispatcher_unknown_action_400(http):
    r = _post(http, "/api/news", {"action": "bogus", "items": []})
    assert r.status_code == 400


# ── CORS 预检 ──────────────────────────────────────────────
def test_cors_preflight(http):
    r = http.options(
        BACKEND + "/api/news/validate",
        headers={
            "Origin": "http://localhost:8090",
            "Access-Control-Request-Method": "POST",
        },
        timeout=10,
    )
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-origin")


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
