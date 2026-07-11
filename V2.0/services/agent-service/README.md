# agent-service (占位)

**状态**：Wave 1 占位，由 **Wave 2 / T03** 填充。

本目录为 docker-compose 中 `agent-service` 的 build context（`../services/agent-service`）。
当前仅含占位 `Dockerfile`，使 `docker compose build` 通过；默认不在 `docker compose up` 中启动
（受 `profiles: ["backend"]` 约束）。

**Wave 2 职责（技术决策 #2 Agno）**：
- 智能体大脑（Agno 底座），内置 5 智能体 + 自定义智能体/Skill
- 记忆按 `agent_id` 隔离（§2.4 #10）
- 统一编排 / 记忆 / 工具 / 密钥方（C3 硬约束）
- 端点：`POST /api/agent/chat`、`GET /api/agent/list`、`POST /api/agent`、`DELETE /api/agent/{id}`
