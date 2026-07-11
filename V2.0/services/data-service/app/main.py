"""StudyMind data-service — FastAPI application entrypoint.

Responsibilities:
  * expose the REST CRUD + aggregation routers (single record source, C1)
  * CORS allowing the web origin (http://localhost:5173)
  * dev-mode table creation via ``init_db()`` on startup
  * consistent ``{code, data, message}`` envelope via exception handlers
  * ``/health`` endpoint for docker-compose healthchecks
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import aggregates  # noqa: F401  (ensures aggregate imports resolve)
from app.db import init_db
from app.routers import categories, home, knowledge, news, plans, review, settings

app = FastAPI(title="StudyMind data-service", version="2.0.0")

# CORS: allow the web origin (and localhost variants) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("WEB_ORIGIN", "http://localhost:5173"),
        "http://localhost:8080",
        "*",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------- #
# Routers (paths are unique and live on port 8000)
# --------------------------------------------------------------------------- #
app.include_router(categories.router)
app.include_router(knowledge.router)
app.include_router(review.router)
app.include_router(plans.router)
app.include_router(settings.router)
app.include_router(news.router)
app.include_router(home.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "studymind-data-service", "version": "2.0.0"}


@app.on_event("startup")
def on_startup():
    # In dev mode create tables (idempotent). Production should use migrations.
    if os.getenv("ENVIRONMENT", "development") != "production":
        init_db()


# --------------------------------------------------------------------------- #
# Unified error envelope (architecture doc §10)
# --------------------------------------------------------------------------- #
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "data": None, "message": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={"code": 40001, "data": exc.errors(), "message": "参数错误"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"code": 50001, "data": None, "message": str(exc)},
    )
