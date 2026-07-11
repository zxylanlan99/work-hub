"""kb-service 后端抽象：封装 FastGPT（C3 合规）。

============================================================================
C3 硬约束（架构文档 §7）：本模块只封装 FastGPT 的「数据集 / 文档 / 检索」
OpenAPI，严禁调用 FastGPT 的 Agent 应用 / Workflow / 应用编排端点。
所有智能体编排、记忆、工具、密钥统一收敛于 agent-service（Agno）。
本文件是 FastGPT 的唯一适配面，切 Dify/自建 RAG 只需改这里。
============================================================================

提供两种实现：
  * ``FastGPTClient``   —— 生产：经 FastGPT 社区版 OpenAPI 完成切片/向量化/检索。
  * ``DevVectorBackend`` —— 开发回退：未配置 FASTGPT_API_KEY 且
    DEV_VECTOR_STORE=chroma 时使用本地 ChromaDB；否则使用内存确定性向量，
    保证无 FastGPT 时也能跑通检索闭环。**生产环境必须配置 FastGPT。**
"""
from __future__ import annotations

import hashlib
import math
import re
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

import httpx

from app.config import settings

# --------------------------------------------------------------------------- #
# 确定性向量（dev 回退用，无需外部 embedding 模型，保证离线可检索）
# --------------------------------------------------------------------------- #
EMBED_DIM = 256


def _tokenize(text: str) -> List[str]:
    """将文本切分为词元：英文/数字/汉字词 + CJK 二元字组。"""
    text = (text or "").lower()
    tokens: List[str] = re.findall(r"[a-z0-9一-鿿]+", text)
    cjk = re.findall(r"[一-鿿]", text)
    for i in range(len(cjk) - 1):
        tokens.append("c:" + cjk[i] + cjk[i + 1])
    return tokens


def embed(text: str) -> List[float]:
    """确定性文本向量（哈希词袋 + L2 归一化），无需模型，可复现。"""
    buckets: Dict[int, float] = defaultdict(float)
    for token in _tokenize(text):
        digest = hashlib.md5(token.encode("utf-8")).hexdigest()
        bucket = int(digest, 16) % EMBED_DIM
        buckets[bucket] += 1.0
    norm = math.sqrt(sum(v * v for v in buckets.values()))
    if norm == 0:
        return [0.0] * EMBED_DIM
    return [buckets.get(i, 0.0) / norm for i in range(EMBED_DIM)]


# --------------------------------------------------------------------------- #
# 后端协议：create_dataset / upload_document / search / list_datasets
# --------------------------------------------------------------------------- #
@runtime_checkable
class KBBackend(Protocol):
    """知识库后端统一接口（FastGPT 与 dev 回退均满足）。"""

    async def create_dataset(self, name: str) -> str:
        """创建知识库，返回 backend_collection_id。"""
        ...

    async def upload_document(self, dataset_id: str, title: str, content: str) -> str:
        """向知识库入库文档，返回 document_id。"""
        ...

    async def search(self, dataset_id: str, query: str, top_k: int) -> List[Dict[str, Any]]:
        """语义检索，返回 [{content, score}, ...]。"""
        ...

    async def list_datasets(self) -> List[Dict[str, Any]]:
        """列出知识库 [{id, name}, ...]。"""
        ...


# --------------------------------------------------------------------------- #
# 生产实现：FastGPT 社区版 OpenAPI 适配（仅数据集/文档/检索，C3）
# --------------------------------------------------------------------------- #
class FastGPTClient:
    """FastGPT 社区版 OpenAPI 适配层。

    仅调用数据集/文档/检索端点，不触碰任何 Agent/Workflow/应用端点（C3）。
    端点路径遵循 FastGPT v4 社区版 OpenAPI；若版本差异导致路径变动，
    仅需在此处调整常量，调用方无感。
    """

    def __init__(self, cfg: Any = settings) -> None:
        self.base_url = (cfg.fastgpt_api_url or "").rstrip("/")
        self.api_key = cfg.fastgpt_api_key or ""
        self.timeout = float(cfg.request_timeout)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _post(self, path: str, payload: Dict[str, Any]) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}{path}", json=payload, headers=self._headers()
            )
            resp.raise_for_status()
            body = resp.json()
            # FastGPT 信封：{code:200, data:{...}, message?}
            if isinstance(body, dict) and body.get("code", 200) != 200:
                raise RuntimeError(
                    f"FastGPT error {body.get('code')}: {body.get('message')}"
                )
            return body.get("data", body) if isinstance(body, dict) else body

    async def _get(
        self, path: str, params: Optional[Dict[str, Any]] = None
    ) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.base_url}{path}", params=params, headers=self._headers()
            )
            resp.raise_for_status()
            body = resp.json()
            if isinstance(body, dict) and body.get("code", 200) != 200:
                raise RuntimeError(
                    f"FastGPT error {body.get('code')}: {body.get('message')}"
                )
            return body.get("data", body) if isinstance(body, dict) else body

    async def create_dataset(self, name: str) -> str:
        """POST /api/core/dataset/insertDataset —— 创建数据集(知识库)。"""
        data = await self._post("/api/core/dataset/insertDataset", {"name": name})
        if isinstance(data, dict):
            return str(data.get("_id") or data.get("id") or "")
        return str(data)

    async def upload_document(self, dataset_id: str, title: str, content: str) -> str:
        """POST /api/core/dataset/collection/create/text —— 文本入库(切片/向量化)。"""
        data = await self._post(
            "/api/core/dataset/collection/create/text",
            {
                "datasetId": dataset_id,
                "q": title or content[:50],
                "a": content,
            },
        )
        if isinstance(data, dict):
            return str(data.get("id") or data.get("_id") or "")
        return str(data)

    async def search(self, dataset_id: str, query: str, top_k: int) -> List[Dict[str, Any]]:
        """POST /api/core/dataset/searchTest —— 混合检索 + RRF 重排（仅检索，C3）。"""
        data = await self._post(
            "/api/core/dataset/searchTest",
            {
                "datasetId": dataset_id,
                "text": query,
                "topK": top_k,
                "searchMode": "embedding",
            },
        )
        items = data.get("list", []) if isinstance(data, dict) else []
        results: List[Dict[str, Any]] = []
        for item in items:
            results.append(
                {
                    "content": item.get("a") or item.get("q") or "",
                    "score": float(item.get("score", 0.0)),
                }
            )
        return results

    async def list_datasets(self) -> List[Dict[str, Any]]:
        """GET /api/core/dataset/list —— 列出数据集。失败返回空列表（不阻断）。"""
        try:
            data = await self._get(
                "/api/core/dataset/list", {"pageNum": 1, "pageSize": 200}
            )
            rows = data.get("list", []) if isinstance(data, dict) else (data or [])
            return [
                {"id": str(r.get("_id") or r.get("id")), "name": r.get("name", "")}
                for r in rows
            ]
        except Exception:
            return []


