"""kb-service 配置（环境变量驱动，符合架构文档 §3.4 / §10）。

C3 硬约束相关：本服务只持有 FastGPT 的「数据集/文档/检索」访问凭据，
绝不持有任何智能体编排/记忆/工具密钥（那些属于 agent-service）。
"""
from __future__ import annotations

import os
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    """kb-service 运行配置。

    Attributes:
        fastgpt_api_url: FastGPT 社区版 OpenAPI 基址（如 http://fastgpt:3000）。
            为空时走 dev 向量回退。
        fastgpt_api_key: FastGPT OpenAPI Key。为空且 DEV_VECTOR_STORE=chroma 时
            走本地 ChromaDB 回退；否则走内存确定性向量回退。
        dev_vector_store: 开发期无 FastGPT 时的向量后端：chroma 或 fastgpt(内存)。
        qdrant_url: 生产向量库(Qdrant)地址，供 FastGPT 后端对接使用。
        kb_service_port: kb-service 监听端口（Dockerfile 固定为 8002）。
        data_service_url: data-service 地址（供回调/映射 backend_collection_id）。
        request_timeout: 上游 FastGPT 调用超时（秒）。
    """

    fastgpt_api_url: str = Field(
        default="",
        description="FastGPT 社区版 OpenAPI 基址，如 http://fastgpt:3000",
    )
    fastgpt_api_key: str = Field(
        default="",
        description="FastGPT OpenAPI Key；为空且 DEV_VECTOR_STORE=chroma 走本地回退",
    )
    dev_vector_store: Literal["chroma", "fastgpt"] = Field(
        default="fastgpt",
        description="dev 无 FastGPT 时的向量后端：chroma 或 fastgpt(内存确定性回退)",
    )
    qdrant_url: str = Field(
        default="http://qdrant:6333",
        description="生产向量库 Qdrant 地址，供 FastGPT 后端使用",
    )
    kb_service_port: int = Field(default=8002, description="kb-service 监听端口")
    data_service_url: str = Field(
        default="http://data-service:8000", description="data-service 地址"
    )
    request_timeout: float = Field(default=30.0, description="FastGPT 上游调用超时(秒)")


settings = Settings(
    fastgpt_api_url=os.getenv("FASTGPT_API_URL", ""),
    fastgpt_api_key=os.getenv("FASTGPT_API_KEY", ""),
    dev_vector_store=os.getenv("DEV_VECTOR_STORE", "fastgpt"),
    qdrant_url=os.getenv("QDRANT_URL", "http://qdrant:6333"),
    kb_service_port=int(os.getenv("KB_SERVICE_PORT", "8002")),
    data_service_url=os.getenv("DATA_SERVICE_URL", "http://data-service:8000"),
)
