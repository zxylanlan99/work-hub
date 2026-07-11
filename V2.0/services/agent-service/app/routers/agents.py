"""智能体对话路由。

端点（与 T03 任务契约一致）：
- GET  /api/agents                          列出内置智能体
- POST /api/agents/{agent_id}/chat         对话（请求体 {conversation_id, message}）
- GET  /api/conversations/{conversation_id} 取会话历史

记忆隔离维度：conversation_id（C1）。不同会话互不可见。
对话历史 MVP 自存于 agent-service（与 data-service 解耦，T02 未建会话表）。
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents import get_agent_spec, get_or_build_agent, list_agent_specs
from app.llm import LLMConfigurationError
from app.memory import memory

router = APIRouter(prefix="/api", tags=["agents"])


# ----------------------------- Schemas ----------------------------- #
class ChatRequest(BaseModel):
    conversation_id: str = Field(
        default="",
        description="会话ID，用于记忆隔离；为空时自动生成。",
    )
    message: str = Field(..., description="用户消息")


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str
    agent_id: str


class AgentInfo(BaseModel):
    id: str
    name: str
    description: str


class HistoryMessage(BaseModel):
    role: str
    content: str
    ts: float


class ConversationHistory(BaseModel):
    conversation_id: str
    agent_id: str
    messages: List[HistoryMessage]


# ----------------------------- Routes ------------------------------ #
@router.get("/agents", response_model=List[AgentInfo])
async def list_agents() -> List[AgentInfo]:
    """列出全部内置智能体。"""
    return [
        AgentInfo(id=s.id, name=s.name, description=s.description)
        for s in list_agent_specs()
    ]


@router.post("/agents/{agent_id}/chat", response_model=ChatResponse)
async def chat(agent_id: str, body: ChatRequest) -> ChatResponse:
    """与指定智能体对话（非流式 MVP）。"""
    spec = get_agent_spec(agent_id)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"未知智能体：{agent_id}")

    # conversation_id 为空则自动生成（记忆隔离的桶 key）
    conversation_id = body.conversation_id or str(uuid.uuid4())

    # 1) 记录用户消息（仅写入该 conversation_id，隔离不变量）
    memory.add(conversation_id, agent_id, "user", body.message)

    try:
        agent = get_or_build_agent(agent_id)
        # 非流式 MVP：一次性获取完整回复。
        # 流式扩展点：后续可改用 agent.run(..., stream=True) 并通过
        # fastapi.responses.StreamingResponse（SSE/WebSocket）实时推送 token。
        response = await asyncio.to_thread(
            agent.run, body.message, session_id=conversation_id
        )
        reply = getattr(response, "content", "") or ""
    except LLMConfigurationError as exc:
        # LLM 未配置 -> 明确引导，不暴露底层异常
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"智能体调用失败：{exc}")

    if not reply.strip():
        reply = "（模型未返回内容，请检查 LLM 配置后重试。）"

    # 2) 记录助手回复（同样仅写入该 conversation_id）
    memory.add(conversation_id, agent_id, "assistant", reply)

    return ChatResponse(conversation_id=conversation_id, reply=reply, agent_id=agent_id)


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationHistory,
    responses={404: {"description": "会话不存在"}},
)
async def get_conversation(conversation_id: str) -> ConversationHistory:
    """获取指定会话的历史消息（按 conversation_id 隔离读取）。"""
    conv: Optional[Dict[str, Any]] = memory.get(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return ConversationHistory(
        conversation_id=conv["conversation_id"],
        agent_id=conv["agent_id"],
        messages=[HistoryMessage(**m) for m in conv["messages"]],
    )
