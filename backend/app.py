"""
StudyMind 知识库后端 — FastAPI 主应用

功能:
1. POST /api/knowledge/upload       — 上传文件，后台异步处理 (解析→切片→向量化→存储)
2. GET  /api/knowledge/status/{id}  — 查询处理状态
3. POST /api/knowledge/search       — 向量搜索 (余弦相似度，过滤低相关性)
4. DELETE /api/knowledge/{item_id}  — 删除 (文件+向量+记录一起删)
5. GET  /api/knowledge/chunks/{id}  — 获取文档切片列表
6. GET  /api/knowledge/stats        — 获取向量库统计信息
7. GET  /api/knowledge/list         — 获取已上传的知识条目列表
"""
import os
import re
import json
import logging
import asyncio
import threading
from datetime import datetime
from typing import Optional
from html.parser import HTMLParser

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# 文件名消毒（F7 修复）：优先使用 werkzeug，缺失时降级到本地实现
try:
    from werkzeug.utils import secure_filename
except ImportError:
    def secure_filename(name):
        """本地降级实现：仅保留安全字符，剥离路径成分，避免 ../ 越权写。"""
        if not name:
            return ''
        # 去掉任何目录前缀（兼容 Windows / Unix 分隔符）
        name = name.replace('\\', '/').split('/')[-1]
        # 仅保留字母数字、点、下划线、连字符及中文，其余替换为下划线
        name = re.sub(r'[^\w.\-\u4e00-\u9fff]+', '_', name)
        # 去除前导点（避免 Unix 隐藏文件/路径穿越语义）
        name = name.lstrip('.')
        if not name:
            name = 'file'
        return name[:255]

from config import HOST, PORT, UPLOAD_DIR
from file_parser import parse_file
from chunker import chunk_document
from embedder import embed_texts, embed_query
from vector_store import store_chunks, search, delete_by_item, get_chunks_by_item, get_stats
from news_utils import (
    parse_rss_feed as _parse_rss_feed,
    extract_body,
    extract_meta,
    normalize_web_result,
    filter_news_items,
    build_news_document,
)
from agent_memory import get_agent_memory
from ai_agent import AGENTS, generate_with_citations

# ── 日志配置 ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ── FastAPI 应用 ──────────────────────────────────────────
app = FastAPI(title="StudyMind 知识库后端", version="1.0.0")

