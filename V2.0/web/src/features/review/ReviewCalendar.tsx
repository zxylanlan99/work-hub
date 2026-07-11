// 复习日历视图 + 连续学习天数激励（墨研原生组件，无组件库）。
// 数据来自真实 review_cards（C1）。连续天数与热力由 features/review/calendar.ts 计算。
import React from "react";
import type { ReviewCard } from "../../types";
import { computeStreak, buildReviewCalendar, countDue } from "./calendar";
import { Card, CardHead, CardBody, Badge } from "../../components/ui";

const LEVEL_COLOR = ["var(--hair)", "#bfd8c9", "#7fb39a", "var(--bamboo)"];

export default function ReviewCalendar({
  cards,
  loading,
  error,
}: {
  cards: ReviewCard[];
  loading: boolean;
  error: string | null;
}) {
  const streak = computeStreak(cards);
  const calendar = buildReviewCalendar(cards, 12);
  const due = countDue(cards);

  return (
    <Card>
      <CardHead
        title="复习日历"
        extra={
          <div className="row">
            <Badge tone="bamboo">连续 {streak} 天</Badge>
            <Badge tone={due > 0 ? "amber" : "default"}>待复习 {due}</Badge>
          </div>
        }
      />
      <CardBody>
        {loading ? (
          <div className="muted">加载中…</div>
        ) : error ? (
          <div className="text-cinnabar">加载失败：{error}</div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 10 }}>
              连续学习 <b className="text-bamboo">{streak}</b> 天 · 近 12 周复习热力（绿阶越高表示当日复习越多）
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
              }}
            >
              {calendar.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date} · 复习 ${day.reviewedCount} · 到期 ${day.dueCount}`}
                  style={{
                    aspectRatio: "1 / 1",
                    borderRadius: 4,
                    background: day.isFuture ? "transparent" : LEVEL_COLOR[day.level],
                    border: day.isToday
                      ? "2px solid var(--bamboo)"
                      : "1px solid var(--hair)",
                    opacity: day.isFuture ? 0.35 : 1,
                  }}
                />
              ))}
            </div>
            <div className="heat-legend" style={{ marginTop: 12 }}>
              <span>少</span>
              {LEVEL_COLOR.map((c, i) => (
                <span
                  key={i}
                  className="dot"
                  style={{ background: c === "var(--hair)" ? "var(--hair)" : c }}
                />
              ))}
              <span>多</span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