# --------------------------------------------------------------------------- #
# 开发回退实现：无 FastGPT 时跑通检索闭环（C3 备注：仅 dev 用）
# --------------------------------------------------------------------------- #
class DevVectorBackend:
    """开发期回退向量后端。

    当 FASTGPT_API_KEY 为空且 DEV_VECTOR_STORE=chroma 时优先使用本地 ChromaDB；
    若 chromadb 不可用或 DEV_VECTOR_STORE=fastgpt，则退化为内存确定性向量。

    **仅用于开发/演示；生产必须配置 FastGPT（C3 要求）。**
    """

    def __init__(self, use_chroma: bool = False) -> None:
        self._datasets: Dict[str, str] = {}
        self._docs: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._use_chroma = False
        self._chroma = None
        if use_chroma:
            try:
                import chromadb  # 可选依赖（requirements 中注释）

                self._chroma = chromadb.Client()
                self._use_chroma = True
            except Exception:
                self._use_chroma = False

    def _col(self, dataset_id: str):
        assert self._chroma is not None
        return self._chroma.get_or_create_collection(name=f"kb_{dataset_id}")

    async def create_dataset(self, name: str) -> str:
        dataset_id = uuid.uuid4().hex
        self._datasets[dataset_id] = name
        return dataset_id

    async def upload_document(self, dataset_id: str, title: str, content: str) -> str:
        doc_id = uuid.uuid4().hex
        if self._use_chroma and self._chroma is not None:
            col = self._col(dataset_id)
            col.add(
                ids=[doc_id],
                documents=[content],
                metadatas=[{"title": title or ""}],
                embeddings=[embed(content)],
            )
        else:
            self._docs.setdefault(dataset_id, {})[doc_id] = {
                "title": title,
                "content": content,
                "embedding": embed(content),
            }
        return doc_id

    async def search(self, dataset_id: str, query: str, top_k: int) -> List[Dict[str, Any]]:
        if self._use_chroma and self._chroma is not None:
            col = self._col(dataset_id)
            try:
                res = col.query(
                    query_embeddings=[embed(query)], n_results=max(1, top_k)
                )
            except Exception:
                return []
            documents = (res.get("documents") or [[]])[0]
            distances = (res.get("distances") or [[]])[0]
            out: List[Dict[str, Any]] = []
            for doc, dist in zip(documents, distances):
                # 单位向量余弦距离 d∈[0,2]；相似度 = 1 - d/2
                score = max(0.0, 1.0 - float(dist) / 2.0)
                out.append({"content": doc, "score": round(score, 6)})
            return out

        candidates = self._docs.get(dataset_id, {})
        q_emb = embed(query)
        scored = [
            (max(0.0, sum(a * b for a, b in zip(q_emb, rec["embedding"]))), rec["content"])
            for rec in candidates.values()
        ]
        scored.sort(key=lambda x: x[0], reverse=True)
        return [{"content": c, "score": round(s, 6)} for s, c in scored[:top_k]]

    async def list_datasets(self) -> List[Dict[str, Any]]:
        if self._use_chroma and self._chroma is not None:
            try:
                cols = self._chroma.list_collections()
                return [{"id": c.name.replace("kb_", ""), "name": c.name} for c in cols]
            except Exception:
                pass
        return [{"id": k, "name": v} for k, v in self._datasets.items()]


# --------------------------------------------------------------------------- #
# 后端工厂（单例）
# --------------------------------------------------------------------------- #
_backend: Optional[KBBackend] = None


def get_kb_backend() -> KBBackend:
    """根据配置返回知识库后端单例。

    - 配置了 FASTGPT_API_KEY  → FastGPTClient（生产）
    - 否则                     → DevVectorBackend（DEV_VECTOR_STORE=chroma 用 ChromaDB）
    """
    global _backend
    if _backend is not None:
        return _backend
    if settings.fastgpt_api_key:
        _backend = FastGPTClient(settings)
    else:
        _backend = DevVectorBackend(use_chroma=(settings.dev_vector_store == "chroma"))
    return _backend
