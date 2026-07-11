// RSS 源（data-service /api/rss，保留清单 #13 / V2-NEWS-002，迁系统设置）
import { request } from "../api";
import type { RssSource } from "../../types";

export interface RssInput {
  url: string;
  title?: string;
  category?: string;
  enabled?: boolean;
}

export const rssApi = {
  list: () => request<RssSource[]>("data", "/api/rss"),
  create: (body: RssInput) =>
    request<RssSource>("data", "/api/rss", { method: "POST", body }),
  update: (id: number, body: Partial<RssInput & { enabled: boolean }>) =>
    request<RssSource>("data", `/api/rss/${id}`, { method: "PUT", body }),
  remove: (id: number) =>
    request<null>("data", `/api/rss/${id}`, { method: "DELETE" }),
};
