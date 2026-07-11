// 知识条目（data-service /api/kb/items，保留清单 #2 / V2-KB-001）
import { request } from "../api";
import type { KnowledgeItem } from "../../types";

export interface KnowledgeItemInput {
  title: string;
  content: string;
  summary?: string;
  category_id?: number | null;
  source_type?: string;
  source_ref?: string;
  backend_collection_id?: string | null;
}

export const knowledgeApi = {
  list: (params?: { category_id?: number }) =>
    request<KnowledgeItem[]>("data", "/api/kb/items", { params }),
  get: (id: number) => request<KnowledgeItem>("data", `/api/kb/items/${id}`),
  create: (body: KnowledgeItemInput) =>
    request<KnowledgeItem>("data", "/api/kb/items", { method: "POST", body }),
  update: (id: number, body: Partial<KnowledgeItemInput>) =>
    request<KnowledgeItem>("data", `/api/kb/items/${id}`, { method: "PUT", body }),
  remove: (id: number) =>
    request<null>("data", `/api/kb/items/${id}`, { method: "DELETE" }),
};
