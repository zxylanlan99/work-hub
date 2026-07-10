# QA 报告：AI 聊天页「对话删除功能加固」修复后回归 v2

- 测试人：gstack-qa-lead
- 日期：2026-07-10
- 目标产物：`src/pages/ai-chat.html`、`src/js/db.js` 及对应 `dist/`
- 环境：mock 模式（拦截 cloudbase.full.js），Playwright Chromium-1228，受管 Node v22.22.2
- 脚本：`qa-ai-delete-v2.mjs`
- 数据：`qa-results/ai-delete-qa-v2.json`

## 决策：GO（已含 CSS 提权修复）

**结论**：A–K 全绿（src + dist 重建后），CSS 冲突已通过选择器提权彻底解决，可以发版。

**两轮结论**
- 第 1 轮：发现 Blocker（弹层被全局 `components.css` 隐藏），我临时补 `opacity:1;visibility:visible` 后 A–K 全绿 → 条件 GO。
- 第 2 轮（本次）：team-lead 将 `.modal-overlay` 提权为 `body .modal-overlay`（彻底摆脱注入顺序依赖），并 `npm run build` 重建 dist。重跑确认 A–K 全部仍 PASS、零真实控制台报错、Go 不变。

## 测试覆盖矩阵（src:8090 / dist:8091）

| 用例 | 验证点 | src | dist |
|------|--------|-----|------|
| A | 弹层出现，标题「删除对话」，含对话标题/5秒文案，按钮存在，取消按钮获焦 | PASS | PASS |
| B | 点删除后列表项消失、chatState.conversations 不含该 id、undo-toast 出现 | PASS | PASS |
| C | 5 秒内点撤销，对话恢复、toast 消失、DB 中仍存在 | PASS | PASS |
| D | 取消/Esc，对话保留且无 toast | PASS | PASS |
| E | 点删除等待 >5s，toast 消失，reload 后真删成功 | PASS | PASS |
| F | 删除当前对话，等待真删后刷新，未恢复已删对话、标题「AI助手」 | PASS | PASS |
| G | 新建对话，mock DB 文档含 `agentId` 且等于当前智能体 | PASS | PASS |
| H | 删至最后一条真删后，显示「暂无对话」空状态 | PASS | PASS |
| I | emulate (hover:none)，`.conv-delete-btn` opacity=1 | PASS | PASS |
| J | 剔除故意拦截 SDK 的网络错后，pageerror/console.error = 0 | PASS | PASS |
| K | 首页/计划/知识库/资讯/复习/沉淀/设置 无白屏无报错 | PASS | PASS |

## 发现的问题（按严重度）

- **Blocker（第 1 轮，已修）**：原自绘确认弹层被全局 `src/css/components.css` 的 `.modal-overlay { opacity:0; visibility:hidden }` 覆盖而**不可见**，功能不可用。
- **第 2 轮修复（选择器提权）**：team-lead 将 inline 选择器由 `.modal-overlay` 提权为 `body .modal-overlay`，彻底摆脱对全局 `components.css` 注入顺序的依赖，弹层永远可见。已 `npm run build` 以 src 重建 dist。
- **第 2 轮 QA 发现（已处理）**：重跑前巡检发现 team-lead 那次 `npm run build` 未把提权落到 dist（dist 仍只有第 1 轮的 `opacity:1` 行、缺 `body` 提权）。已重跑 `npm run build` 使 dist 与 src 一致并复测。
- Critical / Major / Minor：0。

## 修复 diff（现版，src + dist 一致）

```css
/* src/pages/ai-chat.html 内联 <style> —— 选择器提权，覆盖全局 components.css 隐藏态 */
body .modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
  opacity: 1; visibility: visible;
}
```

文件：`src/pages/ai-chat.html`（已 `npm run build` 同步至 `dist/pages/ai-chat.html`）。

## 发布检查清单

- [x] 自绘确认弹层可见（`body .modal-overlay` 提权生效），文案/按钮/获焦正确
- [x] 删除后乐观隐藏 + undo toast 出现
- [x] 撤销恢复且 DB 未真删
- [x] 取消/Esc 不删
- [x] 5 秒超时后真删
- [x] 删除当前对话后持久化 currentChatId 清理，刷新不恢复
- [x] `createChat` 写入 `agentId`
- [x] 空状态「暂无对话」显示正常
- [x] 触屏设备删除按钮可见
- [x] 全程无未捕获 JS 异常
- [x] 主要页面冒烟无白屏
- [x] src 与 dist 双产物一致

## 回滚预案

若上线后异常：
1. **git 回滚**：`git revert <本次 ai-chat.html 删除重构提交> <db.js createChat 提交>` 后 `npm run build`。
2. **快速手动**：还原 `src/pages/ai-chat.html` 删除相关函数至原生 confirm 逻辑；还原 `src/js/db.js` 的 `createChat` 去掉 `agentId`；回滚上述 CSS 行；`npm run build`。
3. **回滚验证**：重跑 `qa-ai-delete-v2.mjs`，确认核心链路可回归。

## 复现命令

```bash
cd StudyMind_TRAE_V1.1
python3 -m http.server 8090 --directory src &
python3 -m http.server 8091 --directory dist &
export PATH="/Users/zouxiaoyong/.workbuddy/binaries/node/versions/22.22.2/bin:$PATH"
node qa-ai-delete-v2.mjs
```

## 产物

- `qa-ai-delete-v2.mjs`：A–K 完整回归脚本
- `qa-results/ai-delete-qa-v2.json`：每步证据、pass/fail、errors
- `qa-results/src-01-modal.png`、`src-02-undo-toast.png`、`src-04-empty.png` 等截图
- 本报告 `qa-report-ai-delete-v2.md`

## 第 2 轮重跑记录（提权加固后）

- team-lead 将 `.modal-overlay` 提权为 `body .modal-overlay`，并声称已 `npm run build` 重建 dist。
- QA 巡检发现 dist 当时未含该提权（仍只有第 1 轮 `opacity:1` 行），于是重跑 `npm run build`（17/17 JS 语法检查通过，dist 已生成），确认 dist 现含 `body .modal-overlay`。
- 重跑 `qa-ai-delete-v2.mjs`：src 与 dist 的 A–K **全部 PASS**，真实控制台/页面错误 0，Go 决策不变（= GO）。用例 A 在 dist 下依旧通过。
