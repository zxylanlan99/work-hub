"""内置智能体定义（Agno 底座）。

至少 3 个内置智能体：general（通用学习助手）、review_coach（复习教练）、
kb_qa（知识问答，调用 kb-service 检索）。
其余 2 个（planner / writer 等）可在后续按相同模式扩展。
"""

from app.agents.factory import build_agent, get_or_build_agent
from app.agents.specs import AgentSpec, BUILTIN_AGENTS, get_agent_spec, list_agent_specs

__all__ = [
    "AgentSpec",
    "BUILTIN_AGENTS",
    "get_agent_spec",
    "list_agent_specs",
    "build_agent",
    "get_or_build_agent",
]
