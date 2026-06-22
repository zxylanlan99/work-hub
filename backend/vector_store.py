"""
ChromaDB 向量存储模块 — 存储/搜索/删除文档切片
使用余弦相似度检索，自动过滤低相关性结果
"""
import logging
import uuid
from typing import List, Dict, Any

import chromadb
from chromadb.config import Settings

from config import CHROMA_DB_PATH, CHROMA_COLLECTION, DEFAULT_SEARCH_TOP_K, MIN_SIMILARITY_THRESHOLD

logger = logging.getLogger(__name__)

# 全局 ChromaDB 客户端和集合
_client = None
_collection = None


def get_collection():
    """懒加载 ChromaDB 客户端和集合"""
    global _client, _collection
    if _collection is None:
        logger.info(f"初始化 ChromaDB: {CHROMA_DB_PATH}")
        _client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
        _collection = _client.get_or_create_collection(
            name=CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"}  # 使用余弦相似度
        )
        logger.info(f"ChromaDB 集合 '{CHROMA_COLLECTION}' 就绪，当前文档数: {_collection.count()}")
    return _collection


def store_chunks(item_id: str, chunks: List[Dict[str, Any]], embeddings: List[List[float]]) -> int:
    """
    批量存储文档切片和向量

    Args:
        item_id: 知识条目 ID (knowledge_items 的 _id)
        chunks: 切片列表 (来自 chunker.chunk_document)
        embeddings: 对应的向量列表 (来自 embedder.embed_texts)

    Returns:
        存储的切片数量
    """
    if not chunks:
        return 0

    collection = get_collection()

    ids = []
    documents = []
    metadatas = []
    vectors = []

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        chunk_id = f"{item_id}_chunk_{i}"
        ids.append(chunk_id)
        documents.append(chunk['content'])
        vectors.append(embedding)
        metadatas.append({
            'source_doc_id': item_id,
            'title': chunk.get('title', ''),
            'category_path': chunk.get('category_path', ''),
            'position': chunk.get('position', i),
            'chunk_index': chunk.get('chunk_index', i),
            'total_chunks': chunk.get('total_chunks', len(chunks)),
            'char_count': chunk.get('char_count', len(chunk['content']))
        })

    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=vectors,
        metadatas=metadatas
    )

    logger.info(f"存储 {len(ids)} 个切片到 ChromaDB, item_id={item_id}")
    return len(ids)


def search(query_embedding: List[float],
           top_k: int = DEFAULT_SEARCH_TOP_K,
           min_similarity: float = MIN_SIMILARITY_THRESHOLD,
           where: dict = None) -> List[Dict[str, Any]]:
    """
    向量搜索 — 余弦相似度，过滤低相关性结果

    Args:
        query_embedding: 查询向量
        top_k: 返回前 K 条结果
        min_similarity: 最低相似度阈值 (0~1)，低于此值不返回
        where: 元数据过滤条件 (如 {"source_doc_id": "xxx"})

    Returns:
        结果列表，每条包含:
        - id: 切片 ID
        - content: 切片文本
        - similarity: 相似度分数 (0~1，越高越相关)
        - metadata: 元数据
    """
    collection = get_collection()

    query_params = {
        'query_embeddings': [query_embedding],
        'n_results': top_k,
        'include': ['documents', 'metadatas', 'distances']
    }
    if where:
        query_params['where'] = where

    results = collection.query(**query_params)

    # ChromaDB 返回的是 distance (越小越相似)，需要转换为相似度
    # cosine distance → similarity = 1 - distance
    parsed = []
    for i in range(len(results['ids'][0])):
        distance = results['distances'][0][i]
        similarity = 1.0 - distance  # 余弦相似度

        if similarity < min_similarity:
            continue  # 过滤低相关性结果

        parsed.append({
            'id': results['ids'][0][i],
            'content': results['documents'][0][i],
            'similarity': round(similarity, 4),
            'metadata': results['metadatas'][0][i]
        })

    logger.info(f"向量搜索完成: 查询 top_k={top_k}, 阈值={min_similarity}, 返回 {len(parsed)} 条结果")
    return parsed


def delete_by_item(item_id: str) -> int:
    """
    删除某个知识条目的所有切片

    Args:
        item_id: 知识条目 ID

    Returns:
        删除的切片数量
    """
    collection = get_collection()

    # 先查出有多少条
    existing = collection.get(where={'source_doc_id': item_id})
    count = len(existing['ids']) if existing['ids'] else 0

    if count > 0:
        collection.delete(where={'source_doc_id': item_id})
        logger.info(f"从 ChromaDB 删除 {count} 个切片, item_id={item_id}")

    return count


def get_chunks_by_item(item_id: str) -> List[Dict[str, Any]]:
    """
    获取某个知识条目的所有切片

    Args:
        item_id: 知识条目 ID

    Returns:
        切片列表
    """
    collection = get_collection()
    results = collection.get(where={'source_doc_id': item_id})

    chunks = []
    for i in range(len(results['ids'])):
        chunks.append({
            'id': results['ids'][i],
            'content': results['documents'][i],
            'metadata': results['metadatas'][i]
        })

    # 按 position 排序
    chunks.sort(key=lambda c: c['metadata'].get('position', 0))
    return chunks


def get_stats() -> dict:
    """获取 ChromaDB 统计信息"""
    collection = get_collection()
    return {
        'total_chunks': collection.count(),
        'collection_name': CHROMA_COLLECTION
    }
