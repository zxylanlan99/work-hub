# -*- coding: utf-8 -*-
"""
资讯爬虫「服务端逐篇抽正文」离线确定性测试（T05 · 核心断言）

不依赖外网：通过 monkeypatch urllib.request.urlopen / socket.getaddrinfo，
让后端在离线环境下仍执行真实的 _fetch_rss_with_extract 与 _fetch_article_body 逻辑，
验证【正文永不为 summary】的硬规则在服务端成立：

  1. _fetch_rss_with_extract：解析后先清空 content/body，再填「真实抽取的正文」；
     RSS 的 <description>(摘要) 绝不回填进 body；最终 body == 真实正文 != 摘要。
  2. _fetch_article_body：返回扁平对象
     {success,title,summary,source,body,content,url,length}，
     body == content == 真实正文，summary 仅作 teaser。

仅在能 import backend.app 时运行（需要 chromadb 等依赖，import 较慢）；
若依赖缺失则自动 skip。
"""
import os
import socket
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(os.path.dirname(_HERE))
sys.path.insert(0, os.path.join(_REPO, "backend"))

try:
    import app  # noqa: E402
    _CAN_IMPORT = True
except Exception as _e:  # noqa: BLE001
    _CAN_IMPORT = False
    _IMPORT_ERR = _e

import pytest
from unittest import mock

pytestmark = pytest.mark.skipif(
    not _CAN_IMPORT, reason="无法 import backend.app（缺少依赖）: %s" % (
        _IMPORT_ERR if not _CAN_IMPORT else "")
)

RSS_URL = "https://fake-news-qa.example.com/rss"
ARTICLE_URL = "https://fake-news-qa.example.com/article/1"

SUMMARY_TEXT = "这只是 RSS 描述字段里的一句短摘要，绝不能被当成正文入库。"
REAL_BODY = (
    "这是从文章 HTML 正文中抽取出的真实段落内容。我们验证服务端会先清空摘要"
    "再把真实正文写入 body 字段，绝不让摘要冒充正文，也不把脚本样式混进正文。"
)

RSS_XML = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>测试频道</title>
    <item>
      <title>测试资讯标题</title>
      <link>{ARTICLE_URL}</link>
      <description>{SUMMARY_TEXT}</description>
      <pubDate>Wed, 08 Jul 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"""

ARTICLE_HTML = f"""<html>
<head><title>测试资讯标题</title><script>var t=1;console.log('x');</script></head>
<body>
  <nav>导航栏不应进入正文</nav>
  <article><p>{REAL_BODY}</p></article>
  <footer>页脚版权信息不应进入正文</footer>
</body></html>"""


class _FakeResp:
    def __init__(self, data: bytes):
        self._d = data

    def read(self):
        return self._d

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _fake_getaddrinfo(host, port, *a, **k):
    # 返回一个公网 IP，绕过 SSRF 私网/保留地址校验（离线环境下让逻辑继续）
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]


def _mock_urlopen(request, *args, **kwargs):
    url = getattr(request, "full_url", None) or str(request)
    if url == RSS_URL:
        return _FakeResp(RSS_XML.encode("utf-8"))
    if url == ARTICLE_URL:
        return _FakeResp(ARTICLE_HTML.encode("utf-8"))
    raise AssertionError("unexpected urlopen: " + url)


def test_rss_with_extract_fills_real_body_not_summary():
    """【核心断言】服务端 RSS 抽取：body=真实正文，绝不等于摘要"""
    with mock.patch("socket.getaddrinfo", _fake_getaddrinfo), \
         mock.patch("urllib.request.urlopen", _mock_urlopen):
        result = app._fetch_rss_with_extract([RSS_URL])

    assert result["success"] is True
    assert len(result["data"]) == 1
    art = result["data"][0]
    # 真实正文被抽取进 body
    assert REAL_BODY in art["body"]
    # 摘要绝未回填进 body
    assert art["body"] != SUMMARY_TEXT
    assert SUMMARY_TEXT not in art["body"]
    # content 与 body 一致（四要素契约）
    assert art["content"] == art["body"]
    # summary 字段保留原始摘要（仅作 teaser，未污染正文）
    assert art["summary"] == SUMMARY_TEXT


def test_extract_returns_flat_object_with_real_body():
    """【核心断言】extract 返回扁平四要素对象，body==content==真实正文"""
    with mock.patch("socket.getaddrinfo", _fake_getaddrinfo), \
         mock.patch("urllib.request.urlopen", _mock_urlopen):
        data = app._fetch_article_body(ARTICLE_URL, timeout=5)

    for key in ("success", "title", "summary", "source", "body", "content", "url", "length"):
        assert key in data, "extract 扁平对象缺少字段: %s" % key
    assert data["success"] is True
    assert REAL_BODY in data["body"]
    assert data["body"] == data["content"]
    assert data["body"] != data["summary"]
    assert data["url"] == ARTICLE_URL
    assert data["length"] == len(data["body"])


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