# CORS — 允许前端跨域调用（生产环境限制具体域名）
ALLOWED_ORIGINS = [
    "https://studymind-d7g06nv0de98a1f1b-1255395253.tcloudbaseapp.com",  # 腾讯云部署
    "http://localhost:8771",  # 本地开发
    "http://localhost:8765",  # 本地开发备选
    "http://localhost:8090",  # Trae 预览服务器
    "http://127.0.0.1:8765",
    "http://127.0.0.1:8771",
    "http://127.0.0.1:8090",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 状态管理 (内存中的任务状态) ────────────────────────────
# task_id → { status, progress, item_id, chunk_count, error, created_at }
_task_status = {}
# item_id → { title, file_name, file_type, file_size, category_id, status, chunk_count, created_at }
_item_registry = {}
_registry_lock = threading.Lock()


def _register_item(item_id, info):
    with _registry_lock:
        _item_registry[item_id] = info


def _update_item(item_id, **kwargs):
    with _registry_lock:
        if item_id in _item_registry:
            _item_registry[item_id].update(kwargs)


def _get_item(item_id):
    with _registry_lock:
        return _item_registry.get(item_id)


def _list_items():
    with _registry_lock:
        return list(_item_registry.values())


def _delete_item(item_id):
    with _registry_lock:
        return _item_registry.pop(item_id, None)


# ── 后台处理任务 ──────────────────────────────────────────
def _process_file_background(task_id: str, file_path: str, file_name: str,
                              item_id: str, category_id: str):
    """
    后台处理流程: 解析文件 → 切片 → 向量化 → 存入 ChromaDB
    这个函数在线程中运行，不阻塞 API 响应
    """
    try:
        _task_status[task_id] = {'status': 'parsing', 'progress': 10, 'item_id': item_id}

        # 1. 解析文件
        logger.info(f"[Task {task_id}] 开始解析文件: {file_name}")
        text_content = parse_file(file_path, file_name)
        _task_status[task_id] = {'status': 'parsing', 'progress': 30, 'item_id': item_id}

        # 2. 切片
        logger.info(f"[Task {task_id}] 开始切片, 文本长度: {len(text_content)}")
        chunks = chunk_document(text_content, {
            'source_doc_id': item_id,
            'title': os.path.splitext(file_name)[0],
            'category_path': category_id or ''
        })
        _task_status[task_id] = {'status': 'chunking', 'progress': 50, 'item_id': item_id,
                                   'chunk_count': len(chunks)}

        if not chunks:
            raise ValueError('切片结果为空，文档内容可能太短')

        # 3. 向量化
        logger.info(f"[Task {task_id}] 开始向量化, 切片数: {len(chunks)}")
        texts = [c['content'] for c in chunks]
        embeddings = embed_texts(texts)
        _task_status[task_id] = {'status': 'embedding', 'progress': 75, 'item_id': item_id,
                                   'chunk_count': len(chunks)}

        # 4. 存入 ChromaDB
        logger.info(f"[Task {task_id}] 存入 ChromaDB")
        stored = store_chunks(item_id, chunks, embeddings)

        # 5. 完成
        _task_status[task_id] = {
            'status': 'completed', 'progress': 100, 'item_id': item_id,
            'chunk_count': stored, 'completed_at': datetime.now().isoformat()
        }
        _update_item(item_id, status='completed', chunk_count=stored)
        logger.info(f"[Task {task_id}] 处理完成: {stored} 个切片已存储")

    except Exception as e:
        logger.error(f"[Task {task_id}] 处理失败: {e}", exc_info=True)
        _task_status[task_id] = {
            'status': 'failed', 'progress': 0, 'item_id': item_id,
            'error': str(e), 'failed_at': datetime.now().isoformat()
        }
        _update_item(item_id, status='failed', error=str(e))


# ── API 路由 ──────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "StudyMind 知识库后端", "version": "1.0.0", "docs": "/docs"}


@app.get("/api/knowledge/stats")
async def knowledge_stats():
    """获取向量库统计信息"""
    stats = get_stats()
    with _registry_lock:
        item_count = len(_item_registry)
    return {
        'success': True,
        'data': {
            **stats,
            'item_count': item_count,
            'items': _list_items()
        }
    }


@app.post("/api/knowledge/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    categoryId: str = Form(default=''),
    itemId: str = Form(default='')
):
    """
    上传文件 — 立即返回 taskId，后台异步处理
    流程: 保存文件 → 返回 taskId → 后台: 解析→切片→向量化→存储
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名为空")

    # 消毒文件名：剥离路径成分，防止 ../ 越权写（F7 修复）
    safe_name = secure_filename(file.filename)
    if not safe_name:
        raise HTTPException(status_code=400, detail="非法文件名（仅含特殊字符）")

    # 检查文件格式
    ext = safe_name.rsplit('.', 1)[-1].lower() if '.' in safe_name else ''
    supported = ['pdf', 'docx', 'pptx', 'md', 'markdown', 'txt']
    if ext not in supported:
        raise HTTPException(status_code=400, detail=f"不支持的格式: .{ext}，支持: {', '.join(supported)}")

    # 生成 IDs
    import uuid
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    item_id = itemId or f"kb_{uuid.uuid4().hex[:12]}"

    # 保存文件到磁盘（使用消毒后的文件名）
    file_path = os.path.join(UPLOAD_DIR, f"{item_id}_{safe_name}")

    # 二次校验：写入前确认目标真实路径仍在 UPLOAD_DIR 内，否则拒绝（F7 修复）
    real_upload_dir = os.path.realpath(UPLOAD_DIR)
    real_target = os.path.realpath(file_path)
    if real_target != real_upload_dir and not real_target.startswith(real_upload_dir + os.sep):
        raise HTTPException(status_code=400, detail="非法文件路径")
    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)

    file_size = len(content)
    logger.info(f"文件已保存: {file_path} ({file_size} bytes)")

    # 注册条目
    _register_item(item_id, {
        'item_id': item_id,
        'title': os.path.splitext(safe_name)[0],
        'file_name': safe_name,
        'file_type': ext,
        'file_size': file_size,
        'file_path': file_path,
        'category_id': categoryId,
        'status': 'processing',
        'chunk_count': 0,
        'created_at': datetime.now().isoformat()
    })

    # 初始化任务状态
    _task_status[task_id] = {
        'status': 'pending', 'progress': 0, 'item_id': item_id,
        'created_at': datetime.now().isoformat()
    }

    # 提交后台任务 — 在线程中运行，不阻塞事件循环
    def run_background():
        _process_file_background(task_id, file_path, safe_name, item_id, categoryId)

    background_tasks.add_task(run_background)

    logger.info(f"上传任务已创建: task_id={task_id}, item_id={item_id}, file={safe_name}")

    return {
        'success': True,
        'data': {
            'task_id': task_id,
            'item_id': item_id,
            'file_name': safe_name,
            'file_size': file_size,
            'status': 'processing'
        }
    }


def _ingest_text(item_id: str, text: str, title: str, category_id: str) -> int:
    """
    共享的「文本 → 切片 → 向量化 → 存储」管线。
    返回成功存储的切片数量（验收标准 4：智能切片 + 数据层记录 chunk_count）。
    """
    chunks = chunk_document(text, {
        'source_doc_id': item_id,
        'title': title or '未命名',
        'category_path': category_id or ''
    })
    if not chunks:
        _update_item(item_id, status='completed', chunk_count=0)
        return 0
    texts = [c['content'] for c in chunks]
    embeddings = embed_texts(texts)
    stored = store_chunks(item_id, chunks, embeddings)
    _update_item(item_id, status='completed', chunk_count=stored)
    return stored


def _ingest_text_task(task_id: str, item_id: str, text: str, title: str, category_id: str):
    """后台任务包装：维护任务状态并调用共享管线"""
    try:
        _task_status[task_id] = {'status': 'chunking', 'progress': 30, 'item_id': item_id}
        stored = _ingest_text(item_id, text, title, category_id)
        _task_status[task_id] = {
            'status': 'completed', 'progress': 100, 'item_id': item_id, 'chunk_count': stored
        }
        logger.info(f"[Ingest {task_id}] 切片完成: {stored} 个切片, item_id={item_id}")
    except Exception as e:
        logger.error(f"[Ingest {task_id}] 切片失败: {e}", exc_info=True)
        _task_status[task_id] = {
            'status': 'failed', 'progress': 0, 'item_id': item_id, 'error': str(e)
        }
        _update_item(item_id, status='failed', error=str(e))


@app.post("/api/knowledge/chunk-text")
async def chunk_text_endpoint(
    background_tasks: BackgroundTasks,
    request: Request
):
    """
    文本内容切片与矢量化 — 用于资讯入库时的切片处理
    接收纯文本内容，异步执行切片→向量化→存储
    """
    import uuid
    body = await request.json()
    text = body.get('text', '')
    title = body.get('title', '')
    item_id = body.get('itemId', '') or f"kb_{uuid.uuid4().hex[:12]}"
    category_id = body.get('categoryId', '')

    if not text or len(text.strip()) < 50:
        return {'success': True, 'data': {'status': 'skipped', 'message': '内容过短，跳过切片'}}

    task_id = f"task_{uuid.uuid4().hex[:12]}"

    _register_item(item_id, {
        'item_id': item_id,
        'title': title or '未命名',
        'file_name': '',
        'file_type': 'text',
        'file_size': len(text),
        'file_path': '',
        'category_id': category_id,
        'status': 'processing',
        'chunk_count': 0,
        'created_at': datetime.now().isoformat()
    })

    _task_status[task_id] = {
        'status': 'pending', 'progress': 0, 'item_id': item_id,
        'created_at': datetime.now().isoformat()
    }

    def run_text_chunk():
        _ingest_text_task(task_id, item_id, text, title, category_id)

    background_tasks.add_task(run_text_chunk)

    return {
        'success': True,
        'data': {
            'task_id': task_id,
            'item_id': item_id,
            'status': 'processing'
        }
    }


@app.get("/api/knowledge/status/{task_id}")
async def get_status(task_id: str):
    """查询处理状态"""
    if task_id not in _task_status:
        raise HTTPException(status_code=404, detail="任务不存在")

    status = _task_status[task_id]
    return {
        'success': True,
        'data': status
    }


class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 10
    min_similarity: Optional[float] = 0.3
    category_filter: Optional[str] = None


@app.post("/api/knowledge/search")
async def knowledge_search(req: SearchRequest):
    """
    向量搜索 — 余弦相似度，过滤低相关性结果
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="查询内容为空")

    try:
        query_embedding = embed_query(req.query)
        where = None
        if req.category_filter:
            where = {'category_path': req.category_filter}

        results = search(
            query_embedding=query_embedding,
            top_k=req.top_k or 10,
            min_similarity=req.min_similarity or 0.3,
            where=where
        )

        return {
            'success': True,
            'data': results,
            'count': len(results)
        }
    except Exception as e:
        logger.error(f"搜索失败: {e}", exc_info=True)
        return {'success': False, 'error': str(e), 'data': []}


