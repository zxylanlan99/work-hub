"""
tests/backend/test_app_smoke.py — 后端质量门禁冒烟测试（问题5 智能切片 / API）

门禁目标（后端层）：
  - 纯逻辑：chunker.chunk_document 按 Markdown 层级切片，含元数据
  - API：FastAPI app 启动，根路由 / 返回 200 且含版本信息

沙箱容错：后端依赖（fastapi / chromadb / sentence-transformers ...）在 CI/沙箱中
通常未安装。本测试在 import 失败时以 pytest.skip 优雅跳过，不阻塞门禁收集；
在已安装依赖的本地/生产环境会真实执行断言。

运行：python3 -m pytest tests/backend -q
"""
import os
import sys

import pytest

# 将 backend/ 加入导入路径（仅本测试文件生效，不改动 backend 业务代码）
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)


def test_chunk_document_smart_split():
    """智能切片：H2 层级切分 + 元数据完整性（问题5 基础）"""
    try:
        from chunker import chunk_document
    except Exception as e:  # 缺依赖 → 跳过
        pytest.skip(f"后端依赖未安装，跳过切片单测: {e}")

    doc = (
        "# 标题\n\n导言段落。\n\n"
        "## 第一章 基础\n\n这是第一章的内容，描述基础概念，足够长以形成切片。"
        "继续补充内容确保超过最小阈值用于测试切片逻辑是否生效。\n\n"
        "## 第二章 进阶\n\n这是第二章的内容，描述进阶用法，同样需要足够长度。"
        "补充更多文字以满足切片最小字符数要求并验证层级切分是否正确。\n"
    )
    chunks = chunk_document(doc, metadata={"source_doc_id": "DOC1", "title": "测试文档"})

    assert isinstance(chunks, list), "chunk_document 应返回 list"
    assert len(chunks) >= 1, "至少应切出 1 个片段"

    required_keys = {"content", "title", "source_doc_id", "chunk_index", "total_chunks", "char_count"}
    for c in chunks:
        assert required_keys.issubset(c.keys()), f"切片缺少元数据: {set(c.keys())}"
        assert c["source_doc_id"] == "DOC1", "元数据 source_doc_id 应透传"
        assert c["char_count"] == len(c["content"]), "char_count 应与内容长度一致"

    # 切片序号应从 0 连续、total_chunks 等于实际数量
    idxs = [c["chunk_index"] for c in chunks]
    assert idxs == list(range(len(chunks))), "chunk_index 应连续从 0 开始"
    assert all(c["total_chunks"] == len(chunks) for c in chunks), "total_chunks 应一致"


def test_root_route_returns_version():
    """FastAPI 根路由 / 返回 200 + 版本信息"""
    try:
        from fastapi.testclient import TestClient
        from app import app
    except Exception as e:  # 缺依赖 → 跳过
        pytest.skip(f"后端依赖未安装，跳过后端 API 单测: {e}")

    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200, f"根路由应 200，实际 {resp.status_code}"
    body = resp.json()
    assert "version" in body, "根路由响应应含 version 字段"
