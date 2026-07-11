# 资讯模块爬虫重构 — 系统架构设计 + 任务分解（修订版 v2）

> 架构师：高见远（software-architect-5）基于实测源码核验后修订；v1 由 software-architect-4 产出。
> 目标：爬虫从「仅标题/摘要」升级为「抓取并落库完整正文 body」，在架构层面保证「禁止只爬标题/摘要」硬规则成立；交付可点击式 E2E + 前后端联调测试。
> 配套图：`docs/class-diagram.mermaid`、`docs/sequence-diagram.mermaid`
> 全部行号均来自 2026-06-22 实测 `Read`/`Grep`/`diff`，非简报估计值。

---

## 〇、实现现状核验（关键：与简报「根因」描述的差异）

**重要结论**：简报「三、已核实的根因」描述的是**重构前的原始问题**；本会话实测源码确认 **T01 / T02 / T03 / T04 均已落地并可运行**，仅 **T05（测试）与 T06（文档）待补**。因此工程师的实际剩余范围 = 「回归验证已落地实现」+「补齐 T05 测试」+「T06 文档」。

### 0.1 逐任务核验证据表

| 任务 | 状态 | 实测证据（文件:行号） |
|---|---|---|
| T01 契约对齐 + 联调可达 | ✅ 已完成并核实 | `backend/app.py:808` `POST /api/news` 分发器；`:782` `/api/news/rss` 委托 `_fetch_rss_with_extract`；`:797` `/api/news/validate`；`:763` `/api/news/extract`（向后兼容）。`src/js/db.js:1805` `_callCrawler` 已**解耦 window.TCB**：`:1815` 只要 `base` 存在即先 HTTP POST；`:1824` callFunction 仅作真实 CloudBase 冗余二级；`:1839` 本地兜底为最后一级。 |
| T02 增强 extract_body（两份同步） | ✅ 已完成并核实 | `backend/news_utils.py:102` `_BodyExtractor`（SKIP_TAGS + BLOCK_TAGS + NOISE_PATTERNS，CJK 适配）；`:194` `extract_body(max_len=20000)`。`functions/news-crawler/news_utils.py` 与 backend 版 **`diff` 逐字节一致（exit 0）**。 |
| T03 服务端逐篇抽取 + dailyCrawlAndScore | ✅ 已完成并核实 | `backend/app.py:676` `_fetch_rss_with_extract`：`:711-712` 先清空 `content/body`；`:715-736` 仅每源前 10 篇调 `_fetch_article_body`（8s 超时）；`:660` 8000 截断；常量 `:621-623`（`_RSS_EXTRACT_LIMIT=10` / `_RSS_ARTICLE_TIMEOUT=8` / `_RSS_EXTRACT_BUDGET=45`）。`src/js/db.js:2590` `dailyCrawlAndScore`：`:2629` `fullContent = article.content \|\| article.body`；`:2637` 仅空 body 才逐条 `extract` 兜底；`:2651-2655` 真实正文 <50 字符直接跳过不入库；`:2706` 入库前 `_validateNewsItem`。 |
| T04 资讯页阅读全文 + E2E 锚点 | ✅ 已完成并核实 | `src/pages/news.html:582` 卡片 `data-testid="news-card"`；`:600` 「阅读全文」按钮 `data-testid="news-open-detail"`（onclick 打开 `newsPreview`）；`:247` 详情容器 `data-testid="news-full-body"`；`:741` 渲染 `cachedItem.content`（经 DOMPurify 清洗）。`npm run dev` 直接服务 `src/`，联调无需先 build。 |
| T05 测试加固 | ❌ 待实现（主要剩余工作） | 全仓仅 `tests/e2e/real-cloud-e2e.mjs` 与 `tests/unit/get-rss-sources.test.mjs`；**无 backend pytest 覆盖 `/api/news` 三类 action、RSS 服务端抽取契约、8000 截断；无 Playwright E2E 覆盖「点点点」全链路**。 |
| T06 文档/注释 | ⏳ 部分（本文档已含说明） | 修复点注释已散落代码（如 `db.js:2628`【需求2·严禁摘要当正文】、`app.py:680` 注释）；README/CHANGELOG 爬虫重构说明待补。 |

