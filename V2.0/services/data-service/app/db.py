"""Database engine, session factory, and declarative base.

``Base`` is defined here and imported by ``models.py`` so there is a single
metadata registry (avoids the classic "two Base objects" pitfall). The
default connection string targets the ``postgres`` service from
``docker-compose.yml``; override via ``SQLALCHEMY_DATABASE_URL``.

Postgres is the system record source (architecture decision #5 / C1).
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = os.getenv(
    "SQLALCHEMY_DATABASE_URL",
    "postgresql://postgres:postgres@postgres:5432/studymind",
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    future=True,
)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables (idempotent). Used in dev mode on startup."""
    # Import models so their tables register on Base.metadata.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
