// 难度自适应出题（P1，V2-REVIEW-002 AC1 增强）。
//
// 后端 data-service 的 /api/review/quiz/generate 已支持：
//   - difficulty(easy|medium|hard|mixed) 按 sm2_ease 自适应过滤；
//   - card_type 过滤（choice|fill|qa 三种 P0 基线题型，V2-REVIEW-002 AC0）。
//
// 假设（已注明）：后端当前未在请求体读取 question_type_ratio，因此题型比例由前端
// 依据 ratio 对三种题型分别发起请求后在本地合并，得到符合比例的练习集。若后端后续
// 直接支持 ratio，可改为单次请求。所有数据均来自真实复习卡（C1，零 mock）。
import type { CardType, QuizQuestion } from "../../types";

export type Difficulty = "easy" | "medium" | "hard" | "mixed";

export interface TypeRatio {
  choice: number;
  fill: number;
  qa: number;
}

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "mixed"];

/** 默认题型比例（choice:fill:qa = 1:1:2）。 */
export const DEFAULT_TYPE_RATIO: TypeRatio = { choice: 1, fill: 1, qa: 2 };

/**
 * 依据比例把总题数分配到三种题型（整数，取整误差补到 qa，保证总数一致）。
 */
export function distributeByRatio(total: number, ratio: TypeRatio): Record<CardType, number> {
  const sum = ratio.choice + ratio.fill + ratio.qa || 1;
  const raw: Record<CardType, number> = {
    choice: Math.max(0, Math.round((total * ratio.choice) / sum)),
    fill: Math.max(0, Math.round((total * ratio.fill) / sum)),
    qa: Math.max(0, Math.round((total * ratio.qa) / sum)),
  };
  const diff = total - (raw.choice + raw.fill + raw.qa);
  raw.qa = Math.max(0, raw.qa + diff);
  return raw;
}

/** 合并多次后端返回的题目（按 id 去重）。 */
export function mergeQuizResults(lists: QuizQuestion[][]): QuizQuestion[] {
  const seen = new Set<number>();
  const out: QuizQuestion[] = [];
  for (const list of lists) {
    for (const q of list) {
      const id = q.id ?? -1;
      if (id !== -1) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(q);
    }
  }
  return out;
}