### 0.2 与简报根因的对应关系（已闭环）

| 简报根因 | 当前代码中是否已修复 | 落点 |
|---|---|---|
| #1 本地/联调链路断点（`_callCrawler` 门控 `window.TCB`，本地 Mock 下退化成 summary） | ✅ 已修复 | `db.js:1805-1841` 解耦门控，HTTP 级只要 baseURL 可达即尝试（含 `localhost:8765/api/news`） |
| #2 服务端不抽全文（`/api/news/rss` 返回 `body=content or summary`）；前端 `dailyCrawlAndScore` 把摘要当正文 | ✅ 已修复 | `app.py:782`→`_fetch_rss_with_extract` 先清 body 再逐篇抽真实正文；`db.js:2629` 先读真实正文，空才 `extract` 兜底 |
| #3 `extract_body` 朴素（混噪声、无段落、CJK 弱） | ✅ 已修复 | `news_utils.py:102` `_BodyExtractor` 块级感知 + 噪声子树跳过 + CJK 适配 |
| #4 入库硬性过滤 `body≥50` | ✅ 已修复 | `db.js:2651-2655` + `_validateNewsItem(:2706)` + 后端 `filter_news_items` |
| #5 `_callCrawler` 扁平 vs items 契约 | ✅ 已固化 | 后端 `extract` 返回扁平对象；`db.js:1881-1883` `_normalizeCrawler` 包成 `items:[data]` |

---

## 一、实现方案与框架选型

### 1.1 技术栈（延续既有约束，零新增依赖）
| 层 | 选型 | 理由 |
|---|---|---|
| 爬虫核心 | **Python 标准库**（`xml.etree` / `html.parser` / `re` / `urllib`）+ `NewsUtils` | 团队硬约束：便于单测直接 import、禁止第三方（readability-lxml / trafilatura）。标准库 `HTMLParser` 子类化已做到块级感知 + 噪声跳过 + CJK 适配。 |
| 后端 | **FastAPI**（`backend/app.py` :8765） | 既有；新增单一 `POST /api/news` action 路由复用 `_fetch_rss_with_extract` / `_fetch_article_body` / `filter_news_items`，无需新框架。 |
| 云函数 | 腾讯云 CloudBase `functions/news-crawler`（已对齐逻辑） | 生产环境执行 RSS 逐篇抽取；本地 E2E 用 FastAPI 同一份逻辑镜像。 |
| 前端 | **原生 JS SPA**（`src/js/db.js` + `src/pages/news.html`） | 既有；不引入 React/Vue，避免构建复杂度。 |
| 测试 | pytest（后端）+ Playwright（点点点 E2E） | 既有 `tests/` 目录结构；T05 补 pytest 与 E2E。 |

**结论**：保持「纯标准库 + 原生 JS」，**不引入任何第三方爬虫库**，理由：(1) 团队明文禁止给 news_utils.py 加依赖；(2) 已增强的纯标准库 `_BodyExtractor` 满足 CJK 长文段落抽取；(3) 标准库方案让后端/云函数/测试三处共用同一份逻辑（两份 news_utils.py 已 diff 一致），避免行为漂移。

### 1.2 架构分层与调用链
- **调用链**：`news.html` → `DB.dailyCrawlAndScore` → `DB._callCrawler(action)` → 三级 fallback（HTTP → callFunction → 本地同规则兜底）→ 后端 `POST /api/news {action}` → `NewsUtils`（抽取/过滤）。
- **单一 action 端点**：QA 在 E2E 中将 `crawlerBackend.baseURL` 覆盖为 `http://localhost:8765/api/news`，前端 `fetch(base, {action:'rss'|'extract'|'validate'})` 统一打到 FastAPI 的 `POST /api/news` 分发器（对齐云函数 `main_handler` 的 action 路由）。

---

## 二、文件列表（标注状态）

