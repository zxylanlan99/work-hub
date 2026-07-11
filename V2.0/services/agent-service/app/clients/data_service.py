"""agent-service -> data-service 客户端（T04 自定义 Skill / 自定义智能体 CRUD）。

- 统一信封 ``{code, data, message}``：本客户端解包 ``data`` 并转换非 2xx /
  code!=0 为 ``DataServiceError``。
- 使用异步 httpx；超时取 ``min(CHAT_TIMEOUT_SECONDS, 45)``（约束：单请求
  超时 <=45s，超时不重试，防烧 token）。
- Skill 解析：内置 Skill（builtin: 前缀）本地解析；自定义 Skill 走 data-service。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from app.config import settings


class DataServiceError(Exception):
    """data-service 调用失败（含非 2xx / 信封 code!=0）。"""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def _timeout() -> float:
    return min(float(settings.CHAT_TIMEOUT_SECONDS), 45.0)


def _base() -> str:
    return settings.DATA_SERVICE_URL.rstrip("/")


async def _request(
    method: str, path: str, *, json: Optional[Dict[str, Any]] = None
) -> Any:
    """发起请求并解包信封；异常转 ``DataServiceError``。"""
    url = f"{_base()}{path}"
    try:
        async with httpx.AsyncClient(timeout=_timeout()) as client:
            resp = await client.request(method, url, json=json)
    except httpx.RequestError as exc:
        raise DataServiceError(f"无法连接 data-service（{_base()}）：{exc}")

    if resp.status_code >= 400:
        detail = ""
        try:
            detail = (resp.json() or {}).get("message", "") or resp.text
        except Exception:
            detail = resp.text or ""
        raise DataServiceError(
            detail or f"data-service 返回 {resp.status_code}", resp.status_code
        )

    try:
        payload = resp.json()
    except Exception:
        raise DataServiceError("data-service 返回非 JSON 响应")

    if isinstance(payload, dict) and payload.get("code", 0) != 0:
        raise DataServiceError(
            payload.get("message", "data-service 业务错误"),
            int(payload.get("code", 500)),
        )
    return payload.get("data") if isinstance(payload, dict) else payload


# ----------------------------- Skill ----------------------------- #
async def create_skill(name: str, prompt: str, tools: List[str], scope: str = "user") -> Dict[str, Any]:
    """创建自定义 Skill，返回 data-service 的 AgentSkillRead 字典（含 id）。"""
    return await _request(
        "POST",
        "/api/db/agent_skills",
        json={"name": name, "prompt": prompt, "tools": tools, "scope": scope},
    )


async def delete_skill(skill_id: int) -> Dict[str, Any]:
    """删除自定义 Skill。"""
    return await _request("DELETE", f"/api/db/agent_skills/{skill_id}")


async def get_skill(skill_id: int) -> Dict[str, Any]:
    """获取单个自定义 Skill 详情（不存在返回空 dict）。"""
    return await _request("GET", f"/api/db/agent_skills/{skill_id}") or {}


# --------------------------- Custom Agent ------------------------- #
async def create_agent(
    name: str,
    prompt: str,
    skill_ids: List[str],
    knowledge_scope: Optional[str] = None,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """创建自定义智能体，返回 data-service 的 CustomAgentRead 字典（含 id）。"""
    payload: Dict[str, Any] = {
        "name": name,
        "prompt": prompt,
        "skill_ids": skill_ids,
    }
    if knowledge_scope is not None:
        payload["knowledge_scope"] = knowledge_scope
    if model is not None:
        payload["model"] = model
    return await _request("POST", "/api/db/agents", json=payload)


async def delete_agent(agent_id: int) -> Dict[str, Any]:
    """删除自定义智能体记录。"""
    return await _request("DELETE", f"/api/db/agents/{agent_id}")


async def get_agent(agent_id: str) -> Dict[str, Any]:
    """获取自定义智能体详情（不存在返回空 dict）。"""
    return await _request("GET", f"/api/db/agents/{agent_id}") or {}


async def resolve_skill_definitions(skill_ids: List[str]) -> List[Dict[str, Any]]:
    """解析 skill_ids 为 Skill 定义列表，供运行时装配 Agno 工具。

    - builtin: 前缀 -> 本地 ``app.skills.get_builtin_skill``。
    - 自定义 id -> data-service ``get_skill``。
    - 缺失的自定义 Skill 抛 ``DataServiceError(404)``。
    """
    from app.skills import get_builtin_skill

    out: List[Dict[str, Any]] = []
    for sid in skill_ids or []:
        if isinstance(sid, str) and sid.startswith("builtin:"):
            builtin = get_builtin_skill(sid)
            if builtin is None:
                raise DataServiceError(f"未知内置 Skill: {sid}", 400)
            out.append(builtin)
        else:
            skill = await get_skill(sid)
            if not skill:
                raise DataServiceError(f"未知 Skill: {sid}", 400)
            out.append(skill)
    return out
