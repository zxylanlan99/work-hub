# -*- coding: utf-8 -*-
"""
news-crawler 后端自动测试（验收标准 3：四要素 + 入库硬性过滤 + SSRF）

覆盖:
  - parse_rss_feed: RSS/Atom -> 四要素(title/summary/source/body)
  - filter_news_items: 无正文/正文过短/无来源 必须丢弃；合规项放行
  - extract_body: 跳过 script/style 标签
  - index.main_handler: 按 action 路由(rss/extract/validate)、SSRF 拦截、OPTIONS/CORS、未知 action 404

运行:
  python3 tests/test_news_crawler.py
  (或 pytest tests/test_news_crawler.py)
"""
import os
import sys
import json

# 将 functions/news-crawler 加入 import 路径
_HERE = os.path.dirname(os.path.abspath(__file__))
_FN_DIR = os.path.join(os.path.dirname(_HERE), 'functions', 'news-crawler')
if _FN_DIR not in sys.path:
    sys.path.insert(0, _FN_DIR)

import news_utils  # noqa: E402
import index  # noqa: E402

# 保证 >= 50 字，用于通过"正文过短"校验
LONG_BODY = '内容' * 30  # 60 字

SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>测试频道</title>
    <item>
      <title>合规资讯标题</title>
      <link>https://news.example.com/a1</link>
      <description>这是一段摘要内容用于验证四要素解析是否正常。</description>
      <pubDate>Wed, 08 Jul 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"""

SAMPLE_ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Atom合规标题</title>
    <link href="https://atom.example.com/b1"/>
    <summary>Atom 摘要内容。</summary>
    <content>Atom 正文内容用于通过校验必须大于五十个字符才能入库通过验证。</content>
    <published>2026-07-08T10:00:00Z</published>
  </entry>
</feed>"""


def _ev(method, body, path='/news-crawler'):
    return {'httpMethod': method, 'path': path, 'body': json.dumps(body) if body is not None else ''}


def test_parse_rss_feed_four_elements():
    items = news_utils.parse_rss_feed(SAMPLE_RSS, 'https://news.example.com/rss')
    assert len(items) == 1, '应解析出 1 条'
    it = items[0]
    for k in ('title', 'summary', 'source', 'body'):
        assert k in it, '缺少四要素字段: %s' % k
    assert it['title'] == '合规资讯标题'
    # RSS 项无独立 sourceName 时，source 回退为整条 feed URL（与后端 news_utils 一致）
    assert it['source'] == 'https://news.example.com/rss', 'source 实际=%s' % it['source']
    assert it['body'] == '这是一段摘要内容用于验证四要素解析是否正常。'


def test_parse_atom_four_elements():
    items = news_utils.parse_rss_feed(SAMPLE_ATOM, 'https://atom.example.com/feed')
    assert len(items) == 1
    it = items[0]
    assert it['title'] == 'Atom合规标题'
    assert 'Atom 正文内容' in it['body']
    assert it['source'] == 'https://atom.example.com/feed'


def test_filter_drops_no_body():
    res = news_utils.filter_news_items([
        {'title': 't', 'body': '', 'source': 'https://e.com'},
    ])
    assert len(res['valid']) == 0 and res['dropped'][0]['reason'] == 'no_body'


def test_filter_drops_short_body():
    res = news_utils.filter_news_items([
        {'title': 't', 'body': '太短', 'source': 'https://e.com'},
    ])
    assert len(res['valid']) == 0 and res['dropped'][0]['reason'] == 'body_too_short'


def test_filter_drops_no_source():
    res = news_utils.filter_news_items([
        {'title': 't', 'body': LONG_BODY, 'source': ''},
    ])
    assert len(res['valid']) == 0 and res['dropped'][0]['reason'] == 'no_source'


def test_filter_keeps_valid():
    res = news_utils.filter_news_items([
        {'title': '合规', 'body': LONG_BODY, 'source': 'https://news.example.com/a1'},
    ])
    assert len(res['valid']) == 1 and res['dropped'] == []


def test_extract_body_strips_script():
    html = '<html><head><script>var x=1;</script></head><body><p>真实正文内容在此。</p></body></html>'
    text = news_utils.extract_body(html)
    assert 'var x=1' not in text
    assert '真实正文内容在此' in text


def test_handler_validate_action():
    r = index.main_handler(_ev('POST', {'action': 'validate', 'items': [
        {'title': '合规', 'body': LONG_BODY, 'source': 'https://news.example.com/a1'},
        {'title': '无来源', 'body': LONG_BODY, 'source': ''},
    ]}), None)
    assert r['statusCode'] == 200
    d = json.loads(r['body'])
    assert len(d['valid']) == 1 and d['dropped'][0]['reason'] == 'no_source'


def test_handler_ssrf_rejects_file():
    r = index.main_handler(_ev('POST', {'action': 'extract', 'url': 'file:///etc/passwd'}), None)
    assert r['statusCode'] == 200
    assert '不支持的协议' in json.loads(r['body'])['error']


def test_handler_ssrf_rejects_metadata_ip():
    r = index.main_handler(_ev('POST', {'action': 'extract', 'url': 'http://169.254.169.254/latest'}), None)
    assert r['statusCode'] == 200
    assert '不支持的协议' in json.loads(r['body'])['error']


def test_handler_options_cors():
    r = index.main_handler(_ev('OPTIONS', {}), None)
    assert r['statusCode'] == 204
    assert r['headers'].get('Access-Control-Allow-Origin')


def test_handler_unknown_action_404():
    r = index.main_handler(_ev('POST', {'action': 'bogus', 'items': []}), None)
    assert r['statusCode'] == 404


def _run_all():
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_') and callable(v)]
    passed = 0
    for t in tests:
        try:
            t()
            print('[PASS]', t.__name__)
            passed += 1
        except AssertionError as e:
            print('[FAIL]', t.__name__, '->', e)
        except Exception as e:  # noqa: BLE001
            print('[ERROR]', t.__name__, '->', repr(e))
    print('\n总计 %d 项 | 通过 %d | 失败 %d' % (len(tests), passed, len(tests) - passed))
    return passed == len(tests)


if __name__ == '__main__':
    ok = _run_all()
    sys.exit(0 if ok else 1)
