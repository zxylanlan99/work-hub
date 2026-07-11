"""红线引擎 R1-R5 纯函数单测 (无网络依赖)。

R1/R2/R3/R4 用真实逻辑 (IP 字面量无需网络, 关键词/去重为本地计算)。
域名类 R1 与 R5 预算/单源上限用 monkeypatch / 直接置引擎字段, 保证确定性。
"""
import time

from app import ssrf
from app.redline import NewsCandidate, RedlineConfig, RedlineEngine


# --------------------------------------------------------------------------- #
# R2 正文非空 (C2)
# --------------------------------------------------------------------------- #
def test_r2_empty_body_rejected():
    eng = RedlineEngine(RedlineConfig(min_body_len=200))
    item = NewsCandidate(title="T", url="http://8.8.8.8/a", content="")
    passed, reasons = eng.check(item)
    assert not passed
    assert any(r.startswith("R2") for r in reasons)


def test_r2_short_body_rejected():
    eng = RedlineEngine(RedlineConfig(min_body_len=200))
    item = NewsCandidate(title="T", url="http://8.8.8.8/a", content="x" * 50)
    passed, reasons = eng.check(item)
    assert not passed
    assert any(r.startswith("R2") for r in reasons)


def test_r2_ok_when_body_long_enough():
    eng = RedlineEngine(RedlineConfig(min_body_len=200))
    item = NewsCandidate(title="T", url="http://8.8.8.8/a", content="正文" * 100)
    passed, reasons = eng.check(item)
    assert passed, reasons


# --------------------------------------------------------------------------- #
# R1 来源 / SSRF
# --------------------------------------------------------------------------- #
def test_r1_blocks_localhost():
    eng = RedlineEngine()
    item = NewsCandidate(title="T", url="http://localhost/x", content="正文" * 100)
    passed, reasons = eng.check(item)
    assert not passed
    assert any(r.startswith("R1") for r in reasons)


def test_r1_blocks_loopback_ip():
    eng = RedlineEngine()
    item = NewsCandidate(title="T", url="http://127.0.0.1/x", content="正文" * 100)
    passed, reasons = eng.check(item)
    assert not passed
    assert any(r.startswith("R1") for r in reasons)


def test_r1_blocks_private_via_dns(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: ["10.0.0.5"])
    eng = RedlineEngine()
    item = NewsCandidate(title="T", url="http://internal.example/x", content="正文" * 100)
    passed, reasons = eng.check(item)
    assert not passed
    assert any(r.startswith("R1") for r in reasons)


# --------------------------------------------------------------------------- #
# R3 内容安全 (敏感词)
# --------------------------------------------------------------------------- #
def test_r3_keyword_blocked():
    eng = RedlineEngine(RedlineConfig(keyword_blacklist=["违规词xxx"]))
    item = NewsCandidate(
        title="T", url="http://8.8.8.8/a", content="这是包含违规词xxx的内容" * 20
    )
    passed, reasons = eng.check(item)
    assert not passed
    assert any(r.startswith("R3") for r in reasons)


def test_r3_passes_clean_content():
    eng = RedlineEngine(RedlineConfig(keyword_blacklist=["违规词xxx"]))
    item = NewsCandidate(title="T", url="http://8.8.8.8/a", content="这是一段正常的学习资料正文" * 20)
    passed, reasons = eng.check(item)
    assert passed, reasons


# --------------------------------------------------------------------------- #
# R4 去重 (url 归一 / 正文 hash / 标题相似)
# --------------------------------------------------------------------------- #
def test_r4_dedup_same_url():
    eng = RedlineEngine()
    i1 = NewsCandidate(title="T1", url="http://8.8.8.8/a", content="正文" * 100)
    i2 = NewsCandidate(title="T2", url="http://8.8.8.8/a", content="另一段正文" * 100)
    p1, _ = eng.check(i1)
    p2, r2 = eng.check(i2)
    assert p1
    assert not p2
    assert any(r.startswith("R4") for r in r2)


def test_r4_dedup_same_content_hash():
    eng = RedlineEngine()
    body = "正文" * 100
    i1 = NewsCandidate(title="T1", url="http://8.8.8.8/a", content=body)
    i2 = NewsCandidate(title="T2", url="http://8.8.8.8/b", content=body)
    p1, _ = eng.check(i1)
    p2, r2 = eng.check(i2)
    assert p1
    assert not p2
    assert any(r.startswith("R4") for r in r2)


def test_r4_dedup_similar_title():
    eng = RedlineEngine(RedlineConfig(dedup_threshold=0.85))
    i1 = NewsCandidate(title="人工智能迎来重大突破", url="http://8.8.8.8/a", content="正文" * 100)
    i2 = NewsCandidate(title="人工智能迎来重大突破", url="http://8.8.8.8/b", content="不同正文" * 100)
    p1, _ = eng.check(i1)
    p2, r2 = eng.check(i2)
    assert p1
    assert not p2
    assert any(r.startswith("R4") for r in r2)


# --------------------------------------------------------------------------- #
# R5 速率 / 预算
# --------------------------------------------------------------------------- #
def test_r5_budget_exceeded():
    cfg = RedlineConfig()
    cfg.budget = 0.5
    eng = RedlineEngine(cfg)
    eng.started_at = time.monotonic() - 1.0  # 假装已过去 1 秒 (> 预算 0.5)
    item = NewsCandidate(title="T", url="http://8.8.8.8/a", content="正文" * 100)
    passed, reasons = eng.check(item)
    assert not passed
    assert any(r.startswith("R5") for r in reasons)


def test_r5_source_cap():
    cfg = RedlineConfig()
    cfg.max_per_source = 1
    eng = RedlineEngine(cfg)
    i1 = NewsCandidate(title="T1", url="http://8.8.8.8/a", content="正文" * 100)
    i2 = NewsCandidate(title="T2", url="http://8.8.8.8/b", content="正文" * 100)
    p1, _ = eng.check(i1, source="src")
    p2, r2 = eng.check(i2, source="src")
    assert p1
    assert not p2
    assert any(r.startswith("R5") for r in r2)


def test_full_pass_clean_item():
    eng = RedlineEngine()
    item = NewsCandidate(
        title="AI 学习新方法", url="http://8.8.8.8/a", content="这是一篇关于人工智能学习的长正文" * 30
    )
    passed, reasons = eng.check(item)
    assert passed, reasons
    assert reasons == []
