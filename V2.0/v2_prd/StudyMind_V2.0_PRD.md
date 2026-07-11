# StudyMind V2.0 产品需求文档（PRD）

> 适用对象：AI 开发 / 架构师 / 工程师
> 文档性质：**规划文档**，描述 V2.0 目标架构与需求，非现状描述。
> 配套产出：`studymind_v2_prototype.html`（huashu-design 高保真原型）

---

## 1. 文档元信息

| 字段 | 值 |
|------|----|
| 产品名称 | StudyMind（墨研 / Ink Scholar 设计语言） |
| 文档版本 | V2.0-PRD v1.0 |
| 日期 | 2026-07-11 |
| 状态 | 草稿（待主理人/架构师/用户确认后进入开发） |
| 作者 | 产品经理 Alice（许清楚） |
| 关联文档 | V1.x 代码库（src/、backend/app.py、backend/ai_agent.py）、V1.x SKILL.md |
| 配套设计 | `v2_prd/studymind_v2_prototype.html` |

**版本策略**：先交付 PRD + 架构设计，确认后再进入开发（用户明确要求）。本 PRD 与架构师产出需一并评审。

---

## 2. 产品目标与定位

### 2.1 产品定位
StudyMind 是面向**个人学习者/知识工作者**的 AI 驱动学习管理系统。V2.0 的核心升级是引入**独立运行的 AI 智能体服务**作为系统“大脑”：用户可自定义智能体与 Skill，学习计划/复习计划/知识沉淀均由智能体协作完成；知识底座升级为开源知识库平台（FastGPT / Dify）+ 最新开源向量模型。

### 2.2 产品目标（正交、可衡量）
- **G1 · 智能体化**：所有 AI 能力收敛到“智能体中心”，支持用户自定义智能体（≥1）与自定义 Skill（≥1），记忆按智能体隔离。
- **G2 · 知识可沉淀**：知识沉淀模块提供单一写作面（取消对比模式），用户写大纲→智能体联网补全成稿，或写草稿→智能体润色完善，成稿可追溯引用。
- **G3 · 资讯可信**：资讯爬取引入“维度 + 红线规则”，无正文/不可信源一律不入库、不推荐（硬约束）。
- **G4 · 架构解耦**：AI 智能体成为独立服务；知识库模块可插拔开源底座（FastGPT/Dify），前端零 mock。
- **G5 · 体验升级**：UI 全面美化（墨研设计语言），系统设置精简为「模型配置 + RSS 源管理」两项。

### 2.3 非目标（V2.0 不做）
- 不重建多端 App（V2.0 聚焦 Web）。
- 不做团队协作/多租户（保持个人版）。
- 不内置自研大模型（仅接入第三方，含国内厂商与 Coding Plan）。

---

## 3. 用户故事（按模块）

| 模块 | 角色 | 故事 |
|------|------|------|
| 智能体中心 | 学习者 | 作为学习者，我希望创建“论文精读官”自定义智能体并绑定 Skill，以便对它说“精读这篇 PDF”时得到结构化解读。 |
| 智能体中心 | 学习者 | 作为学习者，我希望每个智能体的对话记忆相互隔离，以免规划师看到我的写作闲聊。 |
| 学习计划 | 学习者 | 作为学习者，我希望向“学习规划师”描述目标，它联网检索后给出里程碑与任务，我确认即入库。 |
| 复习计划 | 学习者 | 作为学习者，我希望“复习助手”根据我的薄弱主题生成针对性复习计划，并与 SM-2 排程联动。 |
| 知识沉淀 | 学习者 | 作为学习者，我只写大纲，写作助手联网搜索补全成文章；或我写完文章，它帮我润色完善。 |
| 知识沉淀 | 学习者 | 作为学习者，我希望写作区是单一编辑器，不要左右“用户 vs AI”对比那种割裂感。 |
| 资讯 | 学习者 | 作为学习者，我希望只看到有实质正文、来源可信的资讯，标题党/无正文的不出现。 |
| 知识库 | 学习者 | 作为学习者，我希望上传文档或资讯入库后能被智能体检索引用，且向量检索更准。 |
| 系统设置 | 学习者 | 作为学习者，我希望在设置里直接管理 RSS 源，并配置“无正文不入库”等红线。 |
| 系统设置 | 学习者 | 作为学习者，我希望添加国内厂商模型（含 Coding Plan 套餐）作为默认模型。 |

