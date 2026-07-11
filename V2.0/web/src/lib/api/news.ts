// 资讯（data-service /api/news，保留清单 #6 浏览/已读 / #7 收藏 / V2-NEWS-004）
import { request } from "../api";
import type { NewsItem } from "../../types";

export const newsApi = {
  list: (params?: { favorited?: boolean }) =>
    request<NewsItem[]>("data", "/api/news", { params }),
  /** 收藏列表（V2-NEWS-004）。 */
  favorites: () => request<NewsItem[]>("data", "/api/news/favorites"),
  /** 切换已读（PATCH/POST 同义，后端翻转 has_read）。 */
  toggleRead: (id: number) =>
    request<{ has_read: boolean }>("data", `/api/news/${id}/read`, {
      method: "POST",
    }),
  /** 切换收藏（翻转 is_favorited）。 */
  toggleFavorite: (id: number) =>
    request<{ is_favorited: boolean }>("data", `/api/news/${id}/favorite`, {
      method: "POST",
    }),
};
