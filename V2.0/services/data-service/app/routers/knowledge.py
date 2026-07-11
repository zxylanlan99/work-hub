"""Knowledge-item router — PRD §2.4 #2 (知识条目元数据).

Vectors / chunks live in FastGPT and are managed by kb-service; this service
stores only metadata + ``backend_collection_id`` mapping.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["knowledge"])


@router.post("/api/kb/items")
def create_item(payload: schemas.KnowledgeItemCreate, db: Session = Depends(get_db)):
    obj = models.KnowledgeItem(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.KnowledgeItemRead.model_validate(obj).model_dump())


@router.get("/api/kb/items")
def list_items(
    category_id: Optional[int] = None, db: Session = Depends(get_db)
):
    q = db.query(models.KnowledgeItem)
    if category_id is not None:
        q = q.filter(models.KnowledgeItem.category_id == category_id)
    rows = q.order_by(models.KnowledgeItem.created_at.desc()).all()
    return ok([schemas.KnowledgeItemRead.model_validate(r).model_dump() for r in rows])


@router.get("/api/kb/items/{item_id}")
def get_item(item_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.KnowledgeItem).filter(models.KnowledgeItem.id == item_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="knowledge item not found")
    return ok(schemas.KnowledgeItemRead.model_validate(obj).model_dump())


@router.delete("/api/kb/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.KnowledgeItem).filter(models.KnowledgeItem.id == item_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="knowledge item not found")
    db.delete(obj)
    db.commit()
    return ok({"id": item_id})
