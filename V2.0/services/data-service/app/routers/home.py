"""Home router — PRD §2.4 #8 (首页四聚合: 热力图/待复习/薄弱主题/计划统计).

Semantics reuse V1.x getStudyHeatmap / getTodayReviewStats / getWeakTopics /
getPlanStats; the query logic lives in ``app/aggregates.py``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import aggregates
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["home"])


@router.get("/api/home/heatmap")
def home_heatmap(db: Session = Depends(get_db)):
    return ok(aggregates.get_study_heatmap(db))


@router.get("/api/home/today-review")
def home_today_review(db: Session = Depends(get_db)):
    return ok(aggregates.get_today_review_stats(db))


@router.get("/api/home/weak-topics")
def home_weak_topics(db: Session = Depends(get_db)):
    return ok(aggregates.get_weak_topics(db))


@router.get("/api/home/plan-stats")
def home_plan_stats(db: Session = Depends(get_db)):
    return ok(aggregates.get_plan_stats(db))
