"""自定义智能体 / 自定义 Skill CRUD（T04，V2-AGENT-002 / 003）。

仅管理「自定义」实体；内置智能体 / 内置 Skill 由代码常量提供，不落库。

端点：
  POST   /api/db/agent_skills       创建自定义 Skill
  GET    /api/db/agent_skills       列出（内置 + 自定义，便于前端绑定）
  GET    /api/db/agent_skills/{id}  详情（仅自定义）
  DELETE /api/db/agent_skills/{id}  删除自定义 Skill
  POST   /api/db/agents             创建自定义智能体
  GET    /api/db/agents             列出自定义智能体
  GET    /api/db/agents/{id}        详情
  PUT    /api/db/agents/{id}        更新（部分更新，V2-AGENT-005 真编辑）
  DELETE /api/db/agents/{id}        删除（其 conversation 记忆级联清理由 agent-service 负责）

记忆级联清理约定：删除自定义智能体时，由 agent-service 调自身 /api/agent/{id}
删除并清掉该 agent_id 的 conversation 记忆；本路由只负责 DB 记录删除。
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["custom-agents"])

# 内置 Skill 常量（与 agent-service app/skills.BUILTIN_SKILLS 保持一致）
BUILTIN_SKILLS: List[Dict[str, Any]] = [
    {
        "id": "builtin:kb_qa",
        "name": "知识问答",
        "prompt": "基于用户个人知识库回答问题，调用 knowledge_base 检索并标注来源。",
        "tools": ["knowledge_base"],
        "scope": "builtin",
        "builtin": True,
    },
    {
        "id": "builtin:web_research",
        "name": "联网调研",
        "prompt": "需要最新资讯时调用 web_search 联网检索并给出来源链接。",
        "tools": ["web_search"],
        "scope": "builtin",
        "builtin": True,
    },
]


# ----------------------------- Skill ----------------------------- #
@router.post("/api/db/agent_skills")
def create_skill(payload: schemas.AgentSkillCreate, db: Session = Depends(get_db)):
    obj = models.AgentSkill(
        name=payload.name,
        prompt=payload.prompt,
        tools=payload.tools,
        scope=payload.scope,
        builtin=False,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.AgentSkillRead.model_validate(obj).model_dump())


@router.get("/api/db/agent_skills")
def list_skills(db: Session = Depends(get_db)):
    rows = (
        db.query(models.AgentSkill)
        .order_by(models.AgentSkill.created_at.desc())
        .all()
    )
    custom = [schemas.AgentSkillRead.model_validate(r).model_dump() for r in rows]
    # 内置 + 自定义合并返回，便于前端在创建智能体时绑定
    return ok(list(BUILTIN_SKILLS) + custom)


@router.get("/api/db/agent_skills/{skill_id}")
def get_skill(skill_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.AgentSkill).filter(models.AgentSkill.id == skill_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="skill not found")
    return ok(schemas.AgentSkillRead.model_validate(obj).model_dump())


@router.delete("/api/db/agent_skills/{skill_id}")
def delete_skill(skill_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.AgentSkill).filter(models.AgentSkill.id == skill_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="skill not found")
    db.delete(obj)
    db.commit()
    return ok({"id": skill_id})


# -------------------------- Custom Agent -------------------------- #
@router.post("/api/db/agents")
def create_agent(payload: schemas.CustomAgentCreate, db: Session = Depends(get_db)):
    obj = models.CustomAgent(
        name=payload.name,
        prompt=payload.prompt,
        skill_ids=payload.skill_ids,
        knowledge_scope=payload.knowledge_scope or "",
        model=payload.model or "",
        builtin=False,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.CustomAgentRead.model_validate(obj).model_dump())


@router.get("/api/db/agents")
def list_agents(db: Session = Depends(get_db)):
    rows = (
        db.query(models.CustomAgent)
        .order_by(models.CustomAgent.created_at.desc())
        .all()
    )
    return ok([schemas.CustomAgentRead.model_validate(r).model_dump() for r in rows])


@router.get("/api/db/agents/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.CustomAgent).filter(models.CustomAgent.id == agent_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="agent not found")
    return ok(schemas.CustomAgentRead.model_validate(obj).model_dump())


@router.delete("/api/db/agents/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.CustomAgent).filter(models.CustomAgent.id == agent_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="agent not found")
    db.delete(obj)
    db.commit()
    return ok({"id": agent_id})


@router.put("/api/db/agents/{agent_id}")
def update_agent(
    agent_id: int,
    payload: schemas.CustomAgentUpdate,
    db: Session = Depends(get_db),
):
    """更新自定义智能体（V2-AGENT-005 真编辑端点）。

    - 不存在 -> 404（与 delete 一致：找对象 + raise HTTPException）。
    - 存在 -> 仅覆盖 payload 中传入的非 None 字段，未传字段保留原值
      （部分更新，不整体覆盖）；commit 后返回更新后的 CustomAgentRead。
    - 内存隔离维度是 conversation_id，编辑智能体定义不影响已有会话记忆
      （预期行为，无需特殊处理）。
    """
    obj = db.query(models.CustomAgent).filter(models.CustomAgent.id == agent_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="agent not found")
    # 仅更新显式传入（非 None）的字段，保留未传字段原值。
    for field in ("name", "prompt", "skill_ids", "knowledge_scope", "model"):
        value = getattr(payload, field)
        if value is None:
            continue
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return ok(schemas.CustomAgentRead.model_validate(obj).model_dump())
