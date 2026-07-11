// 复习日历与连续学习天数计算（纯函数，便于单测与复用）。
//
// 所有数据均来自真实 review_cards（data-service，C1 零 mock）。本文件不发起
// 任何网络请求，只做日期聚合：基于卡片的 last_reviewed_at 推算「复习热力」与
// 「连续学习天数(streak)」，基于 due_date 推算「待复习」。
import type { ReviewCard } from "../../types";

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** 当日完成复习的卡片数（last_reviewed_at 落在当日） */
  reviewedCount: number;
  /** 当日应复习的卡片数（due_date <= 当日） */
  dueCount: number;
  /** 热力等级 0-3（0=无，3=最多） */
  level: 0 | 1 | 2 | 3;
  isToday: boolean;
  isFuture: boolean;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 连续学习天数：从今天往前数，直到遇到一个「没有任何复习」的日子为止。
 * 若今天尚无复习但从昨天起连续，则从昨天起算（不因「今天还没学」而清零）。
 */
export function computeStreak(cards: ReviewCard[]): number {
  const days = new Set<string>();
  for (const c of cards) {
    const d = parseDate(c.last_reviewed_at);
    if (d) days.add(ymd(d));
  }
  const cur = new Date();
  if (!days.has(ymd(cur))) {
    cur.setDate(cur.getDate() - 1);
    if (!days.has(ymd(cur))) return 0;
  }
  let streak = 0;
  while (days.has(ymd(cur))) {
    streak += 1;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

/** 生成过去 `weeks*7` 天（含今日）的日历网格。 */
export function buildReviewCalendar(cards: ReviewCard[], weeks = 12): CalendarDay[] {
  const reviewedByDay = new Map<string, number>();
  const dueByDay = new Map<string, number>();
  const now = new Date();
  const todayStr = ymd(now);

  for (const c of cards) {
    const rd = parseDate(c.last_reviewed_at);
    if (rd) {
      const k = ymd(rd);
      reviewedByDay.set(k, (reviewedByDay.get(k) ?? 0) + 1);
    }
    const dd = parseDate(c.due_date);
    if (dd) {
      const k = ymd(dd);
      dueByDay.set(k, (dueByDay.get(k) ?? 0) + 1);
    }
  }

  const totalDays = weeks * 7;
  const start = new Date(now);
  start.setDate(start.getDate() - (totalDays - 1));

  const days: CalendarDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = ymd(d);
    const reviewedCount = reviewedByDay.get(key) ?? 0;
    const level: 0 | 1 | 2 | 3 =
      reviewedCount === 0 ? 0 : reviewedCount < 3 ? 1 : reviewedCount < 6 ? 2 : 3;
    days.push({
      date: key,
      reviewedCount,
      dueCount: dueByDay.get(key) ?? 0,
      level,
      isToday: key === todayStr,
      isFuture: d > now,
    });
  }
  return days;
}

/** 今日及之前到期（due_date <= 今日）的卡片数。 */
export function countDue(cards: ReviewCard[]): number {
  const today = ymd(new Date());
  return cards.filter((c) => {
    const dd = parseDate(c.due_date);
    return dd ? ymd(dd) <= today : false;
  }).length;
}
