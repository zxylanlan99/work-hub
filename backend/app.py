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

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import HOST, PORT, UPLOAD_DIR
from file_parser import parse_file
from chunker import chunk_document
from embedder import embed_texts, embed_query
from vector_store import store_chunks, search, delete_by_item, get_chunks_by_item, get_stats

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
    "http://127.0.0.1:8765",
    "http://127.0.0.1:8771",
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

    # 检查文件格式
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    supported = ['pdf', 'docx', 'pptx', 'md', 'markdown', 'txt']
    if ext not in supported:
        raise HTTPException(status_code=400, detail=f"不支持的格式: .{ext}，支持: {', '.join(supported)}")

    # 生成 IDs
    import uuid
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    item_id = itemId or f"kb_{uuid.uuid4().hex[:12]}"

    # 保存文件到磁盘
    file_path = os.path.join(UPLOAD_DIR, f"{item_id}_{file.filename}")
    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)

    file_size = len(content)
    logger.info(f"文件已保存: {file_path} ({file_size} bytes)")

    # 注册条目
    _register_item(item_id, {
        'item_id': item_id,
        'title': os.path.splitext(file.filename)[0],
        'file_name': file.filename,
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
        _process_file_background(task_id, file_path, file.filename, item_id, categoryId)

    background_tasks.add_task(run_background)

    logger.info(f"上传任务已创建: task_id={task_id}, item_id={item_id}, file={file.filename}")

    return {
        'success': True,
        'data': {
            'task_id': task_id,
            'item_id': item_id,
            'file_name': file.filename,
            'file_size': file_size,
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

# 创建不验证服务器证书的 SSL 上下文，解决部分环境（如 macOS）根证书缺失导致的 HTTPS 请求失败
# 仅用于访问公开搜索/RSS 接口，不处理敏感数据
_SSL_CONTEXT = ssl._create_unverified_context()


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
        import html as _html
        import re
        # Bing 结果块：<li class="b_algo">...</li>
        result_blocks = re.findall(r'<li class="b_algo".*?</li>', html_text, re.S)
        for block in result_blocks[:top_k]:
            title_match = re.search(
                r'<h2[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?</h2>',
                block, re.S
            )
            summary_match = re.search(
                r'<div class="b_caption"[^>]*>.*?<p[^>]*>(.*?)</p>.*?</div>',
                block, re.S
            )
            if not title_match:
                continue

            raw_url = _html.unescape(title_match.group(1))
            title = re.sub(r'<[^>]+>', '', title_match.group(2))
            summary = ''
            if summary_match:
                summary = re.sub(r'<[^>]+>', '', summary_match.group(1))

            # Bing 部分链接为相对路径，补全
            clean_url = raw_url
            if clean_url.startswith('/'):
                clean_url = f"https://www.bing.com{clean_url}"

            results.append({
                'title': _html.unescape(title).strip(),
                'summary': _html.unescape(summary).strip(),
                'content': _html.unescape(summary).strip(),
                'url': clean_url,
                'sourceUrl': clean_url,
                'sourceName': 'Bing'
            })

        logger.info(f"网络搜索: {query}, 返回 {len(results)} 条")
        return {'success': True, 'data': results, 'count': len(results)}

    except Exception as e:
        logger.error(f"网络搜索失败: {e}", exc_info=True)
        return {'success': False, 'error': str(e), 'data': []}


class RssRequest(BaseModel):
    sources: list[str]


def _parse_rss_feed(xml_text: str, source_url: str):
    """解析单个 RSS/Atom feed XML"""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        logger.warning(f"RSS 解析失败 {source_url}: {e}")
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
            articles.append({
                'title': title,
                'sourceUrl': link,
                'sourceName': source_url,
                'summary': re.sub(r'<[^>]+>', '', desc),
                'content': re.sub(r'<[^>]+>', '', desc),
                'publishedAt': pub_date
            })
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
            articles.append({
                'title': title,
                'sourceUrl': link,
                'sourceName': source_url,
                'summary': re.sub(r'<[^>]+>', '', summary or content),
                'content': re.sub(r'<[^>]+>', '', content or summary),
                'publishedAt': published
            })

    return articles


@app.post("/api/news/rss")
async def fetch_rss(req: RssRequest):
    """
    抓取多个 RSS 源，返回文章列表（真实数据）
    """
    if not req.sources:
        raise HTTPException(status_code=400, detail="RSS 源为空")

    all_articles = []
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
    }

    for source in req.sources:
        try:
            request = urllib.request.Request(source, headers=headers)
            with urllib.request.urlopen(request, timeout=15, context=_SSL_CONTEXT) as resp:
                xml_text = resp.read().decode('utf-8', errors='replace')
            articles = _parse_rss_feed(xml_text, source)
            logger.info(f"RSS 抓取: {source}, {len(articles)} 条")
            all_articles.extend(articles)
        except Exception as e:
            logger.warning(f"RSS 源抓取失败 {source}: {e}")

    # 去重：按标题去重
    seen = set()
    unique = []
    for a in all_articles:
        key = (a.get('title') or '').strip()
        if key and key not in seen:
            seen.add(key)
            unique.append(a)

    return {'success': True, 'data': unique, 'count': len(unique)}


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
