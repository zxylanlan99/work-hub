"""
验收标准 3 · 资讯爬取完整性 + 入库前硬性过滤
覆盖：web_search / fetch_rss / extract 返回 标题/摘要/来源/正文 四要素；
过滤无正文、正文过短、无来源的资讯。
"""
import pytest

from news_utils import (
    normalize_web_result,
    parse_rss_feed,
    extract_body,
    extract_meta,
    is_valid_news_item,
    filter_news_items,
    build_news_document,
)

FOUR_KEYS = ('title', 'summary', 'source', 'body')

# 超过 MIN_BODY_LEN(50) 的正文，用于构造"应通过过滤"的样例
LONG_BODY = '正文' * 30


def test_web_result_four_elements():
    block = (
        '<li class="b_algo">'
        '<h2><a href="https://news.example.com/a1">示例新闻标题</a></h2>'
        '<div class="b_caption"><p>这是一段摘要内容，描述新闻要点。</p></div>'
        '</li>'
    )
    item = normalize_web_result(block)
    assert item is not None
    assert all(k in item for k in FOUR_KEYS), f"缺少四要素之一: {item}"
    assert item['title'] == '示例新闻标题'
    assert item['source'] == 'Bing'
    assert item['url'] == 'https://news.example.com/a1'


def test_rss_four_elements():
    xml = (
        '<?xml version="1.0"?><rss version="2.0"><channel>'
        '<title>测试频道</title>'
        '<item><title>RSS 文章一</title>'
        '<link>https://rss.example.com/p1</link>'
        '<description><![CDATA[<p>正文内容摘要段落</p>]]></description>'
        '<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>'
        '</channel></rss>'
    )
    items = parse_rss_feed(xml, 'https://rss.example.com/feed.xml')
    assert len(items) == 1
    it = items[0]
    assert all(k in it for k in FOUR_KEYS), f"RSS 缺少四要素: {it}"
    assert it['title'] == 'RSS 文章一'
    assert it['body'] == '正文内容摘要段落'
    assert it['source']  # 来源非空


def test_extract_meta_and_body():
    html = (
        '<html><head><title>页面标题</title>'
        '<meta name="description" content="页面描述摘要"></head>'
        '<body><p>正文第一段内容。</p><p>第二段更长一些用于测试提取效果。</p></body></html>'
    )
    title, desc = extract_meta(html)
    assert title == '页面标题'
    assert desc == '页面描述摘要'
    body = extract_body(html)
    assert '正文第一段内容' in body
    assert '第二段更长一些' in body


def test_filter_drops_no_body():
    item = {'title': 't', 'summary': 's', 'source': 'src', 'body': ''}
    ok, reason = is_valid_news_item(item)
    assert ok is False and reason == 'no_body'


def test_filter_drops_short_body():
    item = {'title': 't', 'summary': 's', 'source': 'src', 'body': '太短'}
    ok, reason = is_valid_news_item(item)
    assert ok is False and reason == 'body_too_short'


def test_filter_drops_no_source():
    item = {'title': 't', 'summary': 's', 'source': '', 'body': LONG_BODY}
    ok, reason = is_valid_news_item(item)
    assert ok is False and reason == 'no_source'


def test_filter_keeps_valid_and_drops_invalid():
    valid = {'title': 't', 'summary': 's', 'source': 'src', 'body': LONG_BODY}
    no_body = {'title': 't', 'summary': 's', 'source': 'src', 'body': ''}
    short = {'title': 't', 'summary': 's', 'source': 'src', 'body': '太短'}
    no_src = {'title': 't', 'summary': 's', 'source': '', 'body': LONG_BODY}

    res = filter_news_items([valid, no_body, short, no_src])
    assert len(res['valid']) == 1
    assert res['valid'][0] is valid
    reasons = {d['reason'] for d in res['dropped']}
    assert reasons == {'no_body', 'body_too_short', 'no_source'}


def test_build_news_document():
    item = {'title': '标题', 'summary': '摘要', 'body': '正文内容'}
    doc = build_news_document(item)
    assert '标题' in doc and '摘要' in doc and '正文内容' in doc
