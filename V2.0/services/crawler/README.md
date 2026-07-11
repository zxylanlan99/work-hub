# crawler-service (T07 · 爬虫服务与红线引擎)

StudyMind V2.0 的资讯爬虫与红线引擎，**独立后端服务**，端口 **8003**。

> 锁定决策：爬虫属后端服务，用 **FastAPI**；红线引擎 **自研**。仅引入爬虫必要依赖
> （requests / httpx / feedparser / beautifulsoup4 / trafilatura / pydantic / python-dotenv /
> uvicorn / fastapi），不引入任何与锁定决策冲突的大框架。

## 职责

- RSS 抓取 + 逐篇正文抽取（trafilatura 优先，beautifulsoup4 兜底）
- **红线引擎 R1–R5**（服务端统一执行，前端无绕过入口）
- 联网搜索（DuckDuckGo HTML，受 SSRF / 超时约束）
- **C2 硬约束**：无正文资讯一律不通过红线（R2），不入库、不推荐

## 端口与部署

- 监听端口：**8003**（docker-compose 中 `profiles: ["backend"]`，仅后端 profile 启动）
- 构建：目录即 build context（`../services/crawler`），Dockerfile 用
  `uvicorn app.main:app --host 0.0.0.0 --port 8003`
- **不要修改** `V2.0/deploy/docker-compose.yml`

## 对外接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/crawler/rss/fetch` | `{"source_id?": int}` 拉取启用 RSS 源 → 抽取正文 → 红线过滤 → 返回 passed / rejected。**不自动入库**（由 web 或 T08 调 data-service `/api/news` 入库） |
| POST | `/api/crawler/search` | `{"query": str, "top_k?": int}` 联网搜索，返回 `[{title,url,snippet}]` |
| GET  | `/api/crawler/redline/check` | `?title=&url=&source=&content=&summary=` 单条新闻红线自检（调试） |
| GET  | `/health` | 健康检查 |

> 注：crawler-service 端点路径按 T07 任务规范统一挂在 `/api/crawler/*` 下
> （与架构文档早期的 `/api/news/*`、`/api/search/web` 命名不同，以任务规范为准）。

## 红线规则 R1–R5

| 红线 | 规则 | 动作 |
|------|------|------|
| **R1 来源 / SSRF** | 调 `ssrf.check_url_safety`：仅 http/https；禁止 localhost；解析 host 到 IP，任一属私网/保留/环回/链路本地/组播/未指定即拒绝；可选来源白名单 | 拒绝 |
| **R2 正文非空 (C2)** | `body` 为空或 `< min_body_len`（默认 200）视为无正文 | 拒绝，不入库 |
| **R3 内容安全** | 命中敏感词 / 违规词表（默认词表可经环境变量扩展） | 拦截 |
| **R4 去重** | url 归一 + 正文 hash + 标题相似度（≥ `dedup_threshold` 默认 0.85） | 跳过 |
| **R5 速率 / 预算** | 单批不超过 `BUDGET` 秒（默认 45s）；每源不超过 `MAX_PER_SOURCE`（默认 10） | 停止/跳过 |

每条新闻经 `RedlineEngine.check()` 返回 `(passed: bool, reasons: [str])`，
`reasons` 以 `R1:`/`R2:` 等前缀标注命中红线，供前端展示拦截原因。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|------|------|------|
| `DATA_SERVICE_URL` | `http://data-service:8000` | data-service 地址（本地可设 `localhost:8000`） |
| `CRAWLER_SERVICE_PORT` | `8003` | 监听端口 |
| `FETCH_TIMEOUT` | `15` | 单条抓取超时（秒） |
| `BUDGET` | `45` | 单批抓取预算（秒） |
| `MAX_PER_SOURCE` | `10` | 每个来源最多取条数 |
| `REDLINE_MIN_BODY_LEN` | `200` | 正文最小字数（R2） |
| `REDLINE_DEDUP_THRESHOLD` | `0.85` | 标题相似去重阈值（R4） |
| `REDLINE_KEYWORD_BLACKLIST` | 见 `app/redline.py` `DEFAULT_KEYWORDS` | 逗号分隔的敏感词（R3） |
| `REDLINE_SOURCE_BLACKLIST` | 空 | 来源黑名单 |
| `REDLINE_ALLOWED_HOSTS` | 空 | 来源白名单（可选） |

## 目录结构

```
services/crawler/
├── requirements.txt
├── Dockerfile
├── conftest.py                 # pytest 路径注入
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI 入口 + CORS + /health
│   ├── config.py               # 配置 (env 注入)
│   ├── ssrf.py                 # R1 SSRF / 来源防护
│   ├── extract.py              # 正文抽取 (trafilatura + bs4)
│   ├── redline.py              # 红线引擎 R1–R5
│   ├── fetch_rss.py            # RSS 编排 + 联网搜索
│   └── routers/
│       ├── __init__.py
│       └── crawler.py          # /api/crawler/* 路由
└── tests/
    ├── test_ssrf.py            # R1 纯函数单测
    └── test_redline.py         # R1–R5 纯函数单测
```

## 本地运行 / 测试

```bash
cd V2.0/services/crawler
pip install -r requirements.txt
pytest tests/ -q                 # 纯函数单测, 无网络依赖

# 启动服务 (需能访问 data-service :8000)
uvicorn app.main:app --host 0.0.0.0 --port 8003
curl http://localhost:8003/health
curl -X POST http://localhost:8003/api/crawler/rss/fetch -H 'Content-Type: application/json' -d '{}'
```
