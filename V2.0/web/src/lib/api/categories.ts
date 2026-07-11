// 分类管理（data-service /api/db/categories，保留清单 #1 / V2-SET-003）
import { request } from "../api";
import type { Category } from "../../types";

export const categoriesApi = {
  list: () => request<Category[]>("data", "/api/db/categories"),
  create: (body: { name: string; parent_id?: number | null }) =>
    request<Category>("data", "/api/db/categories", { method: "POST", body }),
  update: (id: number, body: { name?: string; parent_id?: number | null }) =>
    request<Category>("data", `/api/db/categories/${id}`, { method: "PUT", body }),
  remove: (id: number) =>
    request<null>("data", `/api/db/categories/${id}`, { method: "DELETE" }),
};
