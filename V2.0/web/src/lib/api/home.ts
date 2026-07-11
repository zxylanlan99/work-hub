// 首页聚合（data-service /api/home/*，保留清单 #8 / V2-HOME-001 四聚合基线）
import { request } from "../api";
import type {
  HeatmapResponse,
  TodayReviewResponse,
  WeakTopicsResponse,
  PlanStatsResponse,
} from "../../types";

export const homeApi = {
  heatmap: () => request<HeatmapResponse>("data", "/api/home/heatmap"),
  todayReview: () => request<TodayReviewResponse>("data", "/api/home/today-review"),
  weakTopics: () => request<WeakTopicsResponse>("data", "/api/home/weak-topics"),
  planStats: () => request<PlanStatsResponse>("data", "/api/home/plan-stats"),
};
