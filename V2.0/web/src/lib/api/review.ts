// 复习计划（data-service /api/review/*，保留清单 #3 SM-2 / #5 基础出题）
import { request } from "../api";
import type {
  ReviewCard,
  Sm2Request,
  QuizGenerateRequest,
  QuizGenerateResponse,
} from "../../types";

export const reviewApi = {
  list: (params?: { due_only?: boolean }) =>
    request<ReviewCard[]>("data", "/api/review/cards", { params }),
  get: (id: number) => request<ReviewCard>("data", `/api/review/cards/${id}`),
  create: (body: Partial<ReviewCard>) =>
    request<ReviewCard>("data", "/api/review/cards", { method: "POST", body }),
  update: (id: number, body: Partial<ReviewCard>) =>
    request<ReviewCard>("data", `/api/review/cards/${id}`, { method: "PUT", body }),
  remove: (id: number) =>
    request<null>("data", `/api/review/cards/${id}`, { method: "DELETE" }),
  /** 提交 SM-2 评分（服务端 _sm2 算法完全保留）。 */
  sm2: (body: Sm2Request) =>
    request<ReviewCard>("data", "/api/review/sm2", { method: "POST", body }),
  /** 基础出题（choice / fill / qa 三种 P0 基线题型）。 */
  quizGenerate: (body: QuizGenerateRequest) =>
    request<QuizGenerateResponse>("data", "/api/review/quiz/generate", {
      method: "POST",
      body,
    }),
};