| 文件 | 状态 | 说明 |
|---|---|---|
| `backend/app.py` | ✅ 已实现(已核实) | `POST /api/news` 分发器(:808)、`/api/news/rss`(:782)、`/api/news/extract`(:763)、`/api/news/validate`(:797)；`_fetch_rss_with_extract`(:676)、`_fetch_article_body`(:626)。 |
| `backend/news_utils.py` | ✅ 已实现(已核实) | `extract_body`/`_BodyExtractor`(:102) 已增强；与 functions 版逐字节一致。 |
| `functions/news-crawler/news_utils.py` | ✅ 已实现(已核实) | 与 backend 版 `diff` 一致。 |
| `functions/news-crawler/index.py` | ✅ 已实现(已核实) | `main_handler`(:234) 含 action 路由；`handle_rss`(:105)/`handle_extract`(:164)/`handle_validate`(:191) 已实现「先清 body、仅前10篇抽真实正文、失败留空」。常量 `:100-102`。 |
| `src/js/db.js` | ✅ 已实现(已核实) | `_callCrawler`(:1805) 解耦 `window.TCB`；`_httpPostCrawler`(:1844)；`_normalizeCrawler`(:1870，扁平包 items)；`_localCrawler`(:1890，RSS 显式失败)；`dailyCrawlAndScore`(:2590)；`_validateNewsItem`(:2706)。 |
| `src/pages/news.html` | ✅ 已实现(已核实) | `news-card`(:582) / `news-open-detail`(:600) / `news-full-body`(:247)；`openNewsPreview`(:739) 渲染 `cachedItem.content`。 |
| `tests/backend/test_app_news.py` | ❌ 新建（T05） | pytest：验证 `POST /api/news` 三类 action、RSS 服务端抽取契约（真实 body 非 summary）、extract 扁平结构、8000 截断。 |
| `tests/e2e/news-crawler.spec.mjs` | ❌ 新建（T05） | Playwright「点点点」：覆盖 `crawlerBackend.baseURL=http://localhost:8765/api/news`，断言详情展示真实 body 且非 summary。 |
| `docs/system_design.md` / `*.mermaid` | ✅ 本文件 | 设计文档与图示。 |

---

## 三、数据结构与接口契约（重点：前后端统一「文章四要素」）

### 3.1 统一文章对象（四要素 + 扩展字段）
```jsonc
{
  "title": "标题",
  "summary": "摘要/导语（仅 teaser，绝不充当 body）",
  "source": "来源域名或名称",
  "body": "真实正文（与 content 同值；落库前必须 ≥50 字符）",
  "content": "真实正文（与 body 同值；不新增独立 body 列）",
  "url": "文章原文 URL",
  "sourceUrl": "同 url（RSS 原始链接）",
  "publishedAt": "发布时间"
}
```
**硬规则**：`content == body` 都存真实正文；`summary` 永远是摘要，不得流入 `body`/`content`。

### 3.2 三类接口契约（前后端对齐核心）
| action | 请求 | 后端返回（**真实形态**） | db.js `_normalizeCrawler` 归一化后 |
|---|---|---|---|
| `extract` | `{url}` | **扁平对象** `{success, title, summary, source, body, content, url, length}` | `items:[扁平对象]`（故 `extractRes.items[0]` 是扁平对象） |
| `rss` | `{sources:[...]}` | `{success, data:[Article...], count, failedSources}`（Article 的 `body`/`content` 为真实正文） | `items = data`（直接是 Article 数组） |
| `validate` | `{items:[...]}` | `{success, valid:[...], dropped:[{item,reason}]}` | `valid/dropped` 透传 |

> **「扁平 vs items」结论**：后端 `extract` **永远返回扁平对象**（与云函数 `handle_extract` 一致）；前端 `_normalizeCrawler('extract')` 负责包成 `items:[data]`，下游统一用 `extractRes.items[0]`。**契约的唯一真相是 `_normalizeCrawler` 的归一化逻辑**（`db.js:1870-1884`）——任何端改动都不能破坏它。

### 3.3 类图（详见 `docs/class-diagram.mermaid`）
- `NewsUtils`：纯函数工具（`parse_rss_feed` / `extract_body` / `extract_meta` / `filter_news_items` / `build_news_document`）。
- `FastAPIBackend`：`POST /api/news` 分发 + `_fetch_article_body`(8s 超时) + `_fetch_rss_with_extract`(前10篇/45s预算) + `_validate_news_items`。
- `NewsCrawlerClient`（db.js）：三级 fallback，`_callCrawler` → `_httpPostCrawler`(HTTP) → `window.app.callFunction`(云函数) → `_localCrawler`(本地同规则兜底)。

