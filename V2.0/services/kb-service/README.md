# kb-service (占位)

**状态**：Wave 1 占位，由 **Wave 2 / T05** 填充。

本目录为 docker-compose 中 `kb-service` 的 build context（`../services/kb-service`）。
当前仅含占位 `Dockerfile`，使 `docker compose build` 通过；默认不在 `docker compose up` 中启动
（受 `profiles: ["backend"]` 约束）。

**Wave 2 职责（技术决策 #3 FastGPT，C3 硬约束）**：
- FastGPT 网关，**仅检索后端**（上传/检索/删除），**不调用 Agent/Workflow 端点**
- 向量模型 BGE-M3，向量库 Qdrant（开发期 ChromaDB）
- 端点：`POST /api/kb/upload`、`POST /api/kb/search`、`POST /api/kb/ingest-news`