---

## 4. 需求池（P0 / P1 / P2）

> 编号规则：`V2-{模块}-{序号}`，模块=AGENT/PLAN/REVIEW/OUTPUT/NEWS/KB/SET/HOME/ARCH/CONS。
> 优先级：P0 必须（MVP）/ P1 应做 / P2 可选。验收标准（AC）须可测量。

### 4.1 P0（MVP 必须）

**V2-AGENT-001 · AI 智能体独立服务**
- 描述：将现有 `backend/app.py` 的 `/api/agent/*` 演进为独立“智能体服务”，负责对话、记忆隔离、知识检索、工具调用（联网/知识库/代码执行）。
- 验收标准：
  - AC1：服务暴露 `POST /api/agent/chat`、`GET /api/agent/list`、`POST /api/agent`、`DELETE /api/agent/{id}`。
  - AC2：对话记忆按 `agent_id` 隔离（与 V1.x `agent_memory` 一致），跨智能体不可见。
  - AC3：回答须携带知识库引用（citations），无引用时显式说明。
  - AC4：单请求超时 ≤ 45s，超时不重试、不烧 token（沿用 V1.x `_aiProxy` 策略）。

**V2-AGENT-002 · 用户自定义智能体**
- 描述：用户可创建/编辑/删除自定义智能体（名称、系统提示词、绑定 Skill、知识库范围、可用模型）。
- 验收标准：
  - AC1：创建后出现在“智能体中心”列表与对话入口。
  - AC2：自定义智能体记忆同样按 `agent_id` 隔离。
  - AC3：删除自定义智能体时级联清理其记忆。

**V2-AGENT-003 · 用户自定义 Skill**
- 描述：用户可定义 Skill（名称、提示词、可用工具白名单：web_search / knowledge_base / code_exec），供智能体调用。
- 验收标准：
  - AC1：Skill 可被绑定到智能体并在对话中触发。
  - AC2：Skill 元数据持久化（集合 `agent_skills`），非前端写死。

**V2-AGENT-004 · 内置智能体 + 内置 Skill**
- 描述：保留 V1.x 5 个内置智能体（规划师/讲解员/出题教练/复习助手/写作助手），并内置 Skill：全网搜索补全、大纲生成、文章润色完善、复习计划生成、资料推荐。
- 验收标准：AC1：5 个内置智能体 + ≥5 个内置 Skill 默认可用。

**V2-PLAN-001 · 智能体共建学习计划**
- 描述：学习计划由“学习规划师”智能体协作生成（描述目标 → 联网检索 → 生成里程碑/任务 → 用户确认入库）。
- 验收标准：
  - AC1：用户描述目标后，规划师调用联网搜索（web_search Skill）返回带引用的计划草案。
  - AC2：用户“确认并保存”后写入 `goals/milestones/tasks`（复用 V1.x 数据结构与 `confirmCreateGoalFromPlan`）。
  - AC3：无可用模型配置时返回明确引导，不静默失败。

**V2-REVIEW-001 · 智能体制定的复习计划**
- 描述：“复习助手”可基于薄弱主题（mastery<阈值）生成复习计划，并与 SM-2 排程联动。
- 验收标准：
  - AC1：根据用户薄弱主题列表生成针对性复习条目（关联 `review_cards`）。
  - AC2：生成的计划可一键加入复习队列（`batchEnqueueCards` 能力复用）。

**V2-OUTPUT-001 · 集成文本编辑器（取消对比模式）**
- 描述：知识沉淀改用单一富文本编辑器（建议 TipTap/ProseMirror 或等价），移除 V1.x“用户写作 vs AI 写作”对比布局。
- 验收标准：
  - AC1：编辑器为单一写作面，提供基础排版工具（加粗/标题/列表/引用）。
  - AC2：无“左右对比”视图；AI 能力以侧栏面板 + 行内插入方式呈现。
  - AC3：文档写入 `output_docs` 真实集合（非 mock）。

