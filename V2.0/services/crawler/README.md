# crawler-service (占位)

**状态**：Wave 1 占位，由 **Wave 2 / T07** 填充。

本目录为 docker-compose 中 `crawler-service` 的 build context（`../services/crawler`）。
当前仅含占位 `Dockerfile`，使 `docker compose build` 通过；默认不在 `docker compose up` 中启动
（受 `profiles: ["backend"]` 约束）。

**Wave 2 职责（C2 硬约束：红线仅在服务端执行）**：
- RSS 抓取 + 逐篇正文抽取
- 红线引擎 R1–R5（无正文/黑名单/关键词/摘要当正文/去重），阈值可配
- 联网搜索（SSRF 防护）
- 端点：`POST /api/news/rss`、`POST /api/news/validate`、`POST /api/search/web`、`/api/rss/sources`
