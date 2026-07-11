// data-service 自定义实体 CRUD（T04 V2-AGENT-002 / 003）
// - /api/db/agents：自定义智能体列表（增删走 agent-service /api/agent，已级联落库 + 清记忆）
// - /api/db/agent_skills：Skill 库（GET 返回 内置 + 自定义，便于前端绑定）
// 字段 snake_case 与 data-service schemas 对齐（C1，零 mock）。
import { request } from "../api";
import type { CustomAgent, AgentSkill } from "../../types";

export const dbApi = {
  // —— 自定义智能体（列表来自 data-service；增删走 agent-service /api/agent） ——
  listAgents: () => request<CustomAgent[]>("data", "/api/db/agents"),
  createAgent: (body: CustomAgent) =>
    request<CustomAgent>("data", "/api/db/agents", { method: "POST", body }),
  removeAgent: (id: number) =>
    request<{ id: number }>("data", `/api/db/agents/${id}`, { method: "DELETE" }),

  // —— Skill 库 ——
  listSkills: () => request<AgentSkill[]>("data", "/api/db/agent_skills"),
  createSkill: (body: AgentSkill) =>
    request<AgentSkill>("data", "/api/db/agent_skills", { method: "POST", body }),
  removeSkill: (id: number) =>
    request<{ id: number }>("data", `/api/db/agent_skills/${id}`, { method: "DELETE" }),
};
