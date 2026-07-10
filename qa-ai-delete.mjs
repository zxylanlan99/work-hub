// StudyMind — AI 聊天页「对话列表删除」点击式 E2E 回归 (mock 模式, 无需真实 CloudBase)
// 强制 mock: 拦截 cloudbase.full.js 使其加载失败 → cloudbase-mock.js 保留 localStorage Mock SDK
import { chromium } from 'playwright';
import fs from 'fs';

const CHROMIUM = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.env.QA_BASE || 'http://localhost:8090/';
const OUT = '/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1/qa-results';
fs.mkdirSync(OUT, { recursive: true });

const consoleErrors = [], pageErrors = [], dialogs = [];
let dialogAction = 'accept'; // 'accept' | 'dismiss' — 由 dialog 事件处理器读取

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const proxy = process.env.HTTP_PROXY ? { server: process.env.HTTP_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, proxy });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push({ msg: e.message, stack: (e.stack || '').split('\n').slice(0, 3).join(' | ') }));
page.on('dialog', async d => { dialogs.push({ type: d.type(), message: d.message() }); try { if (dialogAction === 'accept') await d.accept(); else await d.dismiss(); } catch (e) {} });
await page.route('**/cloudbase.full.js**', r => r.abort()); // 强制 mock 模式

const results = { meta: { base: BASE, chromium: 'chromium-1228', mockForced: true }, steps: [] };
const step = async (name, fn) => {
  const cp = { c: consoleErrors.length, p: pageErrors.length };
  let r;
  try { r = await fn(); r._status = 'ok'; } catch (e) { r = { _status: 'error', error: e.message }; }
  r._consoleSince = consoleErrors.slice(cp.c);
  r._pageErrorsSince = pageErrors.slice(cp.p);
  results.steps.push({ name, ...r });
  console.log('STEP', name, '=>', r._status, r.note || '', r.error || '');
  return r;
};
const nav = async p => { await page.evaluate(pg => window.navigateTo(pg), p); await page.waitForTimeout(1200); };
const snap = async n => { try { await page.screenshot({ path: OUT + '/' + n + '.png', fullPage: false }); } catch (e) {} };
const countItems = () => page.evaluate(() => document.querySelectorAll('#chat-list .conversation-item').length);
const emptyVisible = () => page.evaluate(() => { const e = document.querySelector('#chat-list .empty-state'); return !!e && /暂无对话/.test(e.textContent); });
const isForcedErr = t => /cloudbase\.full\.js|Failed to load resource/.test(t || '');

// T0 清洁环境 + 进入 AI 聊天页
await step('setup-clean', async () => {
  await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.DB && window.db, { timeout: 20000 });
  await page.evaluate(() => { Object.keys(localStorage).filter(k => k.startsWith('studymind')).forEach(k => localStorage.removeItem(k)); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.DB && window.db, { timeout: 20000 });
  await nav('ai-chat');
  await page.waitForSelector('#chat-list', { timeout: 8000 });
  const empty = await emptyVisible();
  snap('ai-01-initial-empty');
  return { emptyAtStart: empty, note: empty ? 'clean empty state' : 'EMPTY STATE MISSING' };
});

// T1 通过 UI 新建对话
await step('create-via-ui', async () => {
  await page.click('button[onclick="createNewChat()"]');
  await page.waitForTimeout(1200);
  const count = await countItems();
  const hasNew = await page.evaluate(() => [...document.querySelectorAll('#chat-list .conv-title')].some(e => e.textContent.trim() === '新对话'));
  return { count, hasNewTitle: hasNew, note: `count=${count}` };
});

// T2 通过 DB 造两条对话以便删除
await step('seed-via-db', async () => {
  await page.evaluate(async () => { await window.DB.createChat({ title: '测试对话A', agentId: 'general' }); await window.DB.createChat({ title: '测试对话B', agentId: 'general' }); });
  await page.evaluate(() => window.loadChatList());
  await page.waitForTimeout(800);
  const count = await countItems();
  return { count, note: `seeded, count=${count}` };
});

// T3 【核心】删除按钮可见性回归: 默认 opacity 0, hover 后变 1
await step('delete-btn-visibility', async () => {
  const item = page.locator('#chat-list .conversation-item').first();
  const del = item.locator('.conv-delete-btn');
  const before = await del.evaluate(el => getComputedStyle(el).opacity);
  await item.hover();
  await page.waitForTimeout(300);
  const after = await del.evaluate(el => getComputedStyle(el).opacity);
  snap('ai-02-hover-deletebtn');
  return { before, after, fixEffective: before === '0' && after === '1', note: `opacity ${before} -> ${after}` };
});

// T4 完整删除流程 (accept confirm)
await step('full-delete-flow', async () => {
  dialogAction = 'accept';
  const before = await countItems();
  const item = page.locator('#chat-list .conversation-item', { has: page.locator('.conv-title', { hasText: '测试对话A' }) });
  await item.hover(); await page.waitForTimeout(200);
  await item.locator('.conv-delete-btn').click();
  await page.waitForTimeout(1200);
  const after = await countItems();
  const stillThere = await page.evaluate(() => [...document.querySelectorAll('#chat-list .conv-title')].some(e => e.textContent.trim() === '测试对话A'));
  return { before, after, removed: !stillThere, note: `count ${before}->${after}, A removed=${!stillThere}` };
});

