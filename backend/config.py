"""
StudyMind 知识库后端配置
"""
import os
from pathlib import Path

# 项目根目录 (backend/ 的上一级)
PROJECT_ROOT = Path(__file__).parent.parent

# 模型路径 — all-MiniLM-L6-v2 本地模型
MODEL_PATH = str(PROJECT_ROOT / "all-MiniLM-L6-v2")

# ChromaDB 持久化存储路径
CHROMA_DB_PATH = str(PROJECT_ROOT / "backend" / "chroma_data")

# 上传文件存储路径
UPLOAD_DIR = str(PROJECT_ROOT / "backend" / "uploads")

# ChromaDB 集合名称
CHROMA_COLLECTION = "knowledge_chunks"

# 向量维度 (all-MiniLM-L6-v2 输出 384 维)
EMBEDDING_DIM = 384

# 搜索默认参数
DEFAULT_SEARCH_TOP_K = 10
MIN_SIMILARITY_THRESHOLD = 0.3  # 余弦相似度低于此值的结果不返回

# 服务器配置
HOST = "0.0.0.0"
PORT = 8765

# 确保目录存在
os.makedirs(CHROMA_DB_PATH, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