**V2-OUTPUT-002 · 大纲→成稿 / 润色完善**
- 描述：写作助手两种流程：(a) 用户写大纲 → 智能体联网搜索补全成文章；(b) 用户写草稿 → 智能体补全/润色完善。
- 验收标准：
  - AC1：大纲模式生成正文并标注引用来源（[source: 标题]）。
  - AC2：润色模式在原稿上增量修改，可追溯。
  - AC3：生成内容可一键插入编辑器。

**V2-NEWS-001 · 资讯爬取红线规则**
- 描述：升级推荐规则为“明确维度 + 红线规则”，不满足红线一律不入库、不推荐。
- 验收标准：
  - AC1：无正文（或正文 < 最小字数阈值，默认 200）的条目在 `validate` 阶段被丢弃。
  - AC2：命中来源黑名单 / 关键词红线的条目不推荐。
  - AC3：校验逻辑服务端统一执行（复用 `filter_news_items`），前端仅展示结果。

**V2-NEWS-002 · RSS 源管理迁至系统设置**
- 描述：RSS 源管理从资讯模块移入系统设置，支持增删改、健康状态展示、失效告警。
- 验收标准：
  - AC1：设置页「RSS 源管理」可添加/编辑/删除源，持久化到 `rss_sources` 集合。
  - AC2：展示每个源健康状态（健康/延迟/失效）。
  - AC3：爬虫仅抓取设置中启用的源。

**V2-SET-001 · 系统设置精简**
- 描述：设置仅保留「AI 模型配置」与「RSS 源管理」，移除通知/备份/数据管理（或移至其他入口，本期不做）。
- 验收标准：AC1：设置页仅有上述两节；AC2：模型配置支持国内厂商 + Coding Plan（见 V2-SET-002）。

**V2-SET-002 · 模型配置支持国内厂商 + Coding Plan**
- 描述：模型配置支持 DeepSeek/通义千问/智谱/GLM/Kimi/豆包/小米/MiMo/混元/盘古/阶跃等国内正式版本 + Coding Plan 套餐，以及 Ollama 本地模型。
- 验收标准：
  - AC1：服务商预设覆盖上述厂商，含正确 baseUrl 与 Coding Plan 地址。
  - AC2：可标记 planType=standard/coding/token，Coding Plan 使用独立 API Key。
  - AC3：保存/测试连接流程复用 V1.x settings.html 逻辑。

**V2-KB-001 · 集成开源知识库底座**
- 描述：知识库模块接入开源知识库平台（推荐 FastGPT，备选 Dify），由其负责解析/切片/向量化/检索/重排；StudyMind 通过 API 调用。
- 验收标准：
  - AC1：上传文档/资讯入库经知识库平台完成切片与向量化。
  - AC2：智能体检索走知识库平台检索接口（混合检索 + RRF 重排）。
  - AC3：保留“资讯可入库知识库”链路（V1.x `importNewsToKnowledge` 等价）。

**V2-KB-002 · 升级向量模型与向量库**
- 描述：向量模型由 `all-MiniLM-L6-v2`（MTEB 56.3，仅原型用）升级为开源模型；向量库可由 ChromaDB 切换至 Qdrant。
- 验收标准：
  - AC1：默认向量模型 `BGE-M3`（BAAI, MIT, 1024 维, 100+ 语言, 稠密+稀疏+多向量, 中文优化）；可选 `Qwen3-Embedding-8B`（中文最佳）。
  - AC2：向量库抽象可切换 ChromaDB（开发）/ Qdrant（生产）。
  - AC3：提供迁移脚本，将 V1.x ChromaDB 切片重建至新模型/库。

**V2-CONS-001 · 禁止前端写死 mock 数据**
- 描述：前端所有数据走真实接口/服务，严禁硬编码假数据。
- 验收标准：AC1：全量页面无 `const mockData=`；AC2：未配置服务时显示引导而非假列表。

