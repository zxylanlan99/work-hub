# -*- coding: utf-8 -*-
"""
StudyMind 资讯爬虫云函数 (验收标准 3 · 四要素 + 入库过滤)

部署: 腾讯云 CloudBase Python3.9 HTTP 云函数 (--httpFn)
仅依赖标准库，无外部包。自动测试可直接 import news_utils。

端点:
  POST /api/news/rss       {sources:[url,...]} -> {success, data, count, failedSources}
  POST /api/news/extract   {url}               -> {success, title, summary, source, body, content, url, length}
  POST /api/news/validate  {items:[...]}       -> {valid:[...], dropped:[...]}  (包装 filter_news_items)
"""
import json
import ssl
import socket
import ipaddress
import logging
import urllib.request
import urllib.parse

from news_utils import (
    parse_rss_feed,
    extract_body,
    extract_meta,
    filter_news_items,
    MIN_BODY_LEN,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('news-crawler')

# 启用证书校验（防中间人）
_SSL_CONTEXT = ssl.create_default_context()

_USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)


def _is_blocked_ip(ip_str):
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True
    if (ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast):
        return True
    if ip_str == '169.254.169.254':
        return True
    return False


def _validate_outbound_url(url, allowlist=None):
    if not url or not isinstance(url, str):
        raise ValueError('URL 为空')
    parsed = urllib.parse.urlparse(url)
    scheme = (parsed.scheme or '').lower()
    if scheme != 'https':
        raise ValueError('不支持的协议: %s，仅允许 https' % (scheme or '(空)'))
    host = parsed.hostname
    if not host:
        raise ValueError('URL 缺少主机名')
    if allowlist is not None and host.lower() not in allowlist:
        raise ValueError('域名不在允许列表: %s' % host)
    try:
        infos = socket.getaddrinfo(host, None)
        ips = {info[4][0] for info in infos}
    except socket.gaierror:
        raise ValueError('无法解析主机: %s' % host)
    for ip in ips:
        if _is_blocked_ip(ip):
            raise ValueError('目标地址被拒绝（私网/保留地址）: %s' % ip)
    return url


def _http_get(url, timeout=15):
    _validate_outbound_url(url)
    headers = {
        'User-Agent': _USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/rss+xml,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CONTEXT) as resp:
        return resp.read()


def _decode(raw):
    for enc in ('utf-8', 'gbk', 'gb2312', 'latin-1'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('utf-8', errors='replace')


def handle_rss(sources):
    all_articles = []
    failed_sources = []
    for source in sources or []:
        try:
            _validate_outbound_url(source)
            raw = _http_get(source)
            xml_text = raw.decode('utf-8', errors='replace')
            articles = parse_rss_feed(xml_text, source)
            logger.info('RSS 抓取: %s, %d 条', source, len(articles))
            all_articles.extend(articles)
        except Exception as e:
            logger.warning('RSS 源抓取失败 %s: %s', source, e)
            failed_sources.append({'url': source, 'error': str(e)})
    seen = set()
    unique = []
    for a in all_articles:
        key = (a.get('title') or '').strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(a)
    return {'success': True, 'data': unique, 'count': len(unique),
            'failedSources': failed_sources}


def handle_extract(url):
    if not url:
        return {'success': False, 'error': 'URL 为空', 'content': ''}
    try:
        _validate_outbound_url(url)
        raw = _http_get(url)
        html_text = _decode(raw)
        text = extract_body(html_text)
        title, summary = extract_meta(html_text)
        if len(text) > 8000:
            text = text[:8000]
        source = urllib.parse.urlparse(url).netloc or url
        return {
            'success': True,
            'title': title,
            'summary': summary,
            'source': source,
            'body': text,
            'content': text,
            'url': url,
            'length': len(text),
        }
    except Exception as e:
        logger.error('文章抓取失败 %s: %s', url, e)
        return {'success': False, 'error': str(e), 'content': ''}


def handle_validate(items):
    result = filter_news_items(items or [], MIN_BODY_LEN)
    return {'valid': result['valid'], 'dropped': result['dropped']}


def _cors_headers(origin):
    return {
        'Access-Control-Allow-Origin': origin or '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Content-Type': 'application/json',
    }


def _parse_body(event):
    body = event.get('body', '')
    if event.get('isBase64Encoded'):
        import base64
        body = base64.b64decode(body).decode('utf-8', errors='replace')
    if not body:
        return {}
    try:
        return json.loads(body)
    except Exception:
        return {}


def _resolve_payload(event):
    """兼容两种调用形态（前端三级 fallback 的 callFunction 路径依赖此兼容）：
    - HTTP 模式（控制台 HTTP 触发 或 callFunction 走 HTTP 语义）：
      event 含 body（JSON 字符串），按 _parse_body 解析。
    - EVENT 模式（callFunction 直传 data，未创建 HTTP 触发时常见）：
      action / sources / items / url 等字段位于 event 顶层，直接作为 payload。
    """
    if not isinstance(event, dict):
        return {}
    if event.get('body'):
        return _parse_body(event)
    if event.get('action'):
        return event
    return {}


def main_handler(event, context):
    method = (event.get('httpMethod') or event.get('method') or 'GET').upper()
    path = event.get('path') or ''
    hdrs = event.get('headers') or {}
    origin = ''
    if isinstance(hdrs, dict):
        origin = hdrs.get('origin') or hdrs.get('Origin') or ''

    if method == 'OPTIONS':
        return {
            'isBase64Encoded': False,
            'statusCode': 204,
            'headers': _cors_headers(origin),
            'body': '',
        }

    try:
        payload = _resolve_payload(event)
        # 路由优先级：请求体 action 字段（云函数仅暴露精确访问路径，不支持子路由）
        action = (payload.get('action') or '').lower()
        if not action:
            # 兼容：按 URL 路径子串匹配（本地/容器部署时可用）
            if '/rss' in path:
                action = 'rss'
            elif '/extract' in path:
                action = 'extract'
            elif '/validate' in path:
                action = 'validate'
        if action == 'rss':
            sources = payload.get('sources') or []
            if not sources:
                raise ValueError('RSS 源为空')
            data = handle_rss(sources)
        elif action == 'extract':
            data = handle_extract(payload.get('url'))
        elif action == 'validate':
            data = handle_validate(payload.get('items') or [])
        else:
            return {
                'isBase64Encoded': False,
                'statusCode': 404,
                'headers': _cors_headers(origin),
                'body': json.dumps({'success': False, 'error': 'unknown action: %s' % action}),
            }
        return {
            'isBase64Encoded': False,
            'statusCode': 200,
            'headers': _cors_headers(origin),
            'body': json.dumps(data, ensure_ascii=False),
        }
    except Exception as e:
        return {
            'isBase64Encoded': False,
            'statusCode': 400,
            'headers': _cors_headers(origin),
            'body': json.dumps({'success': False, 'error': str(e)}),
        }
