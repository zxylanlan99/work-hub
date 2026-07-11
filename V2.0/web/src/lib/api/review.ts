// 复习计划（data-service /api/review/*，保留清单 #3 SM-2 / #5 基础出题）
// 后端 /api/review/quiz/generate 返回扁平数组 [{id, question, answer, card_type, difficulty}]；
// 本模块统一归一化为前端 QuizQuestion（card_type -> type），保证 ReviewPage / AdaptiveQuiz 一致（C1）。
import { request } from "../api";
import type {
  ReviewCard,
  Sm2Request,
  QuizGenerateRequest,
  QuizGenerateResponse,
  QuizQuestion,
  CardType,
} from "../../types";

export type QuizDifficulty = "easy" | "medium" | "hard" | "mixed";

/** 后端原始出题项（字段名为 card_type，与前端 QuizQuestion.type 不同，需归一化）。 */
interface RawQuizItem {
  id?: number;
  question: string;
  answer: string;
  card_type?: CardType;
  type?: CardType;
  difficulty?: string;
  options?: string[];
}

/** 将后端扁平出题项归一化为前端 QuizQuestion（card_type -> type）。 */
function normalizeQuiz(raw: RawQuizItem): QuizQuestion {
  return {
    id: raw.id,
    type: (raw.type ?? raw.card_type ?? "qa") as CardType,
    question: raw.question,
    answer: raw.answer,
    options: raw.options,
  };
}

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
  quizGenerate: async (body: QuizGenerateRequest): Promise<QuizGenerateResponse> => {
    const raw = await request<RawQuizItem[]>("data", "/api/review/quiz/generate", {
      method: "POST",
      body,
    });
    return { questions: raw.map(normalizeQuiz) };
  },
  /** 难度自适应出题（P1）：支持 difficulty 与题型比例分配（见 features/review/adaptiveQuiz）。
   *  后端按 card_type + difficulty(sm2_ease) 过滤选取复习卡；题型比例由前端在 features/review 分配。 */
  adaptive: async (body: {
    card_type?: CardType;
    difficulty?: QuizDifficulty;
    count?: number;
    knowledge_item_id?: number;
  }): Promise<QuizQuestion[]> => {
    const raw = await request<RawQuizItem[]>("data", "/api/review/quiz/generate", {
      method: "POST",
      body,
    });
    return raw.map(normalizeQuiz);
  },
};