// T5 删除当前选中对话 → 右侧消息区清空, 标题回到「AI助手」
await step('delete-selected-clears-pane', async () => {
  dialogAction = 'accept';
  const item = page.locator('#chat-list .conversation-item', { has: page.locator('.conv-title', { hasText: '测试对话B' }) });
  await item.click();
  await page.waitForTimeout(800);
  const titleAfterSelect = await page.evaluate(() => document.getElementById('chat-title').textContent.trim());
  await item.hover(); await page.waitForTimeout(200);
  await item.locator('.conv-delete-btn').click();
  await page.waitForTimeout(1200);
  const paneTitle = await page.evaluate(() => document.getElementById('chat-title').textContent.trim());
  const paneCleared = await page.evaluate(() => document.getElementById('chat-messages').children.length === 0);
  const remaining = await countItems();
  return { titleAfterSelect, paneTitle, paneCleared, remaining, note: `selected='${titleAfterSelect}', afterDelete pane='${paneTitle}', cleared=${paneCleared}` };
});

// T6 取消 confirm (dismiss) → 对话保留
await step('cancel-dismiss-keeps', async () => {
  dialogAction = 'dismiss';
  const before = await countItems();
  const item = page.locator('#chat-list .conversation-item').first();
  await item.hover(); await page.waitForTimeout(200);
  await item.locator('.conv-delete-btn').click();
  await page.waitForTimeout(800);
  const after = await countItems();
  const confirmFired = dialogs.some(d => d.type === 'confirm');
  return { before, after, kept: after === before, confirmFired, note: `count ${before}->${after}, kept=${after === before}` };
});

// T7 删除最后一条 → 空状态
await step('delete-last-empty-state', async () => {
  dialogAction = 'accept';
  let guard = 0;
  while ((await countItems()) > 0 && guard < 10) {
    const item = page.locator('#chat-list .conversation-item').first();
    await item.hover(); await page.waitForTimeout(150);
    await item.locator('.conv-delete-btn').click();
    await page.waitForTimeout(900);
    guard++;
  }
  const empty = await emptyVisible();
  const count = await countItems();
  snap('ai-03-empty-after-delete');
  return { count, empty, note: `count=${count}, emptyState=${empty}` };
});

// T8 触屏设备 @media(hover:none) 删除按钮始终可见
let touchResult = { skipped: true };
try {
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, proxy });
  const tpage = await tctx.newPage();
  await tpage.route('**/cloudbase.full.js**', r => r.abort());
  const tErr = []; tpage.on('pageerror', e => tErr.push(e.message));
  await tpage.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
  await tpage.waitForFunction(() => window.DB && window.db, { timeout: 20000 });
  await tpage.evaluate(() => window.DB.createChat({ title: '触屏对话', agentId: 'general' }));
  await tpage.evaluate(() => window.navigateTo('ai-chat'));
  await tpage.waitForTimeout(1500);
  const hoverNone = await tpage.evaluate(() => matchMedia('(hover: none)').matches);
  const opacityNoHover = await tpage.evaluate(() => { const b = document.querySelector('#chat-list .conv-delete-btn'); return b ? getComputedStyle(b).opacity : 'NOBTN'; });
  touchResult = { hoverNone, opacityNoHover, alwaysVisible: hoverNone && opacityNoHover === '1', pageErrors: tErr };
  await tctx.close();
} catch (e) { touchResult = { error: e.message }; }
results.touch = touchResult;
console.log('TOUCH', JSON.stringify(touchResult));

// T9 预发布冒烟: 主要页面无白屏
await step('prerelease-smoke', async () => {
  const pages = ['home', 'plan', 'news', 'knowledge', 'review', 'output', 'settings'];
  const white = [];
  const pErrBefore = pageErrors.length;
  for (const p of pages) {
    await nav(p);
    const childCount = await page.evaluate(() => document.getElementById('content-container').children.length);
    if (childCount === 0) white.push(p);
  }
  const newErrs = pageErrors.slice(pErrBefore).map(e => e.msg);
  return { visited: pages.length, whiteScreens: white, newPageErrors: newErrs, note: white.length ? 'WHITE:' + white.join(',') : 'no white screens' };
});

// 汇总判定
const get = n => (results.steps.find(s => s.name === n) || {});
const sm = get('prerelease-smoke') || {};
const sel = get('delete-selected-clears-pane') || {};
const canc = get('cancel-dismiss-keeps') || {};
const s = {
  visibility: get('delete-btn-visibility') && get('delete-btn-visibility').fixEffective,
  fullDelete: get('full-delete-flow') && get('full-delete-flow').removed,
  paneClear: sel.paneCleared && sel.paneTitle === 'AI助手',
  cancelKeeps: canc.kept && canc.confirmFired,
  emptyState: get('delete-last-empty-state') && get('delete-last-empty-state').empty,
  noPageErrors: pageErrors.filter(e => !isForcedErr(e.msg)).length === 0,
  touchVisible: touchResult.alwaysVisible,
  noWhite: (sm.whiteScreens || []).length === 0
};
// 过滤掉「故意拦截 cloudbase.full.js」造成的网络错误
const jsPageErrors = pageErrors.filter(e => !isForcedErr(e.msg));
const jsConsoleErrors = consoleErrors.filter(t => !isForcedErr(t));
results.verdict = {
  coreFix: s.visibility, fullDelete: s.fullDelete, paneClear: s.paneClear,
  cancelKeeps: s.cancelKeeps, emptyState: s.emptyState, touchVisible: s.touchVisible,
  noPageErrors: s.noPageErrors, noWhite: s.noWhite,
  jsPageErrors, jsConsoleErrors,
  go: s.visibility && s.fullDelete && s.paneClear && s.cancelKeeps && s.emptyState && s.noPageErrors
};
results.meta.endedAt = new Date().toISOString();
results.pageErrors = pageErrors;
results.consoleErrors = consoleErrors;
results.dialogs = dialogs;
fs.writeFileSync(OUT + '/ai-delete-qa.json', JSON.stringify(results, null, 2));
console.log('VERDICT', JSON.stringify(results.verdict, null, 2));
await browser.close();
console.log('DONE');
