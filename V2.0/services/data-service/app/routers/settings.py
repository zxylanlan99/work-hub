"""Settings router — PRD §2.4 #9 (模型配置) & #13 (RSS 源).

ModelConfig stores API keys server-side only (no key in the browser, C1).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import true as sa_true
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.response import ok

router = APIRouter(tags=["settings"])


# ---- ModelConfig (#9) ---- #
@router.get("/api/settings/models")
def list_models(db: Session = Depends(get_db)):
    rows = (
        db.query(models.ModelConfig)
        .order_by(models.ModelConfig.is_default.desc(), models.ModelConfig.id)
        .all()
    )
    return ok([schemas.ModelConfigRead.model_validate(r).model_dump() for r in rows])


@router.post("/api/settings/models")
def create_model(payload: schemas.ModelConfigCreate, db: Session = Depends(get_db)):
    if payload.is_default:
        db.query(models.ModelConfig).filter(
            models.ModelConfig.is_default == sa_true()
        ).update({"is_default": False})
    obj = models.ModelConfig(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.ModelConfigRead.model_validate(obj).model_dump())


@router.get("/api/settings/models/{model_id}")
def get_model(model_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.ModelConfig).filter(models.ModelConfig.id == model_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="model config not found")
    return ok(schemas.ModelConfigRead.model_validate(obj).model_dump())


@router.put("/api/settings/models/{model_id}")
def update_model(
    model_id: int, payload: schemas.ModelConfigUpdate, db: Session = Depends(get_db)
):
    obj = db.query(models.ModelConfig).filter(models.ModelConfig.id == model_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="model config not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("is_default"):
        db.query(models.ModelConfig).filter(
            models.ModelConfig.is_default == sa_true(),
            models.ModelConfig.id != model_id,
        ).update({"is_default": False})
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.ModelConfigRead.model_validate(obj).model_dump())


@router.delete("/api/settings/models/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.ModelConfig).filter(models.ModelConfig.id == model_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="model config not found")
    db.delete(obj)
    db.commit()
    return ok({"id": model_id})


# ---- RssSource (#13) ---- #
@router.get("/api/rss")
def list_rss(db: Session = Depends(get_db)):
    rows = db.query(models.RssSource).order_by(models.RssSource.created_at.desc()).all()
    return ok([schemas.RssSourceRead.model_validate(r).model_dump() for r in rows])


@router.post("/api/rss")
def create_rss(payload: schemas.RssSourceCreate, db: Session = Depends(get_db)):
    obj = models.RssSource(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ok(schemas.RssSourceRead.model_validate(obj).model_dump())


@router.get("/api/rss/{rss_id}")
def get_rss(rss_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.RssSource).filter(models.RssSource.id == rss_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="rss source not found")
    return ok(schemas.RssSourceRead.model_validate(obj).model_dump())


@router.put("/api/rss/{rss_id}")
def update_rss(
    rss_id: int, payload: schemas.RssSourceUpdate, db: Session = Depends(get_db)
):
    obj = db.query(models.RssSource).filter(models.RssSource.id == rss_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="rss source not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ok(schemas.RssSourceRead.model_validate(obj).model_dump())


@router.delete("/api/rss/{rss_id}")
def delete_rss(rss_id: int, db: Session = Depends(get_db)):
    obj = db.query(models.RssSource).filter(models.RssSource.id == rss_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="rss source not found")
    db.delete(obj)
    db.commit()
    return ok({"id": rss_id})
