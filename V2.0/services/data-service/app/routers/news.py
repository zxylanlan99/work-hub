"""News router — PRD §2.4 #6 (已读) & #7 (收藏, V2-NEWS-004).

  * /api/news                 list (filter by ?favorite / ?read) + CRUD
  * /api/news/{id}/read       toggle has_read
  * /api/news/favorites       list favorited (is_favorited == true)
  * /api/news/{id}/favorite   toggle is_favorited
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import true as sa_true
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["news"])


@router.get("/api/news")
def list_news(
    favorite: Optional[bool] = None,
    read: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.NewsItem)
    if favorite is not None:
        q = q.filter(models.NewsItem.is_favorited == favorite)
    if read is not None:
        q = q.filter(models.NewsItem.has_read == read)
    rows = q.order_by(models.NewsItem.created_at.desc()).all()
    return ok([schemas.NewsItemRead.model_validate(r).model_dump() for r in rows])


@router.post("/api/news")
def create_news(payload: schemas.NewsItemCreate, db: Session = Depends(get_db)):
    obj = models.NewsItem(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.NewsItemRead.model_validate(obj).model_dump())


# NOTE: register the static "/favorites" route BEFORE "/{news_id}" so Starlette
# does not capture "favorites" as a news_id.
@router.get("/api/news/favorites")
def list_favorites(db: Session = Depends(get_db)):
    rows = (
        db.query(models.NewsItem)
        .filter(models.NewsItem.is_favorited == sa_true())
        .order_by(models.NewsItem.created_at.desc())
        .all()
    )
    return ok([schemas.NewsItemRead.model_validate(r).model_dump() for r in rows])


@router.get("/api/news/{news_id}")
def get_news(news_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.NewsItem).filter(models.NewsItem.id == news_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="news item not found")
    return ok(schemas.NewsItemRead.model_validate(obj).model_dump())


@router.put("/api/news/{news_id}")
def update_news(
    news_id: int, payload: schemas.NewsItemUpdate, db: Session = Depends(get_db)
):
    obj = db.query(models.NewsItem).filter(models.NewsItem.id == news_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="news item not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.NewsItemRead.model_validate(obj).model_dump())


@router.delete("/api/news/{news_id}")
def delete_news(news_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.NewsItem).filter(models.NewsItem.id == news_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="news item not found")
    db.delete(obj)
    db.commit()
    return ok({"id": news_id})


@router.post("/api/news/{news_id}/read")
def toggle_read(news_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.NewsItem).filter(models.NewsItem.id == news_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="news item not found")
    obj.has_read = not obj.has_read
    db.commit()
    db.refresh(obj)
    return ok({"has_read": obj.has_read})


@router.post("/api/news/{news_id}/favorite")
def toggle_favorite(news_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.NewsItem).filter(models.NewsItem.id == news_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="news item not found")
    obj.is_favorited = not obj.is_favorited
    db.commit()
    db.refresh(obj)
    return ok({"is_favorited": obj.is_favorited})