---

## 四、程序调用流程（时序，详见 `docs/sequence-diagram.mermaid`）

**dailyCrawlAndScore 完整时序（标出已落地的修复点）**：

1. 用户点击抓取 → `dailyCrawlAndScore(sources)` → `getEnabledRssUrls()`（`db.js:2590`）。
2. **`fetchRSSSources` → `_callCrawler('rss')`**：
   - **【修复点 A · T01】** `_callCrawler`（`db.js:1805`）不再以 `window.TCB` 为 HTTP 前置门；只要 `crawlerBackend.baseURL` 可达（含 `localhost:8765/api/news`）即发起 `HTTP POST /api/news {action:'rss'}`（`:1815-1819`）。
3. **后端 `POST /api/news` → `_fetch_rss_with_extract`**：
   - **【修复点 C · T03】** 解析后**先清空 `content`/`body`**（`:711-712`）；仅对每源前 10 篇调 `_fetch_article_body`（8s 超时，单次 45s 预算保护，`:715-736`）抓真实正文；失败/空则 `body` 留空，**绝不回填 RSS 摘要**。返回 `data[]` 中每篇 `body`/`content` 为真实正文。
4. `db.js` 遍历 `articles`：
   - **【修复点 C · T03】** `fullContent = article.content || article.body`（`db.js:2629`，**不再用 summary 当正文**）。
   - 仅当 `fullContent` 为空才 `_callCrawler('extract', {url})` 兜底（`db.js:2637`，`_normalizeCrawler` 包成 `items:[扁平]`）。
   - `_validateNewsItem({body: fullContent, source})` → `POST /api/news {action:'validate'}` → `filter_news_items`（body≥50 且有来源）判定（`db.js:2706`）。
   - 通过 → 写 `news_items.content = 真实body`（content==body）；不通过 → 跳过不入库（`:2651-2655` 硬规则）。
5. **前端「点点点」**：列表卡片点击「阅读全文」(`news-open-detail`, `:600`) → `newsPreview` 弹窗渲染 `item.content` 到 `news-full-body` 容器（`:741`）。

**硬规则闭环**：服务端先清 body + 客户端先读 `article.body` + 入库前 `filter_news_items` 三道闸，任一环节 body 为空/过短即被丢弃 → 「只爬标题/摘要」在架构层面不可能入库。

---

## 五、任务列表（T01-T06，含实际状态与依赖）

> 依赖图：`T01→T03`、`T02→T03`、`T03→T04`、`T01/T02/T03/T04→T05`、`T05→T06`。
> **实际状态汇总**：T01-T04 已实现并核实（见第〇节）；T05 为当前主要待实现项；T06 为收尾。

### T01（P0，无依赖）契约对齐 + 联调可达 —— ✅ 已完成并核实
- **源文件**：`backend/app.py`、`src/js/db.js`（均已实现）
- **落地内容**：`POST /api/news` 分发器 + `/api/news/validate` + `/api/news/rss` 委托 `_fetch_rss_with_extract`；`db.js._callCrawler` 解耦 `window.TCB` 门控，HTTP 级只要 baseURL 可达即尝试；固化「扁平 vs items」契约（`_normalizeCrawler`）。
- **回归验收（工程师在 T05 前先跑）**：`curl -XPOST localhost:8765/api/news -d '{"action":"validate","items":[{"title":"t","summary":"s","source":"x.com","body":"真实正文内容长度足够"}]}'` 应返回 `{valid:[...],dropped:[]}`；E2E 覆盖 baseURL 后能走通 HTTP 路径。

### T02（P0，无依赖）增强 extract_body（两份同步） —— ✅ 已完成并核实
- **源文件**：`backend/news_utils.py`、`functions/news-crawler/news_utils.py`（已实现，`diff` 一致）
- **落地内容**：块级标签感知保留段落（BLOCK_TAGS）、扩展噪声跳过（NOISE_PATTERNS：comment/related/sidebar/advert/share/footer/nav 等子树）、CJK 适配、统一 8000 截断；`extract_meta` 不变。
- **回归验收（T05 覆盖）**：含噪声页脚/相关链接的 HTML，断言正文不含噪声且保留段落；确认两份文件 `diff` 为空（已通过）。