@app.get("/api/knowledge/chunks/{item_id}")
async def get_chunks(item_id: str):
    """获取某个知识条目的所有切片"""
    chunks = get_chunks_by_item(item_id)
    return {
        'success': True,
        'data': chunks,
        'count': len(chunks)
    }


@app.delete("/api/knowledge/{item_id}")
async def delete_knowledge(item_id: str):
    """
    删除知识条目 — 文件 + 向量 + 记录一起删干净
    """
    item = _get_item(item_id)
    deleted = {'vectors': 0, 'file': False, 'record': False}

    # 1. 删除 ChromaDB 中的向量
    try:
        deleted['vectors'] = delete_by_item(item_id)
    except Exception as e:
        logger.error(f"删除向量失败: {e}")

    # 2. 删除磁盘上的文件
    if item and item.get('file_path'):
        try:
            if os.path.exists(item['file_path']):
                os.remove(item['file_path'])
                deleted['file'] = True
        except Exception as e:
            logger.error(f"删除文件失败: {e}")

    # 3. 删除注册记录
    record = _delete_item(item_id)
    deleted['record'] = record is not None

    logger.info(f"删除知识条目 {item_id}: vectors={deleted['vectors']}, file={deleted['file']}, record={deleted['record']}")

    return {
        'success': True,
        'data': {
            'item_id': item_id,
            'deleted': deleted
        }
    }


