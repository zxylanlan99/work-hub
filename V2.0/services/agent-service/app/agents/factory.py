"""构建内置 Agno 智能体实例（懒加载 + 按 agent_id 缓存）。

- 缓存 Agent 实例以保证 Agno 会话记忆（session_id=conversation_id）跨轮次延续。
- agno 的 import 放在函数内部：未安装 agno 时本模块仍可被 import（静态检查友好）。
- 每个 Agent 通过 session_id 实现按会话隔离（C1）。
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.agents.specs import AgentSpec, get_agent_spec
from app.llm import LLMConfigurationError, get_model
from app.tools.kb_tool import knowledge_base
from app.tools.web_search_tool import web_search

# 工具名 -> 实际可调用对象
_TOOL_REGISTRY: Dict[str, Any] = {
    "knowledge_base": knowledge_base,
    "web_search": web_search,
}

# 按 agent_id 缓存的 Agent 实例（保证会话记忆延续）
_AGENT_CACHE: Dict[str, Any] = {}


def build_agent(agent_id: str):
    """构建并返回一个 Agno Agent 实例（不缓存）。

    Raises:
        ValueError: agent_id 未知。
        LLMConfigurationError: LLM 未配置（由 get_model 抛出）。
    """
    spec: Optional[AgentSpec] = get_agent_spec(agent_id)
    if spec is None:
        raise ValueError(f"未知智能体：{agent_id}")

    model = get_model()  # 可能抛出 LLMConfigurationError
    tools = [_TOOL_REGISTRY[t] for t in spec.tool_names if t in _TOOL_REGISTRY]

    from agno.agent import Agent

    agent = Agent(
        name=spec.name,
        description=spec.description,
        model=model,
        instructions=spec.system_prompt,
        tools=tools,
        markdown=True,
    )
    return agent


def get_or_build_agent(agent_id: str):
    """返回缓存的 Agent 实例；不存在则构建并缓存。"""
    if agent_id in _AGENT_CACHE:
        return _AGENT_CACHE[agent_id]
    agent = build_agent(agent_id)
    _AGENT_CACHE[agent_id] = agent
    return agent
