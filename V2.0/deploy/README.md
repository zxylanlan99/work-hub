# StudyMind V2.0 — 本地部署 (deploy)

本目录提供 docker-compose 单机编排，覆盖 V2.0 技术决策 #5（data-service = FastAPI + Postgres）、
#6（docker-compose 单机）、#1（web = React + Vite）。

## 服务清单

| 服务 | 端口 | 说明 | 默认启动 |
|------|------|------|----------|
| `postgres` | 5432 | 系统记录源（数据底座，C1） | ✅ |
| `qdrant` | 6333 | 向量库（开发期可由 ChromaDB 替换） | ✅ |
| `data-service` | 8000 | 全部业务 CRUD + 四聚合统计 + 收藏/已读 | ✅ |
| `web` | 5173 | React 静态站点（nginx 托管） | ✅ |
| `agent-service` | 8001 | 智能体大脑（Agno）— Wave 2 T03 | ⛔ profile `backend` |
| `kb-service` | 8002 | 知识库网关（FastGPT，仅检索，C3）— Wave 2 T05 | ⛔ profile `backend` |
| `crawler-service` | 8003 | 爬虫 + 红线引擎 — Wave 2 T07 | ⛔ profile `backend` |

> Wave 1 仅实现 `data-service` 与 `web` 脚手架；三个后端 AI 服务仅提供占位
> `Dockerfile` + `README`，通过 `profiles: ["backend"]` 默认不启动。

## 快速启动

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 启动基线栈（postgres / qdrant / data-service / web）
docker compose up -d --build

# 3. （可选）启动后端 AI 服务（Wave 2 填充后）
docker compose --profile backend up -d --build
```

前端访问：http://localhost:5173
数据服务健康检查：http://localhost:8000/health

## 说明

- `data-service` 在 `ENVIRONMENT != production` 时于启动期执行 `Base.metadata.create_all`
  （开发期建表，幂等）。生产环境应改用 Alembic 迁移。
- 所有服务间连接串与 `*_SERVICE_URL` 均从 `.env` 注入（见 `docker-compose.yml`）。
- 前端 `web/src/lib/api.ts` 默认调用 `http://localhost:8000`（可用 `VITE_API_BASE` 覆盖）。
