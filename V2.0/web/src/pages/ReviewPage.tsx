// 复习计划（T11，保留清单 #3 SM-2 / #5 基础出题）
// 复习卡列表 + 应用 SM-2（POST /api/review/sm2）+ 基础出题（/api/review/quiz/generate）
// + 可调 review_coach 智能体获取复习建议。
import React, { useState } from "react";
import { reviewApi } from "../lib/api/review";
import { knowledgeApi } from "../lib/api/knowledge";
import { agentsApi } from "../lib/api/agents";
import { useAsyncData } from "../lib/async";
import {
  Card,
  CardHead,
  CardBody,
  Button,
  Field,
  Select,
  Banner,
  Badge,
  Spinner,
  Empty,
} from "../components/ui";
import type { ReviewCard, CardType, QuizQuestion, KnowledgeItem, ChatMessage } from "../types";
import ReviewCalendar from "../features/review/ReviewCalendar";
import AdaptiveQuiz from "../features/review/AdaptiveQuiz";

const QUALITY_LABELS: Array<{ q: number; label: string }> = [
  { q: 0, label: "完全忘了" },
  { q: 1, label: "错误" },
  { q: 2, label: "勉强" },
  { q: 3, label: "困难" },
  { q: 4, label: "顺利" },
  { q: 5, label: "很熟练" },
];

export default function ReviewPage() {
  const cardsState = useAsyncData<ReviewCard[]>(() => reviewApi.list(), []);
  const itemsState = useAsyncData<KnowledgeItem[]>(() => knowledgeApi.list(), []);

  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [busyCard, setBusyCard] = useState<number | null>(null);

  // 出题
  const [quizType, setQuizType] = useState<CardType>("choice");
  const [quizItem, setQuizItem] = useState<string>("");
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [quizErr, setQuizErr] = useState<string | null>(null);

  // 复习助手
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  async function applySm2(card: ReviewCard, quality: number) {
    setBusyCard(card.id);
    try {
      await reviewApi.sm2({ card_id: card.id, quality });
      setRevealed((r) => ({ ...r, [card.id]: true }));
      cardsState.reload();
    } finally {
      setBusyCard(null);
    }
  }

  async function generateQuiz() {
    setQuizBusy(true);
    setQuizErr(null);
    try {
      const res = await reviewApi.quizGenerate({
        type: quizType,
        knowledge_item_id: quizItem ? Number(quizItem) : undefined,
      });
      setQuiz(res.questions ?? []);
    } catch (e) {
      setQuizErr(e instanceof Error ? e.message : String(e));
    } finally {
      setQuizBusy(false);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const next = [...chat, { role: "user" as const, content: text }];
    setChat(next);
    setChatInput("");
    setChatBusy(true);
    try {
      const res = await agentsApi.chat("review_coach", { message: text });
      setChat([
        ...next,
        { role: "agent" as const, content: res.reply, citations: res.citations },
      ]);
    } catch (e) {
      setChat([
        ...next,
        {
          role: "agent" as const,
          content: `（调用失败：${e instanceof Error ? e.message : String(e)}）`,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  const cards = cardsState.data ?? [];

  return (
    <div>
      <div className="page-head">
        <h1>复习计划</h1>
        <p>SM-2 间隔重复 · 基础出题（选择 / 填空 / 问答）· 复习助手建议</p>
      </div>

      <div className="grid grid-2">
        {/* 复习卡 */}
        <Card>
          <CardHead title="复习卡片" extra={<Badge>{cards.length}</Badge>} />
          <CardBody>
            {cardsState.loading ? (
              <Spinner center />
            ) : cardsState.error ? (
              <Banner kind="error">加载失败：{cardsState.error}</Banner>
            ) : cards.length === 0 ? (
              <Empty title="没有复习卡片" hint="可在知识库从条目生成复习卡（T16 链路）。" />
            ) : (
              <div className="list">
                {cards.map((c) => (
                  <div key={c.id} className="item">
                    <div className="row-between">
                      <span className="item-title">{c.question}</span>
                      <Badge>{c.card_type}</Badge>
                    </div>
                    {revealed[c.id] ? (
                      <div className="item-meta" style={{ marginTop: 8, color: "var(--ink)" }}>
                        答案：{c.answer}
                      </div>
                    ) : (
                      <div className="muted" style={{ marginTop: 8 }}>
                        点击「显示答案」后评分
                      </div>
                    )}
                    <div className="item-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRevealed((r) => ({ ...r, [c.id]: !r[c.id] }))}
                      >
                        {revealed[c.id] ? "隐藏答案" : "显示答案"}
                      </Button>
                      {QUALITY_LABELS.map(({ q, label }) => (
                        <Button
                          key={q}
                          size="sm"
                          variant="ghost"
                          disabled={busyCard === c.id}
                          onClick={() => applySm2(c, q)}
                          title={`评分 ${q}`}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* 复习助手 */}
        <Card>
          <CardHead title="复习助手（review_coach）" />
          <CardBody>
            <div className="chat">
              {chat.length === 0 ? (
                <div className="muted">向复习助手询问薄弱主题、复习策略等。</div>
              ) : (
                chat.map((m, i) => (
                  <div
                    key={i}
                    className={m.role === "user" ? "bubble bubble-user" : "bubble bubble-agent"}
                  >
                    {m.content}
                    {m.citations?.map((c, ci) => (
                      <span key={ci} className="cite">
                        引用：{c.title}
                      </span>
                    ))}
                  </div>
                ))
              )}
              {chatBusy ? <Spinner /> : null}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <input
                className="input"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="例如：基于我的薄弱主题给一份复习计划"
              />
              <Button onClick={sendChat} disabled={chatBusy}>
                发送
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 复习日历 + 连续天数（T16 V2-REVIEW-002/003） */}
      <ReviewCalendar cards={cards} loading={cardsState.loading} error={cardsState.error} />

      {/* 难度自适应出题（T16 V2-REVIEW-002，P1） */}
      <AdaptiveQuiz />

      {/* 基础出题 */}
      <Card>
        <CardHead title="基础出题（choice / fill / qa）" />
        <CardBody>
          <div className="row">
            <Field label="题型" >
              <Select value={quizType} onChange={(e) => setQuizType(e.target.value as CardType)}>
                <option value="choice">选择题</option>
                <option value="fill">填空题</option>
                <option value="qa">问答题</option>
              </Select>
            </Field>
            <Field label="关联知识条目（可选）">
              <Select value={quizItem} onChange={(e) => setQuizItem(e.target.value)}>
                <option value="">不限</option>
                {(itemsState.data ?? []).map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={generateQuiz} disabled={quizBusy} style={{ alignSelf: "flex-end" }}>
              {quizBusy ? "生成中…" : "生成练习"}
            </Button>
          </div>
          {quizErr ? <Banner kind="error">{quizErr}</Banner> : null}
          {quiz && quiz.length === 0 ? (
            <div className="muted">未生成题目。</div>
          ) : quiz ? (
            <div className="list" style={{ marginTop: 12 }}>
              {quiz.map((q, i) => (
                <div key={i} className="item">
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
    </div>
  );
}
