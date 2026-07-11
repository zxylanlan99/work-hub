"""StudyMind kb-service —— FastAPI 网关（封装 FastGPT，C3 合规）。

============================================================================
C3 硬约束（架构文档 §7）：本服务是访问 FastGPT 的唯一面，且只暴露
数据集/文档/检索（无状态知识库检索后端）。严禁调用 FastGPT 的
Agent 应用 / Workflow / 应用编排端点。所有智能体编排、记忆、工具、密钥
统一收敛于 agent-service（Agno）。
============================================================================
"""
from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.response import ok
from app.routers import kb

app = FastAPI(title="StudyMind kb-service", version="2.0.0")

# CORS：允许 web 源（及 localhost 变体）调用本 API。
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

# 挂载知识库路由（仅数据集/文档/检索，C3）。
app.include_router(kb.router)


@app.get("/health")
def health() -> dict:
    """健康检查，供 docker-compose 探活。"""
    return {"status": "ok"}


@app.get("/")
def root() -> dict:
    return {"service": "studymind-kb-service", "version": "2.0.0"}


# --------------------------------------------------------------------------- #
# 统一错误信封（与 data-service 一致，架构文档 §10）
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
