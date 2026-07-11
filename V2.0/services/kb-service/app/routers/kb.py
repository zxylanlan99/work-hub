"""kb-service HTTP 路由（仅数据集/文档/检索，C3 硬约束）。

============================================================================
C3 硬约束（架构文档 §7）：本路由严禁暴露任何 FastGPT Agent/Workflow/应用编排
端点；只提供 dataset / document / search 三类的无状态检索后端能力。
所有智能体编排、记忆、工具、密钥统一收敛于 agent-service（Agno）。
============================================================================
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.fastgpt_client import get_kb_backend
from app.response import ok

router = APIRouter(prefix="/api/kb", tags=["kb"])


class DatasetCreate(BaseModel):
    """创建知识库请求体。"""

    name: str = Field(..., min_length=1, description="知识库名称")


class DocumentCreate(BaseModel):
    """文档入库请求体。"""

    dataset_id: str = Field(
        ..., description="目标知识库的 backend_collection_id（由 POST /datasets 返回）"
    )
    title: str = Field(default="", description="文档标题")
    content: str = Field(..., min_length=1, description="文档正文（交由 FastGPT 切片/向量化）")


class SearchRequest(BaseModel):
    """语义检索请求体。"""

    dataset_id: str = Field(..., description="知识库 backend_collection_id")
    query: str = Field(..., min_length=1, description="检索 query")
    top_k: int = Field(default=5, ge=1, le=50, description="返回条数")


@router.post("/datasets")
async def create_dataset(payload: DatasetCreate) -> dict:
    """创建知识库，返回 {backend_collection_id}（供 data-service knowledge.py 存储映射）。"""
    try:
        backend_id = await get_kb_backend().create_dataset(payload.name)
    except Exception as exc:  # noqa: BLE001 — 统一转为 502 上游错误
        raise HTTPException(status_code=502, detail=f"创建知识库失败: {exc}")
    return ok({"backend_collection_id": backend_id})


@router.get("/datasets")
async def list_datasets() -> dict:
    """列出知识库 [{id, name}, ...]。"""
    try:
        rows = await get_kb_backend().list_datasets()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"获取知识库列表失败: {exc}")
    return ok(rows)


@router.post("/documents")
async def upload_document(payload: DocumentCreate) -> dict:
    """文档入库，返回 {document_id}。"""
    try:
        doc_id = await get_kb_backend().upload_document(
            payload.dataset_id, payload.title, payload.content
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"文档入库失败: {exc}")
    return ok({"document_id": doc_id})


@router.post("/search")
async def search(payload: SearchRequest) -> dict:
    """语义检索，返回 [{content, score}, ...]。"""
    try:
        results: List[dict] = await get_kb_backend().search(
            payload.dataset_id, payload.query, payload.top_k
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"检索失败: {exc}")
    return ok(results)


class NewsIngestRequest(BaseModel):
    """资讯入库请求体（T08，V2-NEWS-001）。

    text 为正文（交由 FastGPT 切片 / BGE-M3 向量化）；title / meta 为可选元数据。
    """

    text: str = Field(..., min_length=1, description="资讯正文（交由 FastGPT 切片/向量化）")
    title: str = Field(default="", description="资讯标题")
    meta: Optional[dict] = Field(default=None, description="可选元数据（来源/链接等）")


@router.post("/ingest-news")
async def ingest_news(payload: NewsIngestRequest) -> dict:
    """资讯入库：建文档 + 切片 + BGE-M3 向量化（仅数据集/文档 OpenAPI，C3 合规）。

    流程：create_dataset（建知识库）-> upload_document（文本入库，切片/向量化由
    FastGPT 服务端完成）。返回 {collectionId, chunkCount}，其中 collectionId 即
    data-service news_items.backend_collection_id；chunkCount 为基于正文长度的估计值
    （精确切片数由 FastGPT 服务端计算，MVP 以字符阈值估算，供前端展示）。

    严禁调用 FastGPT 的 Agent 应用 / Workflow / 应用编排端点（C3 硬约束）。
    """
    try:
        collection_id = await get_kb_backend().create_dataset(payload.title or "news")
        await get_kb_backend().upload_document(
            collection_id, payload.title, payload.text
        )
        # chunkCount 估计：按 kb_news_chunk_size 字符阈值向上取整（>=1）
        chunk_count = max(
            1,
            (len(payload.text) + settings.kb_news_chunk_size - 1)
            // settings.kb_news_chunk_size,
        )
    except Exception as exc:  # noqa: BLE001 — 统一转为 502 上游错误
        raise HTTPException(status_code=502, detail=f"资讯入库失败: {exc}")
    return ok({"collectionId": collection_id, "chunkCount": chunk_count})
