// 爬虫服务（crawler-service :8003，保留清单 #12 入库链路 / C2 红线）
import { request } from "../api";
import type {
  RssFetchResult,
  RedlineCheckResult,
  CrawlerSearchResult,
} from "../../types";

export const crawlerApi = {
  /** 抓取 RSS（仅启用源，服务端逐篇正文抽取 + 红线）。 */
  fetchRss: (sourceId?: number) =>
    request<RssFetchResult>("crawler", "/api/crawler/rss/fetch", {
      method: "POST",
      body: sourceId !== undefined ? { source_id: sourceId } : {},
    }),
  /** 联网搜索（agent-service 工具亦走此端点）。 */
  search: (query: string) =>
    request<CrawlerSearchResult>("crawler", "/api/crawler/search", {
      method: "POST",
      body: { query },
    }),
  /** 红线自检：给定 url/title/content 返回 passed + reasons。 */
  redlineCheck: (body: { url?: string; title?: string; content?: string }) =>
    request<RedlineCheckResult>("crawler", "/api/crawler/redline/check", {
      method: "GET",
      params: body,
    }),
};