**V2-CONS-002 · 禁止爬取无正文资讯**
- 描述：无正文的资讯一律不入库、不推荐（与 V2-NEWS-001 红线一致，列为硬约束）。
- 验收标准：AC1：服务端 `validate` 拦截；AC2：前端无绕过入口。

**V2-ARCH-001 · 前端架构升级**
- 描述：前端由原生 JS SPA 升级为组件化框架（建议 React + Vite + TypeScript，或 Vue3；**最终选型待架构师确认**），路由/数据层重构，但保留 V1.x 模块边界与 CloudBase 数据集合。
- 验收标准：
  - AC1：页面以组件实现，状态集中管理；AC2：数据层统一封装，零 mock；AC3：构建产物可部署（npm run build）。

### 4.2 P1（应做）

**V2-HOME-001 · 首页仪表盘视觉升级（墨研语言）**：热力图、待复习、智能体快捷入口、薄弱主题，沿用 V1.x 数据接口。
**V2-REVIEW-002 · 难度自适应出题**：基于 `generateReviewExercises` 扩展题型比例/难度自适应（choice/fill/qa）。
**V2-REVIEW-003 · 复习日历与连续天数可视化**：日历视图 + 连续天数激励。
**V2-REVIEW-004 · 知识条目自动转复习卡**：从 `knowledge_items` 一键生成 `review_cards`（关联 knowledgeId）。
**V2-OUTPUT-003 · 知识沉淀与知识库双向联动**：成稿可一键存入知识库分类；知识库条目可“送入写作助手”续写。
**V2-AGENT-005 · 智能体市场/共享**：导出/导入自定义智能体与 Skill 配置（JSON）。
**V2-NEWS-003 · 推荐维度可配置**：相关度/时效性/权威性/完整度/去重权重可在设置调整。
**V2-KB-003 · 知识库可视化分块管理**：参考 FastGPT 的分块预览与手动调整。

### 4.3 P2（可选）
**V2-AGENT-006 · 多模型路由**：智能体按任务选模型（规划用强模型，闲聊用轻模型）。
**V2-REVIEW-005 · 间隔重复算法可切换**（SM-2 / FSRS）。
**V2-OUTPUT-004 · 协同写作/版本历史**。
**V2-HOME-002 · 学习数据导出看板**。

---

## 5. UI 设计稿

> 由 `huashu-design` 技能产出高保真交互原型：`v2_prd/studymind_v2_prototype.html`
> 设计原则：从 V1.x 现有模块结构演化（非凭空），避免 AI-slop（无紫渐变、无 emoji 装饰图标、单一强调色、衬线标题）。

### 5.1 设计语言「墨研 / Ink Scholar」
- **底色**：暖纸 `#F6F3EC`（非纯白、非渐变）；表面 `#FFFFFF`；墨色文字 `#211C16`；发丝分隔线 `#E4DDD0`。
- **主强调 · 竹青绿** `#2F6B4F`（学者绿，替代 SaaS 蓝/紫）；**信号 · 琥珀** `#C8772E`（进度/高亮，单点使用）；**红线 · 朱砂** `#B23A2E`（警告/拦截，克制）。
- **字体**：标题 `Noto Serif SC` / `Newsreader`（衬线，中文友好）；正文 `Noto Sans SC` / system。
- **布局**：常驻左侧栏（8 模块：首页/学习计划/资讯/知识库/智能体中心/复习计划/知识沉淀/系统设置）+ 顶栏（问候 + 默认模型 + 唤起智能体）。内容区留白充足，发丝线分隔，靠“安静的数据密度”表达 AI 智能（引用、掌握度、连续天数），不堆装饰。
- **反 slop 要点**：无圆角卡片+左彩色边线套路；无 emoji 当图标；强调色唯一；真实微交互（顶栏唤起、智能体切换、红线开关可点）。

