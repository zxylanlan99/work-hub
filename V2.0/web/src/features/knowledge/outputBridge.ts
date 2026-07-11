// 知识条目 → 成稿 的跨页种子缓冲（仅本机 sessionStorage，非 mock 数据）。
//
// 知识沉淀页（SedimentationPage）在挂载时读取该种子并回填标题/正文，实现
// 「知识条目 → 成稿」方向的联动（V2-OUTPUT-003）。使用 sessionStorage 而非
// localStorage，避免污染用户持久存储，也非任何编造的示例数据（C1）。
import type { KnowledgeItem } from "../../types";

const KEY = "studymind.output.seed";

export interface OutputSeed {
  title: string;
  content: string;
  sourceKnowledgeId?: number;
}

export function setOutputSeed(seed: OutputSeed): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(seed));
  } catch {
    /* 忽略隐私模式等异常 */
  }
}

export function getOutputSeed(): OutputSeed | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutputSeed) : null;
  } catch {
    return null;
  }
}

export function clearOutputSeed(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}