### T03（P0，依赖 T01+T02）服务端逐篇抽取 + dailyCrawlAndScore 改造 —— ✅ 已完成并核实
- **源文件**：`backend/app.py`、`src/js/db.js`（均已实现）
- **落地内容**：`/api/news/rss` 调用 `_fetch_rss_with_extract`（先清 body、前10篇抽真实正文、预算45s/超时8s、8000截断、按标题去重）；`dailyCrawlAndScore` 读 `article.content||article.body`，空才 `extract` 兜底，入库 `content=真实body`，入库前 `_validateNewsItem` 校验。
- **回归验收（T05 覆盖）**：`POST /api/news {action:'rss',sources:[...]}` 返回文章的 `body` 为真实正文（非 summary）；前端抓取后入库项 `content` 长度 ≥50 且不等于 RSS 摘要。

### T04（P1，依赖 T03）资讯页阅读全文 + E2E 锚点 —— ✅ 已完成并核实
- **源文件**：`src/pages/news.html`（已实现）
- **落地内容**：卡片 `news-card`（`:582`）、「阅读全文」按钮 `news-open-detail`（`:600`）、详情容器 `news-full-body`（`:247`），渲染 `cachedItem.content`（经 DOMPurify）。`npm run dev` 直接服务 `src/`，联调无需先 build。
- **回归验收（T05 覆盖）**：Playwright 能定位三个锚点；点击「阅读全文」后 `news-full-body` 文本为真实正文。

### T05（P1，依赖 T01~T04）测试加固 —— ❌ 待实现（当前主要工作）
- **源文件（新建）**：`tests/backend/test_app_news.py`、`tests/e2e/news-crawler.spec.mjs`
- **内容**：
  1. **pytest（后端，FastAPI TestClient）**：
     - `POST /api/news` 三类 action 路由可达：`extract`/`rss`/`validate`。
     - RSS 服务端抽取契约：用可控 RSS fixture，`/api/news/rss` 返回的文章 `body`/`content` 为真实正文（非 summary），且 `summary` 未回填进 `body`。
     - `extract` 返回**扁平对象**（无 `items` 包裹），字段含 `success/title/summary/source/body/content/url/length`。
     - 8000 字符截断：构造 >8000 字符正文，断言落库前截断到 8000。
     - 入库过滤：向 `validate` 提交 `body` 过短 / 无来源 的项，断言进入 `dropped` 且 `reason` 正确。
  2. **前端集成断言（在 db.js 单测或 fixture 中）**：落库项 `content` **永不为** `summary`（"summary 充当 body" 检测）。
  3. **Playwright「点点点」E2E**：覆盖 `crawlerBackend.baseURL=http://localhost:8765/api/news`，走通 抓取→列表(`news-card`)→阅读全文(`news-open-detail`)→详情(`news-full-body`) 全链路，断言 `news-full-body` 文本长度 ≥50 且 ≠ `summary`。
- **验收**：pytest 全绿；E2E 全流程通过。

### T06（P2，可选）文档/注释补充 —— ⏳ 部分
- **源文件**：`docs/system_design.md`（本文件）、代码注释、README/CHANGELOG
- **内容**：在 `app.py`/`db.js` 关键修复点补「为何解耦 TCB / 为何先清 body」注释（部分已存在）；更新 README/CHANGELOG 爬虫重构说明。

---

## 六、依赖包列表

```
# 后端 / 爬虫核心：零第三方依赖（仅 Python 标准库）
# 前端：原生 JS，无新增包
# 测试：pytest + httpx（FastAPI TestClient 依赖，既有 venv 应已具备）；@playwright/test（既有）
```
> 强调：**不新增任何爬虫依赖**。标准库 `html.parser`/`xml.etree`/`urllib` 已满足需求；前端沿用原生 JS。

---

## 七、共享知识（跨文件约定）