### 5.2 关键页面视觉规范（原型已实现）
| 页面 | 关键视觉 |
|------|---------|
| 首页仪表盘 | 4 个统计卡（竹青数字）+ 12 周热力图（4 级绿阶）+ 智能体快捷入口（6 卡，自定义卡用琥珀区分） |
| 智能体中心 | 左：智能体列表（内置 5 + 自定义）；右：详情（头像/描述/记忆隔离徽章/关联 Skill/对话控制台含引用 chip）；Skill 库分系统/用户 |
| 知识沉淀编辑器 | 三栏：文档树 / 单一编辑面（无对比）/ AI 助手面板（步骤追踪：解析大纲→联网→生成→引用） |
| 系统设置 | 仅两节：模型配置（厂商卡 + 已验证态）、RSS 源管理（健康点 + 红线规则开关） |
| 资讯动态 | 左：资讯卡（通过/拦截态，拦截卡虚线+删除线+朱砂原因）；右：推荐维度 + 红线硬约束 |
| 学习计划 | 左：里程碑时间线（规划师生成徽章）；右：智能体协作 5 步 + 确认入库 |

### 5.3 原型链接与说明
- 文件：`v2_prd/studymind_v2_prototype.html`（本地双击或 `python3 -m http.server` 打开）。
- 交互：左侧栏切换 8 个模块；智能体中心内可切“智能体/Skill 库”、点列表切换智能体；设置页红线开关可点。
- 已通过 Playwright 验证：8 屏切换 0 个 JS 运行时错误。
- **原型边界**：知识库、复习计划两屏为入口示意（沿用 V1.x 布局），其余为 V2.0 新增/变更模块完整高保真。

---

## 6. 各模块详细规格

> 接口契约为“雏形”，供架构师细化；数据结构在 V1.x CloudBase 集合基础上扩展。

### 6.1 AI 智能体（核心，对应需求 2.1/2.2/2.3）
**功能点**
- 独立智能体服务（由 V1.x `/api/agent/*` 演进），前端经统一客户端调用。
- 内置 5 智能体 + 内置 Skill（V2-AGENT-004）；用户自定义智能体/ Skill（V2-AGENT-002/003）。
- 记忆隔离（V1.x `agent_memory` 按 `agent_id`）；回答带知识库引用（V1.x `generate_with_citations`）。
- 工具：web_search（联网）、knowledge_base（检索知识库平台）、code_exec（代码执行，P2）。
- 可被学习计划/复习计划/知识沉淀调用（见 6.2/6.4/6.5）。

**接口契约雏形（智能体服务）**
```
POST /api/agent/chat
  body: { agentId, query, model?, skillIds?, sessionId? }
  resp: { success, data:{ content, citations:[{title,source_doc_id,snippet}], agentId, contextCount } }

GET  /api/agent/list
  resp: { success, data:[{id,name,builtin,skillIds[],desc}] }

POST /api/agent            # 自定义智能体
  body: { name, prompt, skillIds[], knowledgeScope?, model? }
  resp: { success, data:{ id } }

DELETE /api/agent/{id}     # 级联清理记忆

POST /api/skill            # 自定义 Skill
  body: { name, prompt, tools:['web_search'|'knowledge_base'|'code_exec'] }
  resp: { success, data:{ id } }

GET  /api/agent/{id}/memory   # 记忆隔离查看
```

**数据结构雏形**
```js
// agent_skills（新增）
{ _id, name, prompt, tools:[], builtin:bool, createdAt, updatedAt }

// agents（新增，自定义智能体；内置仍由代码常量定义）
{ _id, name, prompt, skillIds:[], knowledgeScope?, model?, builtin:false, createdAt, updatedAt }

// agent_memory（沿用 V1.x：key=agent_id，value=对话历史，隔离）
```

### 6.2 学习计划模块（对应需求 2.1 + 复习 2.2 协作）
**功能点**
- 与“学习规划师”智能体共建：描述目标 → 联网检索 → 生成里程碑/任务 → 确认入库（V2-PLAN-001）。
- 复用 V1.x `goals/milestones/tasks` 集合与 `confirmCreateGoalFromPlan`。
- 复习计划由“复习助手”生成（V2-REVIEW-001），见 6.4。

