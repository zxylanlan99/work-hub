# 变更日志

所有重要项目变更将记录在此文件中。

## V1.8.5 (2026-07-11)
- 资讯模块爬虫重构：后端新增 /api/news 分发器与服务端逐篇真实正文抽取；本地联调路径打通；新增后端契约/门禁/服务端抽取单测
- 知识沉淀页（output.html）AI 功能修复：aiAction / optimizeDoc / generatePracticePlan 真实写回编辑器与学习计划，根除「假成功」
- 新增新闻爬虫 E2E 测试（tests/e2e/qa-news-crawler-e2e.mjs）
- 构建脚本与测试门禁加固

## [V1.8.3] - 2026-07-10

### 新增
- AI 聊天页对话列表删除加固（自绘确认弹层 + 5 秒撤销窗口 + 持久化会话清理 + 按钮语义化）

### 修复
- 修复删除按钮因 JS 内联 `opacity:0` 覆盖 CSS hover 规则导致永久不可见（对话列表「不支持删除」根因）
- db.js `createChat` 补写 `agentId`，修正新建对话列表项智能体图标恒为 🤖 的问题
- AI 聊天页删除流程改用自绘确认弹层（替换原生 `confirm()`，显示对话标题、Esc/遮罩取消、可聚焦）
- 删除后 5 秒撤销窗口（误删可恢复，超时方执行级联硬删）
- 删除当前对话后清理持久化会话（`saveChatSession({currentChatId:null})`），刷新不再恢复已删对话
- 删除按钮 `<span>` → `<button>` + `aria-label`，删除失败提示通用化（不暴露内部错误）
- 修复自绘弹层被全局 `components.css` 的 `.modal-overlay{opacity:0}` 隐藏的冲突（inline `body .modal-overlay` 提权）
- 发布脚本 `scripts/deploy.js` 改用 `tcb hosting deploy src -e <envId>` 原语（原 `tcb deploy --mode=auto` 在本机 CloudBase CLI 3.x 失效、交互卡死）

### 优化
- 已发布上线（CloudBase 静态托管），线上点击式回归 A–K 全绿

### 已知风险（待后端/云架构闭环）
- CloudBase `chats`/`messages` 集合 `remove` 权限是否限定 `doc._openid==auth.openid` 尚未在控制台核验（越权删除 IDOR 防护）

## [V1.8.1] - 2026-07-10

### 修复
- RSS 资讯抓取改为抓取真实正文（前 10 篇逐条 handle_extract），禁止将摘要当正文入库；提取失败的文章 body 留空并记 `RSS 正文抓取无效` 告警
- db.js 正文组装去除 `article.summary` 回退，避免摘要冒充正文
- 知识库「分类目录」编辑/删除改为常驻图标，提升可发现性
- 删除知识库「AI推荐清单」子模块（保留资讯模块 AI 推荐）
- 修复资讯「知识源管理」`res.data.forEach is not a function` 报错（getRssSources 数组归一化 + Array.isArray 防御）
- 首页/计划/复习页「快问快答」改为读取复习计划（getReviewQueue），不再使用写死数据
- 资讯 RSS 源开关点击后即时局部刷新视觉状态（_refreshRssToggle），无需刷新页面

### 优化
- 新增 RSS 源读取单元测试（tests/unit/get-rss-sources.test.mjs）

## [V1.8.0] - 2026-07-09

### 新增
- 后端 AI 智能体模块（agent_memory / ai_agent / news_utils），支持 5 个预定义智能体 + 知识库引用
- news-crawler 云函数（资讯爬取）
- 前端 RAG 模块（rag.js）、会话管理（chat-session.js）、复习卡片解析器

### 变更
- ai-proxy 云函数增加 AI_PROXY_TOKEN 鉴权与频率限制
- 前端模块化重构（合并分散的页面 js 到统一模块，删除冗余文件）
- 新增 E2E/单元/后端测试基础设施

## [v1.6.0] - 2026-06-24（稳定版）

### 修复

- 修复线上环境页面加载失败问题（移除 CloudBase CDN 依赖，使用 Mock SDK 作为主方案）
- 修复 CloudBase 初始化时序问题（优先加载 Mock SDK，确保 db 实例可用）
- 修复变量重复声明导致的脚本执行错误
- 修复浏览器缓存导致新版本代码不生效问题

### 优化

- 优化脚本加载顺序：Mock SDK 优先加载，避免外部 CDN 跨域问题
- 更新所有脚本版本号为 v=12，强制浏览器刷新缓存
- 完全移除对腾讯云 CDN 的 CloudBase SDK 依赖，使用 localStorage 作为数据存储方案

## [v1.5.0] - 2026-06-24

### 新增

- 学习计划模块：新增 AI 诊断功能、学习目标管理、任务拆解
- 资讯模块：AI 推荐清单、资讯爬取与评分、智能过滤
- 知识库模块：知识沉淀、文档管理、复习卡片生成
- AI 对话模块：智能问答、学习辅助、上下文理解
- 复习计划模块：遗忘曲线复习、智能提醒、学习热力图

### 修复

- 修复 CloudBase SDK 加载失败时的降级处理
- 修复页面交互无响应问题
- 修复 XSS 安全漏洞
- 修复学习卡片生成功能

### 优化

- 优化页面加载性能（并行数据加载）
- 优化资讯过滤机制（域名白名单、AI评分过滤）
- 优化 Mock SDK 功能完整性

## [v1.0.0] - 2026-06-13

### 新增

- 创建完整项目目录结构
- 创建技术规范总览文档
- 创建项目规则文档
- 创建公共CSS组件（common.css, components.css）
- 创建公共JS模块（common.js）
- 重命名原型文件为标准命名

### 目录变更

- 文档目录整理为 docs/requirements/, docs/design/, docs/plan/
- 源代码目录统一为 src/
- 原型文件目录重命名为 prototypes/
- 新增 tests/, scripts/, config/ 目录结构