@app.get("/api/knowledge/list")
async def list_knowledge():
    """获取已上传的知识条目列表"""
    items = _list_items()
    return {
        'success': True,
        'data': items,
        'count': len(items)
    }


# ── 网络搜索与 RSS 抓取（真实数据源）────────────────────────

import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import ssl
import socket
import ipaddress

# 启用证书校验（标准默认上下文），修复原先 unverified 上下文带来的中间人攻击风险（F6 修复）。
# 若运行环境确实需要自签名证书，应在系统信任库或此处显式加载证书，而非全局关闭校验。
_SSL_CONTEXT = ssl.create_default_context()


# ── 出站 URL 安全校验（防 SSRF，F3 修复）────────────────────
# 固定来源（如 web_search）使用的域名白名单；
# extract / rss 由用户提交任意新闻源，无法穷举白名单，
# 故改用「仅 https + 目标 IP 非私网」的防护，见 _validate_outbound_url。
_FETCH_DOMAIN_ALLOWLIST = {
    'www.bing.com',
    'bing.com',
}


def _is_blocked_ip(ip_str: str) -> bool:
    """目标 IP 是否属于私网/环回/链路本地/保留/组播等不可信地址。"""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        # 无法解析为合法 IP 的（如非常规格式）一律视为不可信并拒绝
        return True
    if (ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast):
        return True
    # 云厂商元数据服务（如 169.254.169.254）显式封锁，防凭证窃取
    if ip_str == '169.254.169.254':
        return True
    return False


def _validate_outbound_url(url: str, allowlist=None) -> str:
    """
    校验出站 URL，防止 SSRF：
      - 仅允许 https 协议（显式禁止 file:// 及其他非 http(s) 方案）
      - 解析域名后拒绝指向私网/环回/链路本地的地址
      - 若提供 allowlist，目标主机还须命中白名单域名
    通过则返回原 URL；否则抛出 ValueError。
    """
    if not url or not isinstance(url, str):
        raise ValueError('URL 为空')
    parsed = urllib.parse.urlparse(url)
    scheme = (parsed.scheme or '').lower()
    if scheme != 'https':
        # 显式禁止 file:// 以及任何非 https 方案
        raise ValueError(f'不支持的协议: {scheme or "(空)"}，仅允许 https')
    host = parsed.hostname
    if not host:
        raise ValueError('URL 缺少主机名')
    if allowlist is not None and host.lower() not in allowlist:
        raise ValueError(f'域名不在允许列表: {host}')
    # 解析并校验目标 IP（拦截 10/172.16-31/192.168 等私网及 169.254.169.254）
    try:
        infos = socket.getaddrinfo(host, None)
        ips = {info[4][0] for info in infos}
    except socket.gaierror:
        raise ValueError(f'无法解析主机: {host}')
    for ip in ips:
        if _is_blocked_ip(ip):
            raise ValueError(f'目标地址被拒绝（私网/保留地址）: {ip}')
    return url


class WebSearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 10


@app.post("/api/search/web")
async def web_search(req: WebSearchRequest):
    """
    公开网络搜索 — 使用 Bing 搜索结果页获取学习相关新闻/资讯
    返回标题、摘要、链接列表
    """
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="查询内容为空")

    query = req.query.strip()
    top_k = min(max(req.top_k or 10, 1), 30)

    try:
        # Bing 搜索（无需 API key，公开可用）
        encoded = urllib.parse.quote(query)
        url = f"https://www.bing.com/search?q={encoded}&count={top_k}"
        # SSRF 防护：固定来源校验域名白名单（F3 修复）
        _validate_outbound_url(url, allowlist=_FETCH_DOMAIN_ALLOWLIST)
        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ),
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
        request = urllib.request.Request(url, headers=headers)

        with urllib.request.urlopen(request, timeout=15, context=_SSL_CONTEXT) as resp:
            html_text = resp.read().decode('utf-8', errors='replace')

        results = []
        import re
        # Bing 结果块：<li class="b_algo">...</li>
        result_blocks = re.findall(r'<li class="b_algo".*?</li>', html_text, re.S)
        for block in result_blocks[:top_k]:
            item = normalize_web_result(block)
            if item:
                results.append(item)

        logger.info(f"网络搜索: {query}, 返回 {len(results)} 条")
        return {'success': True, 'data': results, 'count': len(results)}

    except Exception as e:
        logger.error(f"网络搜索失败: {e}", exc_info=True)
        return {'success': False, 'error': str(e), 'data': []}


class RssRequest(BaseModel):
    sources: list[str]


class ExtractRequest(BaseModel):
    url: str


@app.post("/api/news/extract")
async def extract_article_content(req: ExtractRequest):
    """
    【Issue 2 修复】抓取文章原文 URL，提取正文文本内容
    供 dailyCrawlAndScore 调用，提升 AI 评分的信息量
    """
    url = req.url
    if not url:
        raise HTTPException(status_code=400, detail="URL 为空")
    # SSRF 防护：仅允许 https，并拦截指向私网/链路本地的目标（F3 修复）
    _validate_outbound_url(url)

    try:
        headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ),
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        }
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request, timeout=15, context=_SSL_CONTEXT) as resp:
            raw = resp.read()
            # 尝试多种编码
            for enc in ('utf-8', 'gbk', 'gb2312', 'latin-1'):
                try:
                    html_text = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                html_text = raw.decode('utf-8', errors='replace')

        # 提取正文（body）与元信息（标题/摘要）
        text = extract_body(html_text)
        title, summary = extract_meta(html_text)

        # 截断过长内容（保留前 8000 字符）
        if len(text) > 8000:
            text = text[:8000]

        # 来源：取 URL 主机名
        source = urllib.parse.urlparse(url).netloc or url

        logger.info(f"文章抓取: {url}, 提取 {len(text)} 字符")
        # 归一化为四要素结构返回（body=正文，content 保留兼容前端）
        return {
            'success': True,
            'title': title,
            'summary': summary,
            'source': source,
            'body': text,
            'content': text,
            'url': url,
            'length': len(text)
        }

    except Exception as e:
        logger.error(f"文章抓取失败 {url}: {e}")
        return {'success': False, 'error': str(e), 'content': ''}


@app.post("/api/news/rss")
async def fetch_rss(req: RssRequest):
    """
    抓取多个 RSS 源，返回文章列表（真实数据）
    """
    if not req.sources:
        raise HTTPException(status_code=400, detail="RSS 源为空")

    all_articles = []
    failed_sources = []
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
    }

    for source in req.sources:
        try:
            # SSRF 防护：校验每个 RSS 源 URL（F3 修复）
            _validate_outbound_url(source)
            request = urllib.request.Request(source, headers=headers)
            with urllib.request.urlopen(request, timeout=15, context=_SSL_CONTEXT) as resp:
                xml_text = resp.read().decode('utf-8', errors='replace')
            articles = _parse_rss_feed(xml_text, source)
            logger.info(f"RSS 抓取: {source}, {len(articles)} 条")
            all_articles.extend(articles)
        except Exception as e:
            logger.warning(f"RSS 源抓取失败 {source}: {e}")
            failed_sources.append({'url': source, 'error': str(e)})

    # 去重：按标题去重
    seen = set()
    unique = []
    for a in all_articles:
        key = (a.get('title') or '').strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(a)

    return {'success': True, 'data': unique, 'count': len(unique), 'failedSources': failed_sources}


