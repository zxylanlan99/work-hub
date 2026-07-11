"""自定义 Skill 路由（T04，V2-AGENT-003）。

端点（与契约一致）：
- POST /api/skill       创建自定义 Skill（持久化到 data-service ``agent_skills``）
- DELETE /api/skill/{id} 删除自定义 Skill

请求体：``{name, prompt, tools:['web_search'|'knowledge_base'|'code_exec']}``
返回：``{code:0, data:{id}, message:'ok'}``（统一信封）。

Skill -> Agno Tool 的装配在 ``app/skills.py``；本路由只负责 CRUD 与校验。
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.clients.data_service import DataServiceError, create_skill, delete_skill
from app.response import ok
from app.skills import validate_tool_names

router = APIRouter(prefix="/api", tags=["skill"])


class SkillCreate(BaseModel):
    """创建自定义 Skill 请求体。"""

    name: str = Field(..., min_length=1, description="Skill 名称")
    prompt: str = Field(default="", description="Skill 提示词（注入到绑定智能体指令）")
    tools: List[str] = Field(
        default_factory=list,
        description="工具白名单子集：web_search / knowledge_base / code_exec",
    )


@router.post("/skill")
async def create_custom_skill(body: SkillCreate):
    """创建自定义 Skill，落库 data-service 并返回 id。"""
    # 1) 工具名白名单校验（非法 -> 400）
    try:
        validate_tool_names(body.tools)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # 2) 持久化到 data-service
    try:
        data = await create_skill(body.name, body.prompt, body.tools)
    except DataServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    skill_id = data.get("id") if isinstance(data, dict) else data
    return ok({"id": skill_id})


@router.delete("/skill/{skill_id}")
async def delete_custom_skill(skill_id: int):
    """删除自定义 Skill（builtin Skill 不可删，仅自定义可删）。"""
    try:
        await delete_skill(skill_id)
    except DataServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    return ok({"id": skill_id})
