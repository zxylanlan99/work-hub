"""内置 / 自定义 Skill -> Agno Tool 装配（T04）。

工具白名单（PRD V2-AGENT-002/003）：``web_search`` / ``knowledge_base`` /
``code_exec``（code_exec 默认禁用，C2/C3 安全默认）。

- 内置 Skill 由代码常量提供（``BUILTIN_SKILLS``），不落库。
- 自定义 Skill 落库于 data-service（``agent_skills`` 表），运行时经 data-service 读取。
- ``resolve_agent_tools`` 将白名单名解析为 Agno 可调用对象；``code_exec`` 仅在
  ``settings.CODE_EXEC_ENABLED=True`` 时纳入（默认禁用）。
"""

from __future__ import annotations

from typing import Any, Dict, List

from app.config import settings
from app.tools.code_exec_tool import code_exec
from app.tools.kb_tool import knowledge_base
from app.tools.web_search_tool import web_search

# 工具白名单
SKILL_TOOL_WHITELIST: List[str] = ["web_search", "knowledge_base", "code_exec"]

# 工具名 -> Agno 可调用对象
_AGNO_TOOLS: Dict[str, Any] = {
    "web_search": web_search,
    "knowledge_base": knowledge_base,
    "code_exec": code_exec,
}

# 内置 Skill 常量（与 data-service 的 BUILTIN_SKILLS 保持一致；id 以 builtin: 前缀）
BUILTIN_SKILLS: List[Dict[str, Any]] = [
    {
        "id": "builtin:kb_qa",
        "name": "知识问答",
        "prompt": (
            "基于用户个人知识库回答问题：在涉及已沉淀知识、成稿或导入资讯时，"
            "调用 knowledge_base 工具检索后再作答，并标注来源；"
            "无相关内容时明确说明「知识库中暂无相关内容」。"
        ),
        "tools": ["knowledge_base"],
        "scope": "builtin",
        "builtin": True,
    },
    {
        "id": "builtin:web_research",
        "name": "联网调研",
        "prompt": (
            "需要最新资讯或外部事实时，调用 web_search 工具联网检索后再作答，"
            "并给出信息来源链接；检索为空时明确说明。"
        ),
        "tools": ["web_search"],
        "scope": "builtin",
        "builtin": True,
    },
]


def get_builtin_skill(skill_id: str) -> Dict[str, Any]:
    """按 id 取内置 Skill（builtin: 前缀）；不存在返回 None。"""
    for skill in BUILTIN_SKILLS:
        if skill["id"] == skill_id:
            return skill
    return None


def validate_tool_names(tool_names: List[str]) -> None:
    """校验工具名是否均属白名单；非法抛出 ValueError。"""
    for name in tool_names or []:
        if name not in SKILL_TOOL_WHITELIST:
            raise ValueError(
                f"非法工具名: {name!r}（允许: {SKILL_TOOL_WHITELIST}）"
            )


def resolve_agent_tools(tool_names: List[str]) -> List[Any]:
    """将白名单工具名解析为 Agno 可调用对象列表。

    - ``code_exec`` 仅在 ``settings.CODE_EXEC_ENABLED=True`` 时纳入（默认禁用，C2/C3）。
    - 非法工具名抛 ValueError（由路由层转 400）。
    """
    validate_tool_names(tool_names)
    tools: List[Any] = []
    for name in tool_names or []:
        if name == "code_exec" and not settings.CODE_EXEC_ENABLED:
            continue
        call = _AGNO_TOOLS.get(name)
        if call is not None:
            tools.append(call)
    return tools
