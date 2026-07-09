"""
资讯抓取与归一化工具（验收标准 3 · 四要素 + 入库过滤）

仅依赖标准库，便于在测试中直接导入（无需 chromadb / sentence-transformers）。

提供：
- parse_rss_feed(xml_text, source_url)       解析 RSS/Atom，返回归一化资讯项
- extract_body(html_text)                   从 HTML 提取正文（正文/body）
- extract_meta(html_text)                   提取 <title> 与 <meta description>
- normalize_web_result(block)              归一化单条 Bing 搜索结果
- normalize_rss_item(article, source_url)  归一化单条 RSS 项
- is_valid_news_item(item, min_body_len)   入库前硬性校验
- filter_news_items(items, min_body_len)   批量过滤，返回 {valid, dropped}
- build_news_document(item)                组合标题/摘要/正文用于切片入库

四要素统一字段：title（标题）、summary（摘要）、source（来源）、body（正文）
"""
import html as _html
import re as _re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urlparse

# 正文最少字符数（低于此值视为"无正文"）
MIN_BODY_LEN = 50


def _host_of(url: str) -> str:
    try:
        netloc = urlparse(url).netloc
        return netloc or ''
    except Exception:
        return ''


# ── RSS / Atom 解析 ────────────────────────────────────────
def parse_rss_feed(xml_text: str, source_url: str) -> list:
    """解析单个 RSS/Atom feed XML，返回归一化资讯项列表"""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        return []

    articles = []
    ns = {'atom': 'http://www.w3.org/2005/Atom'}

    if root.tag == 'rss' or root.tag.endswith('rss'):
        channel = root.find('channel')
        if channel is None:
            return []
        for item in channel.findall('item'):
            title = item.findtext('title', default='').strip()
            link = item.findtext('link', default='').strip()
            desc = item.findtext('description', default='').strip()
            pub_date = item.findtext('pubDate', default='')
            articles.append(_normalize_rss_item({
                'title': title,
                'sourceUrl': link,
                'sourceName': source_url,
                'summary': _re.sub(r'<[^>]+>', '', desc),
                'content': _re.sub(r'<[^>]+>', '', desc),
                'publishedAt': pub_date,
            }, source_url))
    elif root.tag.endswith('feed') or root.tag == '{http://www.w3.org/2005/Atom}feed':
        for entry in root.findall('atom:entry', ns):
            title = entry.findtext('atom:title', default='', namespaces=ns).strip()
            link_el = entry.find('atom:link', ns)
            link = link_el.get('href', '') if link_el is not None else ''
            summary = entry.findtext('atom:summary', default='', namespaces=ns).strip()
            content = entry.findtext('atom:content', default='', namespaces=ns).strip()
            published = entry.findtext('atom:published', default='', namespaces=ns).strip()
            if not published:
                published = entry.findtext('atom:updated', default='', namespaces=ns).strip()
            articles.append(_normalize_rss_item({
                'title': title,
                'sourceUrl': link,
                'sourceName': source_url,
                'summary': _re.sub(r'<[^>]+>', '', summary or content),
                'content': _re.sub(r'<[^>]+>', '', content or summary),
                'publishedAt': published,
            }, source_url))

    return articles


def _normalize_rss_item(article: dict, source_url: str) -> dict:
    """将 RSS 项补齐为四要素标准结构"""
    source = (article.get('sourceName') or '').strip() or _host_of(source_url)
    body = (article.get('content') or article.get('summary') or '').strip()
    return {
        'title': (article.get('title') or '').strip(),
        'summary': (article.get('summary') or '').strip(),
        'source': source,
        'body': body,
        'url': article.get('sourceUrl') or source_url,
        'sourceUrl': article.get('sourceUrl') or source_url,
        'publishedAt': article.get('publishedAt', ''),
    }


