// 学习计划（data-service /api/plans，保留清单 #4 / V2-PLAN-001）
//
// 契约仅明确 GET/POST/PUT/DELETE /api/plans（括号内注明含 goals/milestones/tasks）。
// 里程碑与任务采用嵌套子资源端点（以下为前端对齐后端的结构假设，若后端路径不同需微调）：
//   goals:      GET/POST /api/plans · GET/PUT/DELETE /api/plans/{goalId}
//   milestones: GET/POST /api/plans/{goalId}/milestones · PUT/DELETE /api/plans/{goalId}/milestones/{id}
//   tasks:      POST /api/plans/{goalId}/milestones/{milestoneId}/tasks · PUT/DELETE .../tasks/{id}
import { request } from "../api";
import type { StudyGoal, StudyMilestone, StudyTask } from "../../types";

export interface GoalInput {
  title: string;
  description?: string;
  target_date?: string | null;
  status?: string;
}
export interface MilestoneInput {
  title: string;
  due_date?: string | null;
  done?: boolean;
}
export interface TaskInput {
  title: string;
  done?: boolean;
  due_date?: string | null;
}

export const plansApi = {
  // —— 目标 ——
  listGoals: () => request<StudyGoal[]>("data", "/api/plans"),
  createGoal: (body: GoalInput) =>
    request<StudyGoal>("data", "/api/plans", { method: "POST", body }),
  updateGoal: (goalId: number, body: Partial<GoalInput>) =>
    request<StudyGoal>("data", `/api/plans/${goalId}`, { method: "PUT", body }),
  removeGoal: (goalId: number) =>
    request<null>("data", `/api/plans/${goalId}`, { method: "DELETE" }),

  // —— 里程碑 ——
  listMilestones: (goalId: number) =>
    request<StudyMilestone[]>("data", `/api/plans/${goalId}/milestones`),
  createMilestone: (goalId: number, body: MilestoneInput) =>
    request<StudyMilestone>("data", `/api/plans/${goalId}/milestones`, {
      method: "POST",
      body,
    }),
  updateMilestone: (goalId: number, id: number, body: Partial<MilestoneInput>) =>
    request<StudyMilestone>("data", `/api/plans/${goalId}/milestones/${id}`, {
      method: "PUT",
      body,
    }),
  removeMilestone: (goalId: number, id: number) =>
    request<null>("data", `/api/plans/${goalId}/milestones/${id}`, {
      method: "DELETE",
    }),

  // —— 任务 ——
  createTask: (goalId: number, milestoneId: number, body: TaskInput) =>
    request<StudyTask>(
      "data",
      `/api/plans/${goalId}/milestones/${milestoneId}/tasks`,
      { method: "POST", body }
    ),
  updateTask: (
    goalId: number,
    milestoneId: number,
    id: number,
    body: Partial<TaskInput>
  ) =>
    request<StudyTask>(
      "data",
      `/api/plans/${goalId}/milestones/${milestoneId}/tasks/${id}`,
      { method: "PUT", body }
    ),
  removeTask: (goalId: number, milestoneId: number, id: number) =>
    request<null>(
      "data",
      `/api/plans/${goalId}/milestones/${milestoneId}/tasks/${id}`,
      { method: "DELETE" }
    ),
};