**接口契约雏形**
```
POST /api/plan/generate      # 规划师智能体生成（内部调用 agent/chat + web_search）
  body: { description, useWebSearch:true, topK:5 }
  resp: { success, data:{ title, description, milestones:[{title,tasks:[]}], recommendedMaterials:[] } }

POST /api/plan/confirm       # 复用 V1.x confirmCreateGoalFromPlan
  body: { plan }
  resp: { success, data:{ goalId } }
```

**数据结构**：沿用 V1.x `goals`(title,description,status,deadline…)、`milestones`(goalId,title,sort,status)、`tasks`(goalId,milestoneId,title,status,deadline…)。

### 6.3 资讯模块（对应需求 3）
**功能点**
- 爬虫增强：服务端逐篇正文抽取（V1.x `_fetch_rss_with_extract` 已做），严禁把 RSS 摘要当正文。
- 推荐规则：维度（相关度/时效性/权威性/完整度/去重）+ 红线（V2-NEWS-001）。
- RSS 源管理迁设置（V2-NEWS-002）；仅抓启用源。

**接口契约雏形**
```
POST /api/news/validate      # 红线校验（复用 filter_news_items）
  body: { items:[{title,summary,source,body,sourceUrl}] }
  resp: { success, valid:[], dropped:[{item,reason}] }

POST /api/news/rss           # 抓取+逐篇正文抽取（仅启用源）
  body: { sources:[启用源URL] }

POST /api/news/recommend     # 维度评分 + 红线过滤（P1 可配置权重）
  body: { items, weights? }
  resp: { success, data:[{item, score, passed, dropReason?}] }

# RSS 源（迁设置）
GET  /api/rss/sources        resp:{ data:[{id,url,enabled,status:'ok'|'warn'|'err',lastFetched}] }
POST /api/rss/sources        body:{ url }  -> 校验可达后入库
PUT  /api/rss/sources/{id}   body:{ enabled,url }
DELETE /api/rss/sources/{id}
```

**数据结构雏形**
```js
// rss_sources（新增）
{ _id, url, enabled:bool, status:'ok'|'warn'|'err', lastFetched, createdAt }

// news_items（沿用 V1.x，补充红线字段）
{ ..., body, bodyLength, passedRedline:bool, dropReason?, recommendScore? }
```

**资讯爬取红线规则草案（硬约束，服务端执行）**
| 红线 | 规则 | 动作 |
|------|------|------|
| R1 无正文 | `body` 为空或 `bodyLength < 200`（阈值可配） | 丢弃，不入库 |
| R2 来源不可信 | 命中来源黑名单 / 域名不在白名单 | 不推荐、不入库 |
| R3 关键词红线 | 命中敏感/垃圾关键词 | 拦截 |
| R4 摘要当正文 | 仅有 `summary` 无 `body` | 视为无正文（R1） |
| R5 去重 | 同 `sourceUrl` 或标题相似度 ≥85% | 跳过 |
> 注：R1–R5 在 `validate` 阶段统一拦截；前端仅展示通过与拦截结果，无绕过入口。

### 6.4 复习计划模块（对应需求 4）
**升级点（V2-REVIEW-001~004）**
- 智能体制定复习计划：“复习助手”基于薄弱主题（mastery<0.5）生成复习条目，一键入队。
- 难度自适应出题：扩展 V1.x `generateReviewExercises`（题型比例 + 难度）。
- 复习日历 + 连续天数可视化。
- 知识条目→复习卡：从 `knowledge_items` 一键生成 `review_cards`（关联 knowledgeId）。

**接口契约雏形**
```
POST /api/review/plan-by-agent   # 复习助手生成
  body: { weakTopics:[], goalId? }
  resp: { success, data:{ cards:[{question,answer,questionType,knowledgeId}] } }

POST /api/review/exercises       # 沿用 V1.x，扩展 difficulty 自适应
  body: { cardIds, questionTypeRatio, difficulty:'easy'|'medium'|'hard'|'mixed', count }

POST /api/review/from-knowledge  # 知识条目转复习卡
  body: { itemId }  -> 写入 review_cards(knowledgeId)
```
**数据结构**：沿用 V1.x `review_cards`(question,answer,questionType,knowledgeId,mastery,interval,nextReview…)、`review_history`。

