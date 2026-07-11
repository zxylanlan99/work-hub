"""构建内置 Agno 智能体实例（懒加载 + 按 agent_id 缓存）。

- 缓存 Agent 实例以保证 Agno 会话记忆（session_id=conversation_id）跨轮次延续。
- agno 的 import 放在函数内部：未安装 agno 时本模块仍可被 import（静态检查友好）。
- 每个 Agent 通过 session_id 实现按会话隔离（C1）。
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from app.agents.specs import AgentSpec, get_agent_spec
from app.llm import LLMConfigurationError, get_model
from app.skills import resolve_agent_tools
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


class CustomAgentNotFoundError(Exception):
    """自定义智能体在 data-service 中不存在时抛出。"""


def build_custom_agent(
    agent_id: str,
    name: str,
    prompt: str,
    tool_names: List[str],
    skill_prompts: Optional[List[str]] = None,
):
    """构建自定义智能体 Agno Agent（不缓存）。

    自定义智能体 = 用户 prompt + 绑定 Skill 的指令 + 工具白名单（运行时装配）。

    Args:
        agent_id: 自定义智能体 id（data-service 主键，字符串形式）。
        name: 智能体名称。
        prompt: 用户定义的系统提示词。
        tool_names: 绑定 Skill 解析出的工具白名单并集（web_search/
            knowledge_base / code_exec；code_exec 默认禁用）。
        skill_prompts: 各绑定 Skill 的 prompt（追加到系统指令中）。

    Raises:
        LLMConfigurationError: LLM 未配置。
        ValueError: 工具名非法（由 resolve_agent_tools 校验）。
    """
    # 组合指令：用户 prompt + 各 Skill prompt
    instructions = prompt or ""
    if skill_prompts:
        extra = "\n\n".join(p for p in skill_prompts if p)
        if extra:
            instructions = f"{instructions}\n\n{extra}" if instructions else extra

    model = get_model()  # 可能抛出 LLMConfigurationError
    tools = resolve_agent_tools(tool_names)

    from agno.agent import Agent

    agent = Agent(
        name=name,
        description=name,
        model=model,
        instructions=instructions,
        tools=tools,
        markdown=True,
    )
    return agent


async def get_or_build_custom_agent_async(agent_id: str):
    """返回缓存的自定义 Agent；不存在则从 data-service 读取定义并构建。

    加载流程：data-service 取自定义智能体 -> 解析其 skill_ids 对应的 Skill
    定义 -> 收集工具白名单并集与 Skill prompt -> 构建 Agno Agent 并缓存。
    """
    if agent_id in _AGENT_CACHE:
        return _AGENT_CACHE[agent_id]

    from app.clients import data_service as ds

    agent_def = await ds.get_agent(agent_id)
    if not agent_def:
        raise CustomAgentNotFoundError(agent_id)

    skill_defs = await ds.resolve_skill_definitions(agent_def.get("skill_ids") or [])
    tool_names: List[str] = []
    skill_prompts: List[str] = []
    for skill in skill_defs:
        tool_names.extend(skill.get("tools") or [])
        if skill.get("prompt"):
            skill_prompts.append(skill["prompt"])

    # 工具名去重保序
    seen: set = set()
    deduped: List[str] = []
    for name in tool_names:
        if name not in seen:
            seen.add(name)
            deduped.append(name)

    agent = build_custom_agent(
        agent_id,
        agent_def.get("name", agent_id),
        agent_def.get("prompt", ""),
        deduped,
        skill_prompts,
    )
    _AGENT_CACHE[agent_id] = agent
    return agent
