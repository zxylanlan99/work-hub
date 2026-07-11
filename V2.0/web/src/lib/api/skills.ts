// 自定义 Skill（agent-service /api/skill，T04 V2-AGENT-003）
// 创建/删除自定义 Skill，落库 data-service agent_skills（内置 Skill 不可删）。
import { request } from "../api";
import type { SkillInput } from "../../types";

export const skillsApi = {
  /** 创建自定义 Skill（POST /api/skill），返回新 Skill 的 id（整数）。 */
  create: (body: SkillInput) =>
    request<{ id: number }>("agent", "/api/skill", { method: "POST", body }),
  /** 删除自定义 Skill（DELETE /api/skill/{id}）。 */
  remove: (id: number) =>
    request<{ id: number }>("agent", `/api/skill/${id}`, { method: "DELETE" }),
};
