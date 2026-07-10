# QA 报告：AI 聊天页「对话列表删除」功能修复（上线前点击式）

- 测试人：gstack-qa-lead
- 日期：2026-07-10
- 修复物：`src/pages/ai-chat.html` 的 `.conv-delete-btn`（CSS 类 + `:hover` + `@media (hover:none)`），已 `npm run build` 重建至 `dist/`
- 历史 bug：JS 内联 `style.opacity='0'` 覆盖 hover 规则 → 删除按钮永久不可见、点不到。修复后由 CSS 类控制默认隐藏、hover 显示，触屏设备始终可见。

## 环境与策略
- 真实浏览器 Playwright（Chromium-1228，受管 node v22.22.2）。
- **Mock 模式**：在测试上下文拦截 `**/cloudbase.full.js**` 使其加载失败 → `cloudbase-mock.js` 保留 localStorage Mock SDK，**无需真实 CloudBase 即可造数据**。
- 分别对两套产物验证：`src/`（开发源码，8090）与 `dist/`（发布构建，8091），结果完全一致。
- 对话数据通过 UI「+ 新对话」与 `window.DB.createChat` 注入；删除二次确认用 `page.on('dialog')` 控制 accept/dismiss。

## 测试覆盖矩阵
| # | 用例 | 方法 | src | dist | 结果 |
|---|------|------|-----|------|------|
| 1 | **删除按钮可见性回归（核心）** | 取 `.conv-delete-btn` computed opacity，hover 前后对比 | 0→1 | 0→1 | ✅ |
| 2 | 完整删除流 | 新建→列表出现→hover→点删除→confirm accept→列表-1、对话移除 | ✅ | ✅ | ✅ |
| 3 | 删除当前选中对话 | 选中后删除→右侧消息区清空、标题回到「AI助手」 | ✅ | ✅ | ✅ |
| 4 | 取消 confirm（dismiss） | 弹窗取消→对话保留、未误删 | ✅ | ✅ | ✅ |
| 5 | 删至最后一条 | 列表空→显示空状态「暂无对话」 | ✅ | ✅ | ✅ |
| 6 | 触屏可达性 | `@media(hover:none)` 上下文：按钮始终可见(opacity 1) | ✅ | ✅ | ✅ |
| 7 | 异常监控 | 全程 `pageerror`/`console error`（剔除故意拦截 SDK 的网络错误） | 0 | 0 | ✅ |
| 8 | 预发布冒烟 | 首页/计划/知识库/资讯/复习/沉淀/设置 无白屏、路由正常 | ✅ | ✅ | ✅ |
| 9 | 真实点击验证 | 非单元桩，真实浏览器 DOM 交互 | ✅ | ✅ | ✅ |

## 发现的问题（按严重度）
- **Blocker：0**　**Critical：0**　**Major：0**　**Minor：0**
- 原 inline-style 历史 bug 已彻底消除；未引入回归。

## 发布检查清单
- [x] 核心修复生效（src & dist 双重验证）
- [x] 删除 / 取消 / 空态 / 选中态 全链路正常
- [x] 触屏设备删除按钮可达
- [x] 全程无未捕获 JS 异常、无控制台报错
- [x] 主要页面无白屏、路由无异常

## 决策：✅ GO
（无任何阻塞项；src 与 dist 均全绿，可直接发布。）

## 回滚预案
本次改动仅限 `src/pages/ai-chat.html` 的 `.conv-delete-btn` 相关 CSS/JS（及对应 `dist/` 构建产物）。
1. **推荐**：`git revert <修复提交>`，随后 `npm run build` 重建 dist。
2. **快速**：`git checkout HEAD~ -- src/pages/ai-chat.html && npm run build`。
3. **应急手动**（不推荐）：删回 `.conv-delete-btn{opacity:0;transition}` 与 `@media(hover:none)` 块，并把 `delBtn` 改回内联 `style.opacity`（即回到旧有 bug 态，仅作回退验证用）。
4. **回退验证**：重跑 `qa-ai-delete.mjs`，确认 opacity 0→1 用例仍为 PASS、无新报错即回退干净。

## 复现命令
```bash
cd StudyMind_TRAE_V1.1
python3 -m http.server 8090 --directory src &     # 开发源码
python3 -m http.server 8091 --directory dist &    # 发布构建
node qa-ai-delete.mjs                              # 默认打 src:8090
QA_BASE=http://localhost:8091/ node qa-ai-delete.mjs   # 打 dist
```

## 产物
- `qa-results/ai-delete-qa.json`：每步证据、dialogs、pageErrors、consoleErrors、verdict
- `qa-results/ai-01-initial-empty.png`、`ai-02-hover-deletebtn.png`、`ai-03-empty-after-delete.png`
- 脚本：`qa-ai-delete.mjs`（复用现有 Playwright 基建风格，新增 mock 强制与删除全链路断言）
