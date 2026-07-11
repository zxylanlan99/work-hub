// 知识条目 → 复习卡 链路（保留清单 #11 基线链路必须保留）。
//
// 假设（已注明）：后端 data-service 当前未提供专用 /api/review/from-knowledge 端点，
// 因此这里基于已有知识条目做确定性派生，再经现有 POST /api/review/cards 落库，
// 且每张卡都带 knowledge_item_id 关联回原知识条目（保证基线链路可溯源）。
//   - 1 道 qa：问题 = 条目标题，答案 = 摘要或正文首段；
//   - 若正文较长，追加 1 道 fill：从正文抽一句做挖空。
import { reviewApi } from "../../lib/api/review";
import type { KnowledgeItem, ReviewCard } from "../../types";

export interface DerivedReviewCard {
  knowledge_item_id: number;
  question: string;
  answer: string;
  card_type: "qa" | "fill" | "choice";
}

function firstParagraph(content: string): string {
  const paras = (content || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras[0] ?? "";
}

function pickSentence(content: string): string {
  const para = firstParagraph(content) || (content || "").slice(0, 400);
  const sentences = para.match(/[^。！？\n]+[。！？\n]?/g) ?? [];
  return (sentences.find((s) => s.trim().length >= 8) ?? sentences[0] ?? "").trim();
}

function makeCloze(sentence: string): { question: string; answer: string } {
  const trimmed = sentence.replace(/[。！？\n]+$/, "");
  const words = trimmed.split(/(\s+)/).filter((w) => w.trim().length > 0);
  // 优先挖掉一个长度适中的中文词作为空
  const target = words.find((w) => w.length >= 2 && w.length <= 6 && /[一-鿿]/.test(w));
  if (target) {
    return {
      question: trimmed.replace(target, "______"),
      answer: target,
    };
  }
  const mid = Math.floor(trimmed.length / 2);
  return {
    question: trimmed.slice(0, mid) + "______" + trimmed.slice(mid + 1),
    answer: trimmed[mid],
  };
}

export function deriveCardsFromKnowledge(item: KnowledgeItem): DerivedReviewCard[] {
  const cards: DerivedReviewCard[] = [];
  const answer = (item.summary && item.summary.trim()) || firstParagraph(item.content) || "（暂无内容）";
  cards.push({
    knowledge_item_id: item.id,
    question: item.title || "未命名知识条目",
    answer,
    card_type: "qa",
  });
  const sentence = pickSentence(item.content);
  if (sentence) {
    const cloze = makeCloze(sentence);
    cards.push({
      knowledge_item_id: item.id,
      question: cloze.question,
      answer: cloze.answer,
      card_type: "fill",
    });
  }
  return cards;
}

/** 经真实后端落库（C1，零 mock），返回新建卡片 id 列表。 */
export async function createReviewCardsFromKnowledge(item: KnowledgeItem): Promise<number[]> {
  const cards = deriveCardsFromKnowledge(item);
  const ids: number[] = [];
  for (const c of cards) {
    const created = await reviewApi.create({
      knowledge_item_id: c.knowledge_item_id,
      question: c.question,
      answer: c.answer,
      card_type: c.card_type,
    } as Partial<ReviewCard>);
    ids.push(created.id);
  }
  return ids;
}
