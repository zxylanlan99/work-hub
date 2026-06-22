"""
向量化模块 — 使用 all-MiniLM-L6-v2 本地模型将文本转为向量
模型路径: StudyMind_TRAE_V1.1/all-MiniLM-L6-v2
输出维度: 384
"""
import logging
from typing import List
import threading

logger = logging.getLogger(__name__)

# 全局模型实例 (线程安全懒加载)
_model = None
_model_lock = threading.Lock()


def get_model():
    """懒加载 sentence-transformers 模型（线程安全）"""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from config import MODEL_PATH
                logger.info(f"加载 embedding 模型: {MODEL_PATH}")
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer(MODEL_PATH)
                logger.info(f"模型加载完成，输出维度: {_model.get_sentence_embedding_dimension()}")
    return _model


def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    将多个文本转为向量

    Args:
        texts: 文本列表

    Returns:
        向量列表，每个向量是 384 维 float 列表
    """
    if not texts:
        return []

    model = get_model()
    embeddings = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return embeddings.tolist()


def embed_query(text: str) -> List[float]:
    """
    将单条查询文本转为向量

    Args:
        text: 查询文本

    Returns:
        384 维向量
    """
    model = get_model()
    embedding = model.encode(text, show_progress_bar=False, convert_to_numpy=True)
    return embedding.tolist()