1. **字段语义**：`content == body` 均为真实正文；`summary` 仅为 teaser，永远不得写入 `body`/`content`。落库不新增独立 body 列（最小改动）。
2. **HTTP 契约**：所有 crawler 请求统一 `POST {action, ...}` 到 `crawlerBackend.baseURL`（E2E=`http://localhost:8765/api/news`）。`extract` 后端返回**扁平对象**，前端 `_normalizeCrawler` 包成 `items:[data]`；`rss` 返回 `{data:[...]}`；`validate` 返回 `{valid,dropped}`。
3. **CJK 与编码**：抓取后按 `utf-8→gbk→gb2312→latin-1` 顺序解码（见 `app.py:647`、`index.py` `_decode`）；`html.parser` 设 `convert_charrefs=True` 处理实体。
4. **超时/预算**：单篇正文 8s（`_RSS_ARTICLE_TIMEOUT`）、每源前 10 篇（`_RSS_EXTRACT_LIMIT`）、单次 RSS 抽取预算 45s（`_RSS_EXTRACT_BUDGET`，`app.py:621-623` 与 `index.py:100-102` 一致）。
5. **截断上限**：运行期真实正文存储统一 **8000** 字符（`app.py:660` / `index.py:173`）；`extract_body(max_len=20000)` 为函数级安全上限（`news_utils.py:194`），正常不触发。
6. **错误回退策略**：
   - 服务端抽取失败 → `body` 留空（绝不回填 RSS summary）→ 下游 `filter_news_items` 丢弃该篇。
   - 前端三级 fallback：HTTP → callFunction → 本地同规则兜底；本地兜底 RSS/正文抓取显式返回失败（不再静默退化成 summary，`db.js:1910-1918`）。
7. **SSRF 防护**：出站 URL 强制 `_validate_outbound_url`（`app.py` 与 `index.py` 共用策略），解析 IP 非私网/环回/保留（含 169.254.169.254）。
8. **双文件同步**：`backend/news_utils.py` 与 `functions/news-crawler/news_utils.py` **必须保持逐字节一致**；任何对 `extract_body`/`_BodyExtractor` 的改动须同步两处并以 `diff` 验证。

---

## 八、待明确事项

1. **【需主理人确认】代码现状与简报预期的偏差**：简报「已核实的根因」描述的是重构前状态，而实测 `backend/app.py`、`src/js/db.js`、`src/pages/news.html`、`functions/news-crawler/*` 当前**已实现 T01-T04 全部修复**（证据见第〇节）。请主理人确认：是否将 T01-T04 视为「已关闭、仅需回归验证」，并把工程师重心放在 **T05（测试）+ T06（文档）**？还是存在另一份「尚未修复」的代码基线需要我们切换到？
2. 其余主理人已拍板项（落库字段、超时预算、前端复用 newsPreview、联调指向、截断上限、逐条 extract 仅作空 body 兜底）**均已落实于当前代码**，无需再请示。

---

## 附：修复点速查表
| 根因 | 修复点 | 任务 | 代码位置（实测） |
|---|---|---|---|
| #1 本地门控断链 | A：HTTP 级解耦 `window.TCB`，baseURL 可达即尝试 | T01 | `src/js/db.js` `_callCrawler`:1805（解耦 `:1811-1819`） |
| #1 缺 action 端点 | A：新增 `POST /api/news` 分发 + `/api/news/validate` | T01 | `backend/app.py`:808 / :797 |
| #2 服务端不抽全文 | C：活路由改调 `_fetch_rss_with_extract`（先清 body） | T03 | `backend/app.py` `/api/news/rss`:782 → `_fetch_rss_with_extract`:676 |
| #2 前端摘要当正文 | C：`fullContent=article.content\|\|article.body`，空才 extract 兜底 | T03 | `src/js/db.js` `dailyCrawlAndScore`:2590（`:2629`/`:2637`） |
| #3 抽正文质量有限 | T02 增强 `_BodyExtractor` | T02 | 两份 `news_utils.py`:102（已 `diff` 一致） |
| #4 入库过滤 | 写库前 `filter_news_items`（body≥50 & 有来源） | T03/T05 | `news_utils.filter_news_items`；`db.js:2651-2655` / `_validateNewsItem`:2706 |
| #5 扁平 vs items | `_normalizeCrawler` 固化 | T01 | `src/js/db.js`:1870-1884 |