### 6.5 知识沉淀模块（对应需求 5）
**功能点**
- 单一富文本编辑器（V2-OUTPUT-001，取消对比模式）。
- 两种 AI 流：大纲→成稿（写作助手联网补全 + 引用）、草稿润色完善（V2-OUTPUT-002）。
- 与知识库双向联动（V2-OUTPUT-003，P1）。

**接口契约雏形**
```
POST /api/output/generate        # 大纲→成稿（内部调用 agent/chat + web_search）
  body: { outline, title, categoryId? }
  resp: { success, data:{ content, citations:[] } }

POST /api/output/refine          # 润色/补全
  body: { content, instruction? }
  resp: { success, data:{ content } }

# 双向联动（P1）
POST /api/output/{id}/to-knowledge  body:{ categoryId }  -> 存入知识库
```
**数据结构**：沿用 V1.x `output_docs`(title,content,status:'draft'|'published',summary…)。

### 6.6 系统设置（对应需求 6）
**功能点**
- 仅「AI 模型配置」+「RSS 源管理」（V2-SET-001）。
- 模型配置支持国内厂商 + Coding Plan（V2-SET-002，复用 V1.x settings.html 预设与测试连接）。
- RSS 管理接口见 6.3。

**数据结构**：`ai_models`(provider,planType,modelName,baseUrl,apiKey,status…) 沿用 V1.x localStorage→建议迁 CloudBase；`rss_sources` 见 6.3。

### 6.7 知识库模块（对应需求 7）
**功能点**
- 集成开源知识库平台：推荐 **FastGPT**（中文优化 RAG、混合检索+RRF 重排、15 分钟部署、4C8G、低运维）；备选 **Dify**（完整 Agent/工作流平台、50+ 工具、较重）。**最终选型待架构师/用户拍板**。
- 向量模型：`BGE-M3`（默认，MIT，中文优化）或 `Qwen3-Embedding-8B`（中文最佳，Apache 系）；淘汰 `all-MiniLM-L6-v2`（仅原型）。
- 向量库：ChromaDB（开发）/ Qdrant（生产，过滤与扩展更优）；Milvus（大规模备选）。
- 保留资讯入库知识库链路（等价 `importNewsToKnowledge`）。

**接口契约雏形（知识库网关，封装 FastGPT/Dify）**
```
POST /api/kb/upload        # 上传文档 -> 平台解析/切片/向量化
POST /api/kb/search        # 混合检索 + RRF 重排 -> 返回 chunks+citations
POST /api/kb/chunks/{id}
DELETE /api/kb/{id}
POST /api/kb/ingest-news   # 资讯入库（红线通过后）
```
**数据结构**：知识条目元数据仍存 CloudBase `knowledge_items`（与 V1.x 兼容）；向量与切片由知识库平台管理。

### 6.8 首页（对应需求 1 视觉升级）
- 沿用 V1.x 数据接口（getStudyHeatmap / getTodayReviewStats / getWeakTopics / getPlanStats）。
- 视觉升级为墨研语言（V2-HOME-001）；智能体快捷入口跳转智能体中心。

---

## 7. 约束与红线

### 7.1 硬约束（开发必须遵守）
- **C1 · 禁止前端写死 mock 数据**：所有页面数据走真实接口/服务（CloudBase / 智能体服务 / 知识库平台 / 爬虫服务）。未配置服务时显示明确引导，不得用假列表填充。（对应 V2-CONS-001）
- **C2 · 禁止爬取无正文资讯**：无正文的资讯一律不入库、不推荐。服务端 `validate` 统一拦截，前端无绕过入口。（对应 V2-CONS-002 / 资讯红线 R1/R4）

### 7.2 资讯爬取红线规则（草案，服务端执行）
- R1 无正文（`body` 空或 <200 字）→ 丢弃
- R2 来源不可信（黑名单/非白名单）→ 不推荐
- R3 关键词红线命中 → 拦截
- R4 仅有摘要无正文 → 视为无正文（R1）
- R5 去重（同 URL / 标题相似 ≥85%）→ 跳过
> 红线开关与阈值（200 字、黑名单、关键词）在系统设置「RSS 源管理」下的红线规则区配置（原型已实现开关 UI）。

