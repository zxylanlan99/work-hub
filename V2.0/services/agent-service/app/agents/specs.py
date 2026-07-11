"""内置智能体规格（纯数据，import 安全，不依赖 agno）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class AgentSpec:
    """智能体规格：id / name / description / system_prompt / 绑定的工具名。"""

    id: str
    name: str
    description: str
    system_prompt: str
    tool_names: List[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.tool_names is None:
            object.__setattr__(self, "tool_names", [])


# 墨研（Ink Scholar）学习语境、中文 system prompt。
_GENERAL_PROMPT = (
    "你是 StudyMind（墨研）中的「通用学习助手」。\n"
    "你帮助用户理解概念、梳理思路、制定学习方法、解答学习中的疑问。\n"
    "要求：\n"
    "1. 回答简洁、准确、有条理，使用中文；涉及专业概念时给出可理解的解释。\n"
    "2. 若用户问题涉及 StudyMind 中已沉淀的知识，可调用 knowledge_base 工具检索后再作答，"
    "并尽量标注信息来源。\n"
    "3. 若用户需要最新资讯或外部事实，可调用 web_search 工具联网检索后再作答。\n"
    "4. 不确定时坦诚说明，不要编造；可主动给出进一步学习的建议。\n"
    "5. 语气平和、鼓励，符合「墨研」安静克制的设计语言。"
)

_REVIEW_COACH_PROMPT = (
    "你是 StudyMind（墨研）中的「复习教练」。\n"
    "你擅长间隔重复（SM-2）、主动回忆、费曼技巧等科学复习方法，"
    "帮助用户把薄弱主题转化为可执行、可入队的复习条目。\n"
    "要求：\n"
    "1. 根据用户给出的薄弱主题 / 掌握度，生成针对性复习卡片（问题 + 答案）。\n"
    "2. 建议合理的复习节奏（遵循 SM-2 间隔重复：1/3/7/16/35 天等），并解释理由。\n"
    "3. 用中文、结构化输出；必要时给出自测方法与记忆锚点。\n"
    "4. 不调用外部知识库，专注复习策略与卡片设计。"
)

_KB_QA_PROMPT = (
    "你是 StudyMind（墨研）中的「知识问答助手」。\n"
    "你的核心职责是基于用户个人知识库回答问题，实现检索增强（RAG）。\n"
    "要求：\n"
    "1. 收到涉及知识沉淀、成稿、已导入资讯的问题时，必须调用 knowledge_base 工具检索，"
    "再基于检索片段作答。\n"
    "2. 回答须标注信息来源（引用检索返回的来源标题），无引用时明确说明「知识库中暂无相关内容」。\n"
    "3. 仅依据检索内容作答，不臆造；检索为空时引导用户补充知识或换一种问法。\n"
    "4. 使用中文，条理清晰。"
)


# 内置智能体清单（minimum 3 个）
BUILTIN_AGENTS: List[AgentSpec] = [
    AgentSpec(
        id="general",
        name="通用学习助手",
        description="解答学习疑问、梳理思路、制定学习方法，可按需检索知识库或联网搜索。",
        system_prompt=_GENERAL_PROMPT,
        tool_names=["knowledge_base", "web_search"],
    ),
    AgentSpec(
        id="review_coach",
        name="复习教练",
        description="基于薄弱主题生成针对性复习卡片与 SM-2 间隔重复节奏。",
        system_prompt=_REVIEW_COACH_PROMPT,
        tool_names=[],
    ),
    AgentSpec(
        id="kb_qa",
        name="知识问答",
        description="基于个人知识库（kb-service 检索）回答，附带来源引用。",
        system_prompt=_KB_QA_PROMPT,
        tool_names=["knowledge_base"],
    ),
]


def get_agent_spec(agent_id: str):
    """按 id 获取内置智能体规格；不存在返回 None。"""
    for spec in BUILTIN_AGENTS:
        if spec.id == agent_id:
            return spec
    return None


def list_agent_specs() -> List[AgentSpec]:
    """返回全部内置智能体规格（供 GET /api/agents）。"""
    return list(BUILTIN_AGENTS)
