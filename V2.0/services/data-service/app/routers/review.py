"""Review-card router — PRD §2.4 #3 (复习卡 + SM-2) & #5 (基础出题).

Endpoints:
  * /api/review/cards      CRUD
  * /api/review/sm2        apply SM-2 (server-side algorithm)
  * /api/review/quiz/generate  basic question generation (choice|fill|qa),
                               optional difficulty filter (P1 adaptive)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas, sm2
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["review"])


@router.get("/api/review/cards")
def list_cards(card_type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(models.ReviewCard)
    if card_type:
        q = q.filter(models.ReviewCard.card_type == card_type)
    rows = q.order_by(models.ReviewCard.due_date.asc().nullslast()).all()
    return ok([schemas.ReviewCardRead.model_validate(r).model_dump() for r in rows])


@router.post("/api/review/cards")
def create_card(payload: schemas.ReviewCardCreate, db: Session = Depends(get_db)):
    obj = models.ReviewCard(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.ReviewCardRead.model_validate(obj).model_dump())


@router.get("/api/review/cards/{card_id}")
def get_card(card_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.ReviewCard).filter(models.ReviewCard.id == card_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="review card not found")
    return ok(schemas.ReviewCardRead.model_validate(obj).model_dump())


@router.put("/api/review/cards/{card_id}")
def update_card(
    card_id: int,
    payload: schemas.ReviewCardUpdate,
    db: Session = Depends(get_db),
):
    obj = db.query(models.ReviewCard).filter(models.ReviewCard.id == card_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="review card not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.ReviewCardRead.model_validate(obj).model_dump())


@router.delete("/api/review/cards/{card_id}")
def delete_card(card_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.ReviewCard).filter(models.ReviewCard.id == card_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="review card not found")
    db.delete(obj)
    db.commit()
    return ok({"id": card_id})


@router.post("/api/review/sm2")
def apply_sm2(payload: dict, db: Session = Depends(get_db)):
    card_id = payload.get("card_id")
    quality_raw = payload.get("quality", 0)
    try:
        quality = int(quality_raw)
    except (TypeError, ValueError):
        quality = 0
    obj = db.query(models.ReviewCard).filter(models.ReviewCard.id == card_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="review card not found")
    result = sm2.apply_sm2(obj, quality)
    for k, v in result.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.ReviewCardRead.model_validate(obj).model_dump())


@router.post("/api/review/quiz/generate")
def generate_quiz(payload: dict, db: Session = Depends(get_db)):
    """Basic quiz generation (retained baseline, V2-REVIEW-002 AC0).

    Picks up to ``count`` cards (optionally filtered by ``card_type`` and by
    an optional ``difficulty`` adaptive hint: hard -> low ease, easy -> high
    ease). Returns quiz items carrying question / answer / card_type.
    """
    try:
        count = int(payload.get("count", 5))
    except (TypeError, ValueError):
        count = 5
    card_type = payload.get("card_type")
    difficulty = payload.get("difficulty")  # easy|medium|hard|mixed (optional)

    q = db.query(models.ReviewCard)
    if card_type:
        q = q.filter(models.ReviewCard.card_type == card_type)
    if difficulty == "hard":
        q = q.filter(models.ReviewCard.sm2_ease < 2.5)
    elif difficulty == "easy":
        q = q.filter(models.ReviewCard.sm2_ease >= 2.5)
    rows = q.order_by(models.ReviewCard.due_date.asc().nullslast()).limit(count).all()

    items = [
        {
            "id": r.id,
            "question": r.question,
            "answer": r.answer,
            "card_type": r.card_type,
            "difficulty": "hard" if r.sm2_ease < 2.5 else "easy",
        }
        for r in rows
    ]
    return ok(items)
