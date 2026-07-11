"""PUT /api/db/agents/{agent_id} 真编辑端点单测（V2-AGENT-005）。

直接调用 ``app.routers.agents.update_agent`` 业务函数（绕过 FastAPI 依赖注入，
但走真实 ORM 会话与真实 SQLite 库），覆盖：
  * 成功：返回更新后的 CustomAgentRead（code=0 / data 含新值）
  * 404：智能体不存在时抛 HTTPException(404)
  * 部分字段更新生效：未传字段保留原值；显式空串 "" 生效；None 被跳过

绝不 mock：所有断言均基于真实 DB 回读。
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import models, schemas
from app.routers import agents as agents_router


def _seed(db, **overrides) -> int:
    """写入一条自定义智能体，返回其 id。"""
    obj = models.CustomAgent(
        name=overrides.get("name", "原始名"),
        prompt=overrides.get("prompt", "原始提示词"),
        skill_ids=overrides.get("skill_ids", ["builtin:kb_qa"]),
        knowledge_scope=overrides.get("knowledge_scope", "数学"),
        model=overrides.get("model", "gpt-4o"),
        builtin=False,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj.id


def test_put_success_returns_updated_read(db_session):
    aid = _seed(db_session)
    payload = schemas.CustomAgentUpdate(name="改名后", prompt="新提示词")
    resp = agents_router.update_agent(aid, payload, db=db_session)
    assert resp["code"] == 0
    data = resp["data"]
    assert data["id"] == aid
    # 已更新字段
    assert data["name"] == "改名后"
    assert data["prompt"] == "新提示词"
    # 未传字段保留原值
    assert data["model"] == "gpt-4o"
    assert data["knowledge_scope"] == "数学"
    assert data["skill_ids"] == ["builtin:kb_qa"]
    assert data["builtin"] is False


def test_put_404_for_missing_agent(db_session):
    payload = schemas.CustomAgentUpdate(name="x")
    with pytest.raises(HTTPException) as exc:
        agents_router.update_agent(9_999_999, payload, db=db_session)
    assert exc.value.status_code == 404


def test_put_partial_fields_effective(db_session):
    aid = _seed(db_session)
    # 仅更新 model，其余应保持
    payload = schemas.CustomAgentUpdate(model="gpt-4o-mini")
    resp = agents_router.update_agent(aid, payload, db=db_session)
    assert resp["code"] == 0
    data = resp["data"]
    assert data["model"] == "gpt-4o-mini"
    assert data["name"] == "原始名"  # 未变
    assert data["prompt"] == "原始提示词"
    assert data["skill_ids"] == ["builtin:kb_qa"]
    assert data["knowledge_scope"] == "数学"


def test_put_explicit_empty_string_applied_none_skipped(db_session):
    aid = _seed(db_session)
    # knowledge_scope 显式置空串（应生效）；其余字段传 None（应跳过、保留原值）
    payload = schemas.CustomAgentUpdate(
        knowledge_scope="",
        name=None,
        prompt=None,
        skill_ids=None,
        model=None,
    )
    resp = agents_router.update_agent(aid, payload, db=db_session)
    assert resp["code"] == 0
    data = resp["data"]
    assert data["knowledge_scope"] == ""  # 空串生效
    assert data["name"] == "原始名"  # None 跳过，保留
    assert data["model"] == "gpt-4o"


def test_put_skill_ids_list_replaced(db_session):
    aid = _seed(db_session)
    payload = schemas.CustomAgentUpdate(skill_ids=["builtin:web_research", "42"])
    resp = agents_router.update_agent(aid, payload, db=db_session)
    assert resp["code"] == 0
    assert resp["data"]["skill_ids"] == ["builtin:web_research", "42"]
    assert resp["data"]["name"] == "原始名"  # 未传字段不变
