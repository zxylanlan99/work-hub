# kb-service（StudyMind V2.0 知识库网关）

**职责**：封装 **FastGPT 社区版**，作为系统的「知识库检索后端」。所有切片 / 向量化 /
检索 / 重排由 FastGPT 负责；本服务只暴露**数据集 / 文档 / 检索**三类无状态接口，
对外提供 `backend_collection_id` 映射供 data-service 存储。

- 端口：**8002**（`profiles: ["backend"]`，需 `docker compose --profile backend up` 启动）
- 技术栈：FastAPI + httpx + Pydantic v2 + python-dotenv + uvicorn
- 向量模型：**BGE-M3**（经 FastGPT 配置）；向量库：**Qdrant**（生产）/ **ChromaDB**（开发）

---

## ⚠️ C3 硬约束（架构文档 §7）

> **FastGPT 仅作无状态知识库检索后端。**
> 本服务**严禁**启用或暴露 FastGPT 的 **Agent 应用 / Workflow / 应用编排** 端点。
> 所有智能体编排、记忆、工具、密钥统一收敛于 **agent-service（Agno）**。

代码中已在 `app/main.py`、`app/fastgpt_client.py`、`app/routers/kb.py` 顶部以注释显式标注
C3，Code Review 会拦截对 FastGPT Agent/Workflow 端点的调用。本服务只调用：

| FastGPT 端点 | 用途 | 对应方法 |
|---|---|---|
| `POST /api/core/dataset/insertDataset` | 建数据集 | `create_dataset` |
| `POST /api/core/dataset/collection/create/text` | 文本入库 | `upload_document` |
| `POST /api/core/dataset/searchTest` | 检索(+RRF 重排) | `search` |
| `GET /api/core/dataset/list` | 列数据集 | `list_datasets` |

---

## 接口契约（前缀 `/api/kb`）

| 方法 | 路径 | 说明 | 返回 |
|---|---|---|---|
| POST | `/api/kb/datasets` | 建知识库 | `{ backend_collection_id }` |
| GET | `/api/kb/datasets` | 列表 | `[{ id, name }]` |
| POST | `/api/kb/documents` | 文档入库 `{dataset_id, title, content}` | `{ document_id }` |
| POST | `/api/kb/search` | 语义检索 `{dataset_id, query, top_k}` | `[{ content, score }]` |

data-service `knowledge.py` 将 `backend_collection_id` 存为 `KnowledgeItem.backend_collection_id`
（向量/切片由 FastGPT 管理，本服务是唯一向量访问面）。

---

## 配置（环境变量）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `FASTGPT_API_URL` | `""` | FastGPT 社区版 OpenAPI 基址（如 `http://fastgpt:3000`） |
| `FASTGPT_API_KEY` | `""` | FastGPT OpenAPI Key；**为空则走 dev 回退** |
| `DEV_VECTOR_STORE` | `fastgpt` | dev 无 FastGPT 时向量后端：`chroma` 或 `fastgpt`(内存) |
| `QDRANT_URL` | `http://qdrant:6333` | 生产向量库地址（FastGPT 后端使用） |
| `KB_SERVICE_PORT` | `8002` | 监听端口 |
| `DATA_SERVICE_URL` | `http://data-service:8000` | data-service 地址 |

---

## 开发期 ChromaDB 回退（无 FastGPT 也能跑通检索闭环）

当 **`FASTGPT_API_KEY` 为空** 时：

- `DEV_VECTOR_STORE=chroma` 且已安装 `chromadb` → 使用**本地 ChromaDB** 做向量存储与检索
  （在 `requirements.txt` 取消 `chromadb` 注释后 `pip install chromadb`）。
- 否则 → 退化为**内存确定性向量**（哈希词袋 + L2 归一化，无需任何 embedding 模型），
  保证无 FastGPT、无外网时也能跑通「建库 → 入库 → 检索」闭环。

> **生产环境必须配置 `FASTGPT_API_URL` + `FASTGPT_API_KEY`**，dev 回退仅供本地开发/演示。
> 回退实现见 `app/fastgpt_client.py` 的 `DevVectorBackend`，注释明确标注「仅 dev 用」。

---

## 运行

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8002
# 或容器化：
docker compose --profile backend up kb-service
```

健康检查：`GET /health` → `{"status":"ok"}`
