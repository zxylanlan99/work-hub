"""智能体对话 + 自定义智能体路由（T03 + T04）。

端点（统一响应信封 {code, data, message}）：
- GET  /api/agents                          列出内置智能体
- POST /api/agents/{agent_id}/chat         对话（内置或自定义；body {conversation_id, message}）
- GET  /api/conversations/{conversation_id} 取会话历史
- POST /api/agent                           创建自定义智能体（持久化到 data-service）
- DELETE /api/agent/{id}                    删除自定义智能体（级联清理其 conversation 记忆）

记忆隔离维度：conversation_id（C1）。不同会话互不可见。
自定义智能体内存清理：DELETE /api/agent/{id} 时按 agent_id 清除关联会话。
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.factory import (
    CustomAgentNotFoundError,
    get_agent_spec,
    get_or_build_agent,
    get_or_build_custom_agent_async,
)
from app.agents import list_agent_specs
from app.clients import data_service
from app.clients.data_service import DataServiceError
from app.llm import LLMConfigurationError
from app.memory import memory
from app.response import ok

router = APIRouter(prefix="/api", tags=["agents"])


# ----------------------------- Schemas ----------------------------- #
class ChatRequest(BaseModel):
    conversation_id: str = Field(
        default="",
        description="会话ID，用于记忆隔离；为空时自动生成。",
    )
    message: str = Field(..., description="用户消息")


class AgentCreate(BaseModel):
    """创建自定义智能体请求体（V2-AGENT-002）。"""
    name: str = Field(..., min_length=1, description="智能体名称")
    prompt: str = Field(..., min_length=1, description="系统提示词")
    skillIds: List[str] = Field(
        default_factory=list, description="绑定的 Skill id 列表（builtin: 或自定义）"
    )
    knowledgeScope: Optional[str] = Field(default=None, description="知识库作用域（可选）")
    model: Optional[str] = Field(default=None, description="指定模型（可选）")


# ----------------------------- Routes ------------------------------ #
@router.get("/agents")
async def list_agents() -> Dict[str, Any]:
    """列出全部内置智能体。"""
    return ok(
        [
            {"id": s.id, "name": s.name, "description": s.description}
            for s in list_agent_specs()
        ]
    )


@router.post("/agents/{agent_id}/chat")
async def chat(agent_id: str, body: ChatRequest) -> Dict[str, Any]:
    """与指定智能体对话（内置或自定义；非流式 MVP）。"""
    spec = get_agent_spec(agent_id)
    if spec is not None:
        agent = get_or_build_agent(agent_id)
    else:
        # 自定义智能体：从 data-service 读取定义并运行时装配 Agno Agent
        try:
            agent = await get_or_build_custom_agent_async(agent_id)
        except CustomAgentNotFoundError:
            raise HTTPException(status_code=404, detail=f"未知智能体：{agent_id}")
        except DataServiceError as exc:
            raise HTTPException(
                status_code=exc.status_code, detail=f"加载自定义智能体失败：{exc}"
            )

    # conversation_id 为空则自动生成（记忆隔离的桶 key）
    conversation_id = body.conversation_id or str(uuid.uuid4())

    # 1) 记录用户消息（仅写入该 conversation_id，隔离不变量）
    memory.add(conversation_id, agent_id, "user", body.message)

    try:
        # 非流式 MVP：一次性获取完整回复。
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

    return ok(
        {
            "conversation_id": conversation_id,
            "reply": reply,
            "agent_id": agent_id,
        }
    )


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str) -> Dict[str, Any]:
    """获取指定会话的历史消息（按 conversation_id 隔离读取）。"""
    conv: Optional[Dict[str, Any]] = memory.get(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return ok(
        {
            "conversation_id": conv["conversation_id"],
            "agent_id": conv["agent_id"],
            "messages": conv["messages"],
        }
    )


@router.post("/agent")
async def create_custom_agent(body: AgentCreate) -> Dict[str, Any]:
    """创建自定义智能体（V2-AGENT-002）。

    校验 skillIds 是否均可解析（内置或自定义），再持久化到 data-service，
    返回 {id}。
    """
    # 1) 校验 skillIds（缺失 -> 400）
    try:
        await data_service.resolve_skill_definitions(body.skillIds)
    except DataServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    # 2) 持久化到 data-service
    try:
        result = await data_service.create_agent(
            body.name, body.prompt, body.skillIds, body.knowledgeScope, body.model
        )
    except DataServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    agent_id = result.get("id") if isinstance(result, dict) else result
    return ok({"id": agent_id})


@router.delete("/agent/{agent_id}")
async def delete_custom_agent(agent_id: int) -> Dict[str, Any]:
    """删除自定义智能体（V2-AGENT-002）。

    级联清理：先按 agent_id 清除 agent-service 中该智能体的全部 conversation
    记忆（跨智能体不可见，C1），再删除 data-service 记录。
    """
    # 1) 级联清理记忆
    memory.clear_by_agent(str(agent_id))
    # 2) 删除 data-service 记录
    try:
        await data_service.delete_agent(agent_id)
    except DataServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    return ok({"id": agent_id})
