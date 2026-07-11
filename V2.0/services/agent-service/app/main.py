"""agent-service 入口（FastAPI）。

- 端口 8001（Dockerfile / docker-compose 一致）。
- CORS 放行前端开发服务器（默认 web:5173 / localhost:5173，以及 nginx 8080）。
- 挂载智能体路由，提供 /health 健康检查。
- 本服务是唯一的智能体编排 / 记忆 / 工具 / 密钥方（C3 硬约束）。
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agents as agents_router

app = FastAPI(
    title="StudyMind Agent Service",
    description="Agno 智能体大脑（通用学习助手 / 复习教练 / 知识问答）",
    version="2.0.0",
)

# CORS：放行前端（Vite 默认 5173，容器内服务名 web，nginx 8080）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://web:5173",
        "http://localhost:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载智能体路由（/api/agents, /api/agents/{id}/chat, /api/conversations/{id}）
app.include_router(agents_router.router)


@app.get("/health", tags=["health"])
async def health() -> dict:
    """健康检查：供 docker-compose healthcheck 与网关探测。"""
    return {
        "status": "ok",
        "service": "agent-service",
        "port": settings.AGENT_SERVICE_PORT,
        "llm_configured": bool(settings.LLM_API_KEY and settings.LLM_BASE_URL),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.AGENT_SERVICE_PORT,
        reload=False,
    )
