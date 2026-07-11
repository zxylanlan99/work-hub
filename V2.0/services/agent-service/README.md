# agent-service（智能体大脑 · Agno 底座）

StudyMind V2.0 的**智能体服务**，基于 [Agno](https://github.com/agno-agi/agno)（Python，MIT）。
它是系统唯一的**编排 / 记忆 / 工具 / 密钥方**（C3 硬约束）：FastGPT 仅经 kb-service 作为无状态检索后端，
本服务不调用 FastGPT 的 Agent / Workflow 端点。

## 技术栈

FastAPI + Agno + Pydantic v2 + python-dotenv + uvicorn + httpx

## 端口

`8001`（与 `deploy/docker-compose.yml` 中 agent-service 配置一致，受 `profiles: ["backend"]` 约束）。

## 目录结构

```
agent-service/
├── requirements.txt
├── Dockerfile
├── README.md
└── app/
    ├── __init__.py
    ├── main.py          # FastAPI 入口 + CORS + /health + 挂载路由
    ├── config.py        # 环境变量配置（LLM_*/KB_SERVICE_URL/端口等）
    ├── llm.py           # 基于 Agno 的 LLM 客户端（OpenAI 兼容）
    ├── memory.py        # 按 conversation_id 隔离的会话记忆（C1）
    ├── agents/          # 内置智能体定义 + 构建工厂
    │   ├── specs.py      #   智能体规格（general / review_coach / kb_qa）
    │   └── factory.py    #   懒加载 + 缓存 Agno Agent 实例
    ├── tools/
    │   ├── kb_tool.py        # knowledge_base 检索工具（调用 kb-service /api/kb/search）
    │   └── web_search_tool.py # web_search 联网搜索（调用 crawler-service /api/crawler/search）
    └── routers/
        └── agents.py     # /api/agents、/api/agents/{id}/chat、/api/conversations/{id}
```

## 接口契约

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | 列出内置智能体（`id` / `name` / `description`） |
| POST | `/api/agents/{agent_id}/chat` | 对话，请求体 `{conversation_id, message}`，返回 `{conversation_id, reply, agent_id}` |
| GET | `/api/conversations/{conversation_id}` | 取会话历史 |
| GET | `/health` | 健康检查 |

内置智能体：`general`（通用学习助手）、`review_coach`（复习教练）、`kb_qa`（知识问答，调用知识库检索）。

## 如何接入 LLM（必做）

本服务是唯一的 LLM 调用方，密钥仅存于服务端。在 `deploy/.env` 中配置：

```dotenv
# 与 deploy/.env.example 一致
LLM_API_KEY=sk-xxxx                # 厂商 / Coding Plan / Ollama 的 API Key
LLM_BASE_URL=https://api.openai.com/v1   # OpenAI 兼容接口地址
LLM_MODEL_NAME=gpt-4o              # 模型名（或国内厂商 / Coding Plan 模型名）

# kb-service 地址（实际部署端口以 docker-compose 为准：kb=8002）
KB_SERVICE_URL=http://kb-service:8002
```

> 若 `LLM_API_KEY` 或 `LLM_BASE_URL` 未配置，服务仍可启动，但调用对话时会返回
> **503 + 清晰引导**（而非崩溃），提示先配置模型。

本地启动：

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
# 或： python -m app.main
```

## 记忆隔离（C1）

- 隔离维度：**conversation_id**。不同会话的记忆互不可见（见 `app/memory.py`）。
- MVP 用进程内 dict 存储，可选通过 `AGENT_CONVERSATION_PERSIST_PATH` 落盘 JSON。
- 生产环境应将会话历史持久化到 data-service（当前 T02 未建会话表）。

## 如何扩展智能体

1. 在 `app/agents/specs.py` 的 `BUILTIN_AGENTS` 中新增一个 `AgentSpec`
   （`id` / `name` / `description` / `system_prompt` / `tool_names`）。
2. 若需要新工具，在 `app/tools/` 下定义函数（带中文 docstring，返回字符串），
   并在 `app/agents/factory.py` 的 `_TOOL_REGISTRY` 注册。
3. 路由与记忆隔离自动生效，无需改动 `main.py`。

> 自定义智能体 / 自定义 Skill 的 CRUD 接口见后续任务（T04），本服务已预留结构。

## 约束

- **C3**：不调用 FastGPT 的 Agent / Workflow 应用端点；仅经 kb-service 做无状态检索。
- 单请求超时 ≤45s（沿用 V1.x，超时不重试防烧 token）。
- 记忆严格按 conversation_id 隔离，跨会话不可见。
