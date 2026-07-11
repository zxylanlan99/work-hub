"""crawler-service 配置 (环境变量注入).

所有配置均可通过环境变量覆盖, docker-compose 通过 environment 注入。
注意: 本服务端口固定为 8003 (Wave 1 已占用 :8000 给 data-service)。
"""
from __future__ import annotations

import os

# --- 服务间 / 网络 ---
# data-service 地址 (Wave 1 已完成, 端口 8000)。docker 内用服务名, 本地用 localhost。
DATA_SERVICE_URL: str = os.getenv("DATA_SERVICE_URL", "http://data-service:8000")

# crawler-service 监听端口 (任务铁律: 8003)
CRAWLER_SERVICE_PORT: int = int(os.getenv("CRAWLER_SERVICE_PORT", "8003"))

# 单次 HTTP 抓取超时 (秒)
FETCH_TIMEOUT: float = float(os.getenv("FETCH_TIMEOUT", "15"))

# --- 红线 / 预算约束 (R5) ---
# 单批抓取预算 (秒): 超过则停止继续抓取新源, 已抓取结果照常返回
BUDGET: float = float(os.getenv("BUDGET", "45"))
# 每个来源最多取多少条 (MAX_PER_SOURCE)
MAX_PER_SOURCE: int = int(os.getenv("MAX_PER_SOURCE", "10"))

# --- 红线阈值 (可在 data-service /api/db/redline_config 覆盖) ---
REDLINE_MIN_BODY_LEN: int = int(os.getenv("REDLINE_MIN_BODY_LEN", "200"))
REDLINE_DEDUP_THRESHOLD: float = float(os.getenv("REDLINE_DEDUP_THRESHOLD", "0.85"))

# 抓取用的浏览器 UA (降低被拒率)
USER_AGENT: str = os.getenv(
    "CRAWLER_USER_AGENT",
    "Mozilla/5.0 (compatible; StudyMindCrawler/2.0; +https://studymind.local/bot)",
)
