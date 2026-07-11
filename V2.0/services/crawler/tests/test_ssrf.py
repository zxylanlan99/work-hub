"""R1 · SSRF / 来源防护 纯函数单测 (无网络依赖)。

IP 字面量走真实 getaddrinfo (不需要外网); 域名场景用 monkeypatch 注入解析结果,
保证离线环境也能稳定跑通。
"""
import pytest

from app import ssrf


def test_rejects_non_http():
    ok, reason = ssrf.check_url_safety("ftp://example.com/x")
    assert not ok
    assert reason


def test_rejects_empty():
    ok, _ = ssrf.check_url_safety("")
    assert not ok


def test_rejects_localhost():
    ok, _ = ssrf.check_url_safety("http://localhost/x")
    assert not ok


def test_rejects_loopback_ip():
    ok, _ = ssrf.check_url_safety("http://127.0.0.1/x")
    assert not ok


def test_rejects_metadata_ip():
    ok, _ = ssrf.check_url_safety("http://169.254.169.254/latest")
    assert not ok


def test_allows_public_ip_literal():
    ok, reason = ssrf.check_url_safety("http://8.8.8.8/x")
    assert ok, reason


def test_rejects_10_net(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: ["10.1.2.3"])
    ok, _ = ssrf.check_url_safety("http://intranet/x")
    assert not ok


def test_rejects_192_168(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: ["192.168.0.5"])
    ok, _ = ssrf.check_url_safety("http://cam/x")
    assert not ok


def test_rejects_172_16(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: ["172.16.5.5"])
    ok, _ = ssrf.check_url_safety("http://cam/x")
    assert not ok


def test_rejects_169_254(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: ["169.254.1.1"])
    ok, _ = ssrf.check_url_safety("http://meta/x")
    assert not ok


def test_allowlist_blocks_unlisted(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: ["93.184.216.34"])
    ok, _ = ssrf.check_url_safety("http://other.com/x", allowed_hosts=["trusted.com"])
    assert not ok


def test_allowlist_allows_listed_subdomain(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: ["93.184.216.34"])
    ok, reason = ssrf.check_url_safety(
        "http://news.trusted.com/x", allowed_hosts=["trusted.com"]
    )
    assert ok, reason


def test_rejects_unresolvable(monkeypatch):
    monkeypatch.setattr(ssrf, "_resolve_host_ips", lambda h: [])
    ok, _ = ssrf.check_url_safety("http://nope.invalid/x")
    assert not ok
