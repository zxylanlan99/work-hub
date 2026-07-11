"""Categories router — PRD §2.4 #1 (分类管理, V2-SET-003)."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["categories"])


@router.get("/api/db/categories")
def list_categories(db: Session = Depends(get_db)):
    """Return the full category tree (nested by parent_id)."""
    rows = db.query(models.Category).all()
    by_id = {c.id: schemas.CategoryRead.model_validate(c) for c in rows}
    roots: List[schemas.CategoryRead] = []
    for c in rows:
        node = by_id[c.id]
        if c.parent_id and c.parent_id in by_id:
            by_id[c.parent_id].children.append(node)
        else:
            roots.append(node)
    return ok([r.model_dump() for r in roots])


@router.post("/api/db/categories")
def create_category(payload: schemas.CategoryCreate, db: Session = Depends(get_db)):
    obj = models.Category(name=payload.name, parent_id=payload.parent_id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.CategoryRead.model_validate(obj).model_dump())


@router.put("/api/db/categories/{category_id}")
def update_category(
    category_id: int,
    payload: schemas.CategoryUpdate,
    db: Session = Depends(get_db),
):
    obj = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="category not found")
    if payload.name is not None:
        obj.name = payload.name
    if payload.parent_id is not None:
        obj.parent_id = payload.parent_id
    db.commit()
    db.refresh(obj)
    return ok(schemas.CategoryRead.model_validate(obj).model_dump())


@router.delete("/api/db/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="category not found")
    db.delete(obj)
    db.commit()
    return ok({"id": category_id})
