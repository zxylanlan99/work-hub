"""knowledge_base 工具：检索 kb-service（FastGPT 网关，仅检索后端，C3）。

供 kb_qa / general 等智能体在对话中调用，实现检索增强（RAG）。
- 调用 kb-service 的 POST /api/kb/search（与 V2.0 架构 §3.4 契约一致）。
- kb-service 不可达 / 出错时返回友好提示（不抛异常中断对话）。
- 本工具不调用 FastGPT 的 Agent / Workflow 端点（C3 硬约束）。
"""

from __future__ import annotations

import httpx

from app.config import settings


def knowledge_base(query: str) -> str:
    """检索个人知识库以回答用户问题。

    当用户问题涉及 StudyMind 中已沉淀的知识条目、成稿或导入的资讯时，
    调用本工具从 kb-service 检索相关片段。返回检索到的文本片段与来源；
    若知识库无相关内容，返回提示信息。请勿用于与知识库无关的闲聊。
    """
    url = f"{settings.KB_SERVICE_URL.rstrip('/')}/api/kb/search"
    payload = {"query": query, "topK": settings.KB_SEARCH_TOP_K}
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.RequestError as exc:
        return (
            f"[知识库检索失败] 无法连接知识库服务（{settings.KB_SERVICE_URL}）：{exc}。"
            "请确认 kb-service 已启动，或稍后重试。"
        )
    except Exception as exc:  # noqa: BLE001 - 工具内异常需转为友好文本
        return f"[知识库检索失败] 检索时发生错误：{exc}"

    # 兼容多种响应信封：data.chunks / chunks / data.data.chunks
    chunks: list = []
    if isinstance(data, dict):
        chunks = data.get("chunks") or (data.get("data") or {}).get("chunks") or []

    if not chunks:
        return "知识库中暂无与查询相关的内容。"

    lines: list = []
    for i, chunk in enumerate(chunks, start=1):
        title = chunk.get("title", "未命名来源")
        content = chunk.get("content", "")
        snippet = content[:300]
        lines.append(f"[{i}] 来源：{title}\n{snippet}")
    return "\n\n".join(lines)