# ── HTML 正文 / 元信息提取 ─────────────────────────────────
class _BodyExtractor(HTMLParser):
    """从 HTML 中提取正文文本，跳过 script/style/nav/header/footer 等标签"""
    SKIP_TAGS = {'script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'svg', 'iframe'}

    def __init__(self):
        super().__init__()
        self._skip_depth = 0
        self._chunks = []

    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            pass
        if tag in self.SKIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag):
        if tag in self.SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data):
        if self._skip_depth > 0:
            return
        text = data.strip()
        if text and len(text) > 2:
            self._chunks.append(text)

    def get_text(self) -> str:
        return '\n'.join(self._chunks)


def extract_body(html_text: str, max_len: int = 20000) -> str:
    """提取正文文本（body），过长截断"""
    parser = _BodyExtractor()
    parser.feed(html_text)
    text = parser.get_text()
    if len(text) > max_len:
        text = text[:max_len]
    return text


def extract_meta(html_text: str):
    """返回 (title, description)"""
    title_m = _re.search(r'<title[^>]*>(.*?)</title>', html_text, _re.S | _re.I)
    title = ''
    if title_m:
        title = _html.unescape(_re.sub(r'<[^>]+>', '', title_m.group(1))).strip()

    desc_m = _re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
        html_text, _re.S | _re.I
    )
    if not desc_m:
        desc_m = _re.search(
            r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']',
            html_text, _re.S | _re.I
        )
    desc = _html.unescape(desc_m.group(1).strip()) if desc_m else ''
    return title, desc


# ── Bing 搜索结果归一化 ─────────────────────────────────────
def normalize_web_result(block: str) -> dict | None:
    """归一化单条 Bing 搜索结果块为四要素标准结构"""
    title_match = _re.search(
        r'<h2[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?</h2>',
        block, _re.S
    )
    if not title_match:
        return None

    summary_match = _re.search(
        r'<div class="b_caption"[^>]*>.*?<p[^>]*>(.*?)</p>.*?</div>',
        block, _re.S
    )

    raw_url = _html.unescape(title_match.group(1))
    title = _html.unescape(_re.sub(r'<[^>]+>', '', title_match.group(2))).strip()
    summary = ''
    if summary_match:
        summary = _html.unescape(_re.sub(r'<[^>]+>', '', summary_match.group(1))).strip()

    clean_url = raw_url
    if clean_url.startswith('/'):
        clean_url = f"https://www.bing.com{clean_url}"

    return {
        'title': title,
        'summary': summary,
        'source': 'Bing',
        'body': '',  # 搜索结果页不抓取正文，正文需经 extract 二次获取
        'url': clean_url,
        'sourceUrl': clean_url,
    }


# ── 入库前硬性过滤（验收标准 3）────────────────────────────
def is_valid_news_item(item: dict, min_body_len: int = MIN_BODY_LEN) -> tuple:
    """
    校验单条资讯是否满足入库条件：
      - body 非空且长度 >= min_body_len（丢弃无正文/过短）
      - source 非空（丢弃无来源）
    返回 (bool, reason)
    """
    if not isinstance(item, dict):
        return False, 'not_a_dict'
    body = (item.get('body') or '').strip()
    source = (item.get('source') or '').strip()
    if not body:
        return False, 'no_body'
    if len(body) < min_body_len:
        return False, 'body_too_short'
    if not source:
        return False, 'no_source'
    return True, 'ok'


def filter_news_items(items: list, min_body_len: int = MIN_BODY_LEN) -> dict:
    """
    批量过滤，返回 {valid: [...], dropped: [{item, reason}]}
    入库前调用，丢弃无正文 / 正文过短 / 无来源的资讯。
    """
    valid = []
    dropped = []
    for it in items or []:
        ok, reason = is_valid_news_item(it, min_body_len)
        if ok:
            valid.append(it)
        else:
            dropped.append({'item': it, 'reason': reason})
    return {'valid': valid, 'dropped': dropped}


# ── 入库文本组合 ───────────────────────────────────────────
def build_news_document(item: dict) -> str:
    """组合 标题/摘要/正文 为待切片文档文本"""
    parts = []
    if item.get('title'):
        parts.append(item['title'])
    if item.get('summary'):
        parts.append(item['summary'])
    if item.get('body'):
        parts.append(item['body'])
    return '\n\n'.join(parts)
