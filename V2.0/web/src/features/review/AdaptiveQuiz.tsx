// 难度自适应出题面板（P1，V2-REVIEW-002 AC1 增强）。
// 调用真实后端 /api/review/quiz/generate（C1，零 mock），按难度 + 题型比例自适应。
// 题型比例的客户端分配逻辑见 features/review/adaptiveQuiz.ts（已注明假设）。
import React, { useState } from "react";
import { reviewApi } from "../../lib/api/review";
import {
  Card,
  CardHead,
  CardBody,
  Button,
  Field,
  Select,
  Banner,
  Spinner,
  Badge,
} from "../../components/ui";
import type { QuizQuestion, CardType } from "../../types";
import {
  DIFFICULTIES,
  DEFAULT_TYPE_RATIO,
  distributeByRatio,
  mergeQuizResults,
  type Difficulty,
  type TypeRatio,
} from "./adaptiveQuizCore";

const TYPE_LABELS: Record<CardType, string> = {
  choice: "选择题",
  fill: "填空题",
  qa: "问答题",
};

export default function AdaptiveQuiz({
  knowledgeItemId,
}: {
  /** 可选：关联到某个知识条目（保留清单 #11 链路增强）。 */
  knowledgeItemId?: number;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [ratio, setRatio] = useState<TypeRatio>(DEFAULT_TYPE_RATIO);
  const [count, setCount] = useState(10);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setRatioPart(key: CardType, value: number) {
    setRatio((r) => ({ ...r, [key]: value }));
  }

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const plan = distributeByRatio(count, ratio);
      const calls: Promise<QuizQuestion[]>[] = [];
      (Object.keys(plan) as CardType[]).forEach((t) => {
        const n = plan[t];
        if (n <= 0) return;
        calls.push(
          reviewApi.adaptive({
            card_type: t,
            difficulty,
            count: n,
            knowledge_item_id: knowledgeItemId,
          })
        );
      });
      const lists = await Promise.all(calls);
      setQuiz(mergeQuizResults(lists));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHead title="难度自适应出题" extra={<Badge>{quiz ? quiz.length : 0}</Badge>} />
      <CardBody>
        <div className="row">
          <Field label="难度">
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d === "easy" ? "简单" : d === "medium" ? "中等" : d === "hard" ? "困难" : "混合"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="题量">
            <Select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="muted" style={{ marginBottom: 6 }}>
          题型比例（按此分配题量，分别请求后合并）
        </div>
        <div className="row">
          {(Object.keys(TYPE_LABELS) as CardType[]).map((t) => (
            <Field key={t} label={TYPE_LABELS[t]}>
              <Select value={ratio[t]} onChange={(e) => setRatioPart(t, Number(e.target.value))}>
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>

        <Button onClick={generate} disabled={busy} style={{ marginTop: 8 }}>
          {busy ? "生成中…" : "生成自适应练习"}
        </Button>

        {err ? <Banner kind="error">{err}</Banner> : null}
        {quiz && quiz.length === 0 ? (
          <div className="muted" style={{ marginTop: 12 }}>
            未生成题目（可能该难度/题型下暂无复习卡）。
          </div>
        ) : quiz ? (
          <div className="list" style={{ marginTop: 12 }}>
            {quiz.map((q, i) => (
              <div key={q.id ?? i} className="item">
                <div className="item-title">
                  {i + 1}. [{q.type}] {q.question}
                </div>
                {q.options && q.options.length > 0 ? (
                  <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
                    {q.options.map((o, oi) => (
                      <li key={oi}>{o}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="muted">答案：{q.answer}</div>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
