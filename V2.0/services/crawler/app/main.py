"""StudyMind crawler-service — FastAPI 入口。

职责: RSS 抓取 / 正文抽取 / 红线引擎 R1-R5 / 联网搜索 (C2: 红线仅服务端执行)。
端口: 8003 (由 CRAWLER_SERVICE_PORT 注入, 任务铁律)。
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.routers import crawler

app = FastAPI(title="StudyMind crawler-service", version="2.0.0")

# CORS: 前端 (web) 经 nginx 反代调用; 开发期放宽到 *。
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

app.include_router(crawler.router)


@app.get("/health")
def health():
    """docker-compose 健康检查。"""
    return {"status": "ok"}


@app.get("/")
def root():
    return {"service": "studymind-crawler-service", "version": "2.0.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=config.CRAWLER_SERVICE_PORT,
        reload=False,
    )