# ── 资讯入库（验收标准 3 + 4）──────────────────────────────
class NewsIngestRequest(BaseModel):
    items: list[dict] = []
    categoryId: Optional[str] = ''


@app.post("/api/news/ingest")
async def news_ingest(req: NewsIngestRequest, background_tasks: BackgroundTasks):
    """
    资讯入库：入库前硬性过滤（丢弃无正文 / 正文过短 / 无来源），
    通过者切片并写入知识库，记录 chunk_count，
    可经 GET /api/knowledge/chunks/{id} 查询切片数与内容。
    """
    if not req.items:
        raise HTTPException(status_code=400, detail="资讯列表为空")

    # 入库前硬性过滤（验收标准 3）
    filtered = filter_news_items(req.items)
    valid = filtered['valid']
    dropped = filtered['dropped']

    ingested = []
    import uuid
    for item in valid:
        item_id = f"kb_{uuid.uuid4().hex[:12]}"
        text = build_news_document(item)
        _register_item(item_id, {
            'item_id': item_id,
            'title': item.get('title') or '未命名',
            'file_name': '',
            'file_type': 'news',
            'file_size': len(text),
            'file_path': '',
            'category_id': req.categoryId or '',
            'source': item.get('source', ''),
            'status': 'processing',
            'chunk_count': 0,
            'created_at': datetime.now().isoformat()
        })
        task_id = f"task_{item_id}"
        _task_status[task_id] = {
            'status': 'pending', 'progress': 0, 'item_id': item_id,
            'created_at': datetime.now().isoformat()
        }
        # 复用共享切片管线（验收标准 4：智能切片 + chunk_count）
        background_tasks.add_task(
            _ingest_text_task, task_id, item_id, text,
            item.get('title', ''), req.categoryId or ''
        )
        ingested.append({'item_id': item_id, 'title': item.get('title')})

    return {
        'success': True,
        'data': {
            'ingested': len(ingested),
            'dropped_count': len(dropped),
            'dropped': dropped,
            'items': ingested
        }
    }


# ── AI 智能体（验收标准 5：引用知识库 + 记忆隔离）─────────────
class AgentChatRequest(BaseModel):
    agentId: str
    query: str
    model: Optional[str] = 'silicon'


@app.post("/api/agent/chat")
async def agent_chat(req: AgentChatRequest):
    """AI 智能体对话：检索知识库并引用，记忆按 agent_id 隔离"""
    if not req.agentId or req.agentId not in AGENTS:
        raise HTTPException(status_code=400, detail="未知或缺失 agentId")
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="查询内容为空")
    try:
        result = generate_with_citations(req.agentId, req.query.strip(), model=req.model or 'silicon')
        return {'success': True, 'data': result}
    except Exception as e:
        logger.error(f"AI 代理失败: {e}", exc_info=True)
        return {'success': False, 'error': str(e), 'data': None}


@app.get("/api/agent/list")
async def agent_list():
    """列出 5 个可用智能体"""
    return {'success': True, 'data': [{'id': k, 'name': v['name']} for k, v in AGENTS.items()]}


@app.get("/api/agent/memory/{agent_id}")
async def agent_memory_get(agent_id: str):
    """查看某智能体的对话记忆（隔离维度内）"""
    mem = get_agent_memory()
    return {'success': True, 'data': {'agent_id': agent_id, 'history': mem.get_history(agent_id)}}


@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("StudyMind 知识库后端启动")
    logger.info(f"监听: http://{HOST}:{PORT}")
    logger.info(f"API 文档: http://{HOST}:{PORT}/docs")
    logger.info(f"上传目录: {UPLOAD_DIR}")
    logger.info(f"ChromaDB: {os.path.join(os.path.dirname(UPLOAD_DIR), 'chroma_data')}")
    logger.info("=" * 60)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
