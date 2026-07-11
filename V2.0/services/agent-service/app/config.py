"""agent-service 配置。

从环境变量读取，兼容 docker-compose 注入（见 deploy/.env.example）。
变量命名与 V2.0/deploy/.env.example 完全一致。
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

# 加载 .env（本地开发用；docker 中由 compose 注入环境变量，load_dotenv 不报错）
load_dotenv()


class Settings:
    """集中式配置对象，避免散落的 os.getenv 调用。

    取值优先级：环境变量 > docker-compose > 下方默认值。
    """

    # ---- LLM（OpenAI 兼容，与 deploy/.env.example 对齐） ----
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "")
    LLM_MODEL_NAME: str = os.getenv("LLM_MODEL_NAME", "")

    # ---- 服务端口 ----
    # Dockerfile 固定为 8001；此处用于本地直跑（uvicorn --port ...）。
    AGENT_SERVICE_PORT: int = int(os.getenv("AGENT_SERVICE_PORT", "8001"))

    # ---- 服务间地址（与 deploy/.env.example / docker-compose 一致） ----
    # 注意：实际部署端口以 docker-compose 为准（data=8000, kb=8002, crawler=8003）。
    KB_SERVICE_URL: str = os.getenv("KB_SERVICE_URL", "http://kb-service:8002")
    DATA_SERVICE_URL: str = os.getenv("DATA_SERVICE_URL", "http://data-service:8000")
    CRAWLER_SERVICE_URL: str = os.getenv("CRAWLER_SERVICE_URL", "http://crawler-service:8003")

    # ---- 对话记忆落盘（可选） ----
    # 为空 -> 仅进程内存（MVP）。填入路径可落盘 JSON（生产应替换为 data-service）。
    CONVERSATION_PERSIST_PATH: str = os.getenv("AGENT_CONVERSATION_PERSIST_PATH", "")

    # ---- 工程约束：单请求超时 <=45s（沿用 V1.x，超时不重试防烧 token） ----
    CHAT_TIMEOUT_SECONDS: float = float(os.getenv("CHAT_TIMEOUT_SECONDS", "45"))

    # ---- 知识库检索 topK ----
    KB_SEARCH_TOP_K: int = int(os.getenv("KB_SEARCH_TOP_K", "5"))


# 全局配置单例
settings = Settings()