### 7.3 其他工程约束
- 智能体对话超时 ≤45s，超时不重试（防烧 token，沿用 V1.x）。
- 记忆严格按 `agent_id` 隔离，跨智能体不可见。
- 所有 AI 回答尽量带可溯源引用（citations）；无引用显式说明。
- 前端零 mock；构建产物可部署（npm run build）。

---

## 8. 待确认问题（需主理人/架构师/用户拍板）

1. **前端框架选型**（V2-ARCH-001）：React+Vite+TS 还是 Vue3？现有原生 JS SPA 是否全量重写？影响工作量与排期。
2. **开源智能体底座**：V2.0 “AI 智能体是单独服务”——是在 V1.x FastAPI `/api/agent` 上演进，还是引入第三方 Agent 框架（如 LangGraph / Dify Agent / 自研）？自定义 Skill 的执行沙箱如何做（尤其 code_exec）？
3. **知识库平台选型**（V2-KB-001）：FastGPT（推荐，中文/轻量）还是 Dify（强 Agent/工作流）？私有化部署资源（FastGPT 4C8G vs Dify 8C16G）是否就绪？
4. **向量模型与向量库**（V2-KB-002）：默认 BGE-M3 还是 Qwen3-Embedding-8B？向量库 ChromaDB→Qdrant 的迁移成本与运维归属？
5. **模型配置存储**：V1.x 模型配置在 localStorage，V2.0 是否迁 CloudBase（多端同步/安全）？
6. **Coding Plan 模型**：需明确各家 Coding Plan 的实际可用模型名与 Key 获取方式（settings.html 已有 planType 字段，待补真实地址）。
7. **知识沉淀编辑器选型**（V2-OUTPUT-001）：TipTap / ProseMirror / 其他？是否需协同（P2）？
8. **范围与排期**：P0 是否即为 V2.0 首发范围？P1（复习日历、知识库双向联动等）是否同版或后续小版本？
9. **数据迁移**：V1.x ChromaDB（all-MiniLM）切片与 CloudBase 数据如何平滑迁移到 V2.0（尤其向量模型更换需重建索引）。
10. **智能体市场**（V2-AGENT-005，P1）：自定义智能体/Skill 的导出导入格式与分享范围。

---

## 附录 A · V1.x 现状要点（理解背景，非需求）
- 前端：原生 JS SPA（framework.js 路由 → fetch pages/*.html；db.js 数据层；注意 `importNewsToKnowledge`/`ignoreNews` 共用，`switchKbTab` 依赖 `clearBatchSelection`/`updateBatchBar`）。
- 后端：FastAPI :8765（知识上传/切片/搜索、RSS 抽取、5 内置智能体+记忆隔离、news validate/rss/extract）。
- 知识：CloudBase 集合（categories/knowledge_items 等）+ ChromaDB（all-MiniLM-L6-v2）。
- 设置：已支持多厂商国内模型 + Coding Plan（settings.html）；RSS 管理尚未在设置。
- 资讯：已有 `filter_news_items` 无正文过滤（红线雏形）。
- 输出：已有 outline/expand/refine/review，但为“用户 vs AI 对比”模式（V2.0 取消）。

## 附录 B · 事实依据（2026-07 验证）
- 开源向量模型：BGE-M3（BAAI, MIT, 1024 维, 100+ 语言, 稠密+稀疏+多向量, 中文优化, 生产 RAG 最常用）；Qwen3-Embedding-8B（Apache 系, ~119 语言, 中文最佳）；GTE-Qwen2-7B（Apache 2.0）；Nomic Embed v2；Jina v5-text-small。
- 向量库：ChromaDB（简单）、Qdrant（生产过滤/扩展）、Milvus（大规模）。
- 知识库平台：FastGPT（中文优化 RAG、混合检索+RRF 重排、约 89% 准确率、15 分钟部署、4C8G、低运维）；Dify（可视化工作流、50+ 工具、Agent 框架、较重部署）。
