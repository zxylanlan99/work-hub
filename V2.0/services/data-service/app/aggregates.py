"""Home dashboard aggregations (retained baseline, PRD §2.4 #8).

These are the server-side ports of V1.x ``getStudyHeatmap`` /
``getTodayReviewStats`` / ``getWeakTopics`` / ``getPlanStats``, implemented
with SQL aggregation over the Postgres tables. The semantic meaning is
preserved; the visual layer (Wave 2 T10) must not drop any of these four
dimensions.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_study_heatmap(db: Session, weeks: int = 12) -> List[Dict]:
    """12-week study heatmap: count of review cards reviewed per day."""
    end = _utcnow().date()
    start = end - timedelta(days=weeks * 7 - 1)

    rows = (
        db.query(
            func.date(models.ReviewCard.last_reviewed_at).label("day"),
            func.count(models.ReviewCard.id).label("cnt"),
        )
        .filter(
            models.ReviewCard.last_reviewed_at
            >= datetime(start.year, start.month, start.day)
        )
        .group_by(func.date(models.ReviewCard.last_reviewed_at))
        .all()
    )
    counts = {str(r.day): int(r.cnt) for r in rows}

    result: List[Dict] = []
    span = (end - start).days + 1
    for i in range(span):
        d = start + timedelta(days=i)
        iso = d.isoformat()
        result.append({"date": iso, "count": counts.get(iso, 0)})
    return result


def get_today_review_stats(db: Session) -> Dict:
    """Today's review stats: total cards and how many are due."""
    now = _utcnow()
    total = db.query(func.count(models.ReviewCard.id)).scalar() or 0
    due = (
        db.query(func.count(models.ReviewCard.id))
        .filter(models.ReviewCard.due_date <= now)
        .scalar()
        or 0
    )
    return {"total": int(total), "due": int(due)}


def get_weak_topics(db: Session, ease_threshold: float = 2.5) -> List[Dict]:
    """Weak topics: low-mastery review cards grouped by category."""
    rows = (
        db.query(
            models.Category.name.label("topic"),
            func.count(models.ReviewCard.id).label("card_count"),
            func.avg(models.ReviewCard.sm2_ease).label("avg_ease"),
        )
        .join(
            models.KnowledgeItem,
            models.ReviewCard.knowledge_item_id == models.KnowledgeItem.id,
        )
        .join(
            models.Category,
            models.KnowledgeItem.category_id == models.Category.id,
        )
        .filter(models.ReviewCard.sm2_ease < ease_threshold)
        .group_by(models.Category.name)
        .all()
    )
    result = [
        {
            "topic": r.topic,
            "card_count": int(r.card_count),
            "avg_ease": round(float(r.avg_ease or 0.0), 4),
        }
        for r in rows
    ]

    # Weak cards not associated with any category.
    uncat = (
        db.query(func.count(models.ReviewCard.id))
        .outerjoin(
            models.KnowledgeItem,
            models.ReviewCard.knowledge_item_id == models.KnowledgeItem.id,
        )
        .filter(models.ReviewCard.sm2_ease < ease_threshold)
        .filter(models.KnowledgeItem.category_id.is_(None))
        .scalar()
        or 0
    )
    if uncat:
        result.append(
            {
                "topic": "未分类",
                "card_count": int(uncat),
                "avg_ease": ease_threshold,
            }
        )
    return result


def get_plan_stats(db: Session) -> Dict:
    """Plan progress across goals / milestones / tasks."""
    total_goals = db.query(func.count(models.StudyGoal.id)).scalar() or 0
    active_goals = (
        db.query(func.count(models.StudyGoal.id))
        .filter(models.StudyGoal.status == "active")
        .scalar()
        or 0
    )
    completed_goals = (
        db.query(func.count(models.StudyGoal.id))
        .filter(models.StudyGoal.status == "completed")
        .scalar()
        or 0
    )
    total_milestones = (
        db.query(func.count(models.StudyMilestone.id)).scalar() or 0
    )
    done_milestones = (
        db.query(func.count(models.StudyMilestone.id))
        .filter(models.StudyMilestone.done == True)  # noqa: E712
        .scalar()
        or 0
    )
    total_tasks = db.query(func.count(models.StudyTask.id)).scalar() or 0
    done_tasks = (
        db.query(func.count(models.StudyTask.id))
        .filter(models.StudyTask.done == True)  # noqa: E712
        .scalar()
        or 0
    )
    completion_rate = (
        round(done_tasks / total_tasks, 4) if total_tasks else 0.0
    )
    return {
        "total_goals": int(total_goals),
        "active_goals": int(active_goals),
        "completed_goals": int(completed_goals),
        "total_milestones": int(total_milestones),
        "done_milestones": int(done_milestones),
        "total_tasks": int(total_tasks),
        "done_tasks": int(done_tasks),
        "completion_rate": completion_rate,
    }
