"""Plans router — PRD §2.4 #4 (学习计划: 目标/里程碑/任务).

Includes ``/api/plans/confirm`` which ports V1.x ``confirmCreateGoalFromPlan``:
a planner-generated plan is accepted and persisted as goal + milestones + tasks
in a single transaction.
"""
from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["plans"])


# ---- plan confirm (ported from V1.x confirmCreateGoalFromPlan) ---- #
class PlanTaskIn(BaseModel):
    title: str = ""
    done: bool = False
    due_date: Optional[date] = None


class PlanMilestoneIn(BaseModel):
    title: str = ""
    due_date: Optional[date] = None
    done: bool = False
    tasks: List[PlanTaskIn] = []


class PlanConfirmIn(BaseModel):
    title: str
    description: str = ""
    target_date: Optional[date] = None
    status: str = "active"
    milestones: List[PlanMilestoneIn] = []


# ---- Goals ---- #
@router.get("/api/plans/goals")
def list_goals(db: Session = Depends(get_db)):
    rows = db.query(models.StudyGoal).order_by(models.StudyGoal.created_at.desc()).all()
    return ok([schemas.StudyGoalRead.model_validate(r).model_dump() for r in rows])


@router.post("/api/plans/goals")
def create_goal(payload: schemas.StudyGoalCreate, db: Session = Depends(get_db)):
    obj = models.StudyGoal(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.StudyGoalRead.model_validate(obj).model_dump())


@router.get("/api/plans/goals/{goal_id}")
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.StudyGoal).filter(models.StudyGoal.id == goal_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="goal not found")
    return ok(schemas.StudyGoalRead.model_validate(obj).model_dump())


@router.put("/api/plans/goals/{goal_id}")
def update_goal(
    goal_id: int, payload: schemas.StudyGoalUpdate, db: Session = Depends(get_db)
):
    obj = db.query(models.StudyGoal).filter(models.StudyGoal.id == goal_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="goal not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.StudyGoalRead.model_validate(obj).model_dump())


@router.delete("/api/plans/goals/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.StudyGoal).filter(models.StudyGoal.id == goal_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="goal not found")
    db.delete(obj)
    db.commit()
    return ok({"id": goal_id})


# ---- Milestones ---- #
@router.get("/api/plans/goals/{goal_id}/milestones")
def list_milestones(goal_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.StudyMilestone)
        .filter(models.StudyMilestone.goal_id == goal_id)
        .all()
    )
    return ok([schemas.StudyMilestoneRead.model_validate(r).model_dump() for r in rows])


@router.post("/api/plans/goals/{goal_id}/milestones")
def create_milestone(
    goal_id: int,
    payload: schemas.StudyMilestoneCreate,
    db: Session = Depends(get_db),
):
    if not db.query(models.StudyGoal).filter(models.StudyGoal.id == goal_id).first():
        raise HTTPException(status_code=404, detail="goal not found")
    obj = models.StudyMilestone(
        goal_id=goal_id,
        title=payload.title,
        due_date=payload.due_date,
        done=payload.done,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.StudyMilestoneRead.model_validate(obj).model_dump())


@router.get("/api/plans/milestones/{milestone_id}")
def get_milestone(milestone_id: int, db: Session = Depends(get_db)):
    obj = (
        db.query(models.StudyMilestone)
        .filter(models.StudyMilestone.id == milestone_id)
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="milestone not found")
    return ok(schemas.StudyMilestoneRead.model_validate(obj).model_dump())


@router.put("/api/plans/milestones/{milestone_id}")
def update_milestone(
    milestone_id: int,
    payload: schemas.StudyMilestoneUpdate,
    db: Session = Depends(get_db),
):
    obj = (
        db.query(models.StudyMilestone)
        .filter(models.StudyMilestone.id == milestone_id)
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="milestone not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.StudyMilestoneRead.model_validate(obj).model_dump())


@router.delete("/api/plans/milestones/{milestone_id}")
def delete_milestone(milestone_id: int, db: Session = Depends(get_db)):
    obj = (
        db.query(models.StudyMilestone)
        .filter(models.StudyMilestone.id == milestone_id)
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="milestone not found")
    db.delete(obj)
    db.commit()
    return ok({"id": milestone_id})


# ---- Tasks ---- #
@router.get("/api/plans/milestones/{milestone_id}/tasks")
def list_tasks(milestone_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(models.StudyTask)
        .filter(models.StudyTask.milestone_id == milestone_id)
        .all()
    )
    return ok([schemas.StudyTaskRead.model_validate(r).model_dump() for r in rows])


@router.post("/api/plans/milestones/{milestone_id}/tasks")
def create_task(
    milestone_id: int,
    payload: schemas.StudyTaskCreate,
    db: Session = Depends(get_db),
):
    if not db.query(models.StudyMilestone).filter(
        models.StudyMilestone.id == milestone_id
    ).first():
        raise HTTPException(status_code=404, detail="milestone not found")
    obj = models.StudyTask(
        milestone_id=milestone_id,
        title=payload.title,
        done=payload.done,
        due_date=payload.due_date,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.StudyTaskRead.model_validate(obj).model_dump())


@router.get("/api/plans/tasks/{task_id}")
def get_task(task_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.StudyTask).filter(models.StudyTask.id == task_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="task not found")
    return ok(schemas.StudyTaskRead.model_validate(obj).model_dump())


@router.put("/api/plans/tasks/{task_id}")
def update_task(
    task_id: int, payload: schemas.StudyTaskUpdate, db: Session = Depends(get_db)
):
    obj = db.query(models.StudyTask).filter(models.StudyTask.id == task_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="task not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.StudyTaskRead.model_validate(obj).model_dump())


@router.delete("/api/plans/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.StudyTask).filter(models.StudyTask.id == task_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="task not found")
    db.delete(obj)
    db.commit()
    return ok({"id": task_id})


# ---- confirmCreateGoalFromPlan ---- #
@router.post("/api/plans/confirm")
def confirm_create_goal_from_plan(
    payload: PlanConfirmIn, db: Session = Depends(get_db)
):
    goal = models.StudyGoal(
        title=payload.title,
        description=payload.description,
        target_date=payload.target_date,
        status=payload.status,
    )
    db.add(goal)
    db.flush()  # assign goal.id
    for ms in payload.milestones:
        milestone = models.StudyMilestone(
            goal_id=goal.id,
            title=ms.title,
            due_date=ms.due_date,
            done=ms.done,
        )
        db.add(milestone)
        db.flush()  # assign milestone.id
        for t in ms.tasks:
            db.add(
                models.StudyTask(
                    milestone_id=milestone.id,
                    title=t.title,
                    done=t.done,
                    due_date=t.due_date,
                )
            )
    db.commit()
    db.refresh(goal)
    return ok({"goal_id": goal.id})
