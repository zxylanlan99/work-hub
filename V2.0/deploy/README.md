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

---

## V1.x → V2.0 数据迁移与上线加固（T17）

> 三个后端 AI 服务（agent / kb / crawler）在 T03/T05/T07/T08 已完成实现，
> 通过 `docker compose --profile backend up -d --build` 启动。T17 负责把 V1.x 数据
> 迁移进 V2.0 Postgres，并补齐 T08 新增列、重建知识库向量，以及 C1/C2/C3 上线校验。

### 端口速查

| 服务 | 端口 | 说明 |
|------|------|------|
| `postgres` | 5432 | 系统记录源（C1） |
| `qdrant` | 6333 | 向量库（生产） |
| `data-service` | 8000 | 业务 CRUD + 收藏/已读 + `/api/news/recommend` |
| `kb-service` | 8002 | 知识库网关（FastGPT，仅检索，C3） |
| `crawler-service` | 8003 | 爬虫 + 红线引擎 R1–R5（C2） |
| `agent-service` | 8001 | 智能体大脑（Agno） |
| `fastgpt` | 3000/8080 | FastGPT 社区版（仅启用知识库/检索，关闭 Agent 应用，落实 C3） |

### 迁移运行顺序（关键）

```bash
# ① 起基础服务（postgres / qdrant / data-service / web）
docker compose up -d --build

# ② 补齐 news_items 列 + 导入 V1.x CloudBase 集合 → Postgres
#    （需要 CloudBase 凭证；无凭证环境用 --dry-run 预演）
python services/data-service/scripts/migrate_v1.py --dry-run          # 安全预演
python services/data-service/scripts/migrate_v1.py --only-alter       # 仅 ALTER（连本地 PG）
python services/data-service/scripts/migrate_v1.py                    # 全量（ALTER + CloudBase→PG）

# ③ 重建知识库向量（ChromaDB all-MiniLM → FastGPT BGE-M3；旧向量丢弃）
#    （需要 FastGPT + Qdrant 运行）
python services/kb-service/scripts/reembed_v1.py --dry-run            # 安全预演
python services/kb-service/scripts/reembed_v1.py                      # 全量重建

# ④ 启动各业务 AI 服务
docker compose --profile backend up -d --build
```

> **哪步需要凭证 / 外部服务**
> - 步骤 ② 全量：需要 `CLOUDBASE_ENV_ID / CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY`
>   与可达的 Postgres。仅 `--only-alter` 只需 Postgres。
> - 步骤 ③：需要 `FASTGPT_API_KEY / FASTGPT_API_URL` 与可达的 Qdrant。
> - 两脚本均**幂等**、可重复执行；`--dry-run` 不连接任何数据库/外部服务，可安全预演。
> - 迁移**不删源数据**：CloudBase 源集合保持原样，Postgres 侧按自然键 upsert。

### C1 / C2 / C3 校验触发

- **C1（禁止前端写死 mock）**：前端 `web/src/lib/c1c2c3_checks.ts` 暴露 `assertNoMock()` /
  `assertRealService()`，供开发期/CI 调用。端到端断言见
  `web/src/tests/e2e/c1c2c3.spec.ts`：
  ```bash
  cd web && npm install && npm run test:e2e
  # 或并入现有 vitest：npx vitest run src/tests/e2e
  ```
- **C2（禁止爬取无正文资讯）**：红线引擎 `services/crawler/app/redline.py`（R1–R5）在抓取期
  与服务端入库管线（`/api/crawler/news/ingest` 双保险）执行。`/api/news/recommend` 的
  评分与红线**解耦**（红线仅做 `passed` / `dropReason` 标记，不参与 score）。e2e 断言点：
  `c1c2c3.spec.ts` 的 `describe("C2 …")`。
- **C3（禁用 FastGPT Agent 应用模块）**：`services/kb-service/app/fastgpt_client.py` 仅封装
  FastGPT 数据集/文档/检索端点，不调用 Agent/Workflow/应用/多轮记忆编排端点。e2e 断言点：
  `c1c2c3.spec.ts` 的 `describe("C3 …")`。

### 健康检查与验证清单

```bash
curl http://localhost:8000/health   # data-service
curl http://localhost:8002/health   # kb-service
curl http://localhost:8003/health   # crawler-service
curl http://localhost:8001/health   # agent-service
# 资讯推荐（T17 新增端点）
curl -X POST http://localhost:8000/api/news/recommend -H 'Content-Type: application/json' \
     -d '{"weights":{"relevance":0.3,"recency":0.3,"authority":0.2,"completeness":0.1,"dedup":0.1}}'
# 预期：{ "code": 0, "data": [ { "id":..., "score":..., "passed":true, "dropReason":[] }, ... ] }
```

`migrate_v1.py` / `reembed_v1.py` 的运行手册与参数说明见脚本顶部注释。
