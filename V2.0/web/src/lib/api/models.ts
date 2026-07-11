// 模型配置（data-service /api/settings/models，保留清单 #9 / V2-SET-002）
import { request } from "../api";
import type { ModelConfig } from "../../types";

export interface ModelInput {
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string;
  is_default?: boolean;
  display_name?: string;
  plan_type?: string;
}

export const modelsApi = {
  list: () => request<ModelConfig[]>("data", "/api/settings/models"),
  create: (body: ModelInput) =>
    request<ModelConfig>("data", "/api/settings/models", { method: "POST", body }),
  update: (id: number, body: Partial<ModelInput>) =>
    request<ModelConfig>("data", `/api/settings/models/${id}`, {
      method: "PUT",
      body,
    }),
  remove: (id: number) =>
    request<null>("data", `/api/settings/models/${id}`, { method: "DELETE" }),
};
