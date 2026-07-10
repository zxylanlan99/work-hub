// StudyMind — AI 聊天页「对话删除功能加固」点击式 E2E 回归 v2 (mock 模式, 无需真实 CloudBase)
// 强制 mock: 拦截 cloudbase.full.js → 保留 localStorage Mock SDK
// 覆盖本次 4 项修复: 自绘确认弹层 / 5秒撤销窗口 / createChat 补写 agentId / 删除当前对话清理持久化
// 用例: A 弹层文案+获焦 | B 删除+撤销toast | C 撤销恢复(DB未真删) | D 取消不删 | E 超时真删
//       F 删除当前对话+持久化清理 | G agentId落库 | H 空状态 | I 触屏可达 | J 零报错 | K 预发布冒烟
import { chromium } from 'playwright';
import fs from 'fs';

const CHROMIUM = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PROJECT = '/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1';
const OUT = PROJECT + '/qa-results';
fs.mkdirSync(OUT, { recursive: true });
const isForcedErr = t => /cloudbase\.full\.js|Failed to load resource/.test(t || '');

const runSuite = async (base, label) => {
  const consoleErrors = [], pageErrors = [];
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push({ msg: e.message, stack: (e.stack || '').split('\n').slice(0, 3).join(' | ') }));
  page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} }); // 防御: 万一仍有原生 dialog, 避免挂死
  await page.route('**/cloudbase.full.js**', r => r.abort());

  const results = { label, base, steps: [] };
  const step = async (name, fn) => {
    const cp = { c: consoleErrors.length, p: pageErrors.length };
    let r;
    try { r = await fn(); r._status = 'ok'; } catch (e) { r = { _status: 'error', error: e.message }; }
    r._consoleSince = consoleErrors.slice(cp.c);
    r._pageErrorsSince = pageErrors.slice(cp.p);
    results.steps.push({ name, ...r });
    console.log(label, 'STEP', name, '=>', r._status, r.note || '', r.error || '');
    return r;
  };

  const gotoAi = async (clean) => {
    await page.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.DB && window.db, { timeout: 20000 });
    if (clean) {
      await page.evaluate(() => { Object.keys(localStorage).filter(k => k.startsWith('studymind')).forEach(k => localStorage.removeItem(k)); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.DB && window.db, { timeout: 20000 });
    }
    await page.evaluate(() => window.navigateTo('ai-chat'));
    await page.waitForSelector('#chat-list', { timeout: 8000 });
    await page.waitForTimeout(400);
  };
  const convCount = () => page.evaluate(() => document.querySelectorAll('#chat-list .conversation-item').length);
  const convIds = () => page.evaluate(() => (window.chatState?.conversations || []).map(c => c._id || c.id));
  const convTitles = () => page.evaluate(() => (window.chatState?.conversations || []).map(c => c.title));
  const idByTitle = t => page.evaluate(tt => { const c = (window.chatState?.conversations || []).find(x => x.title === tt); return c ? (c._id || c.id) : null; }, t);
  const storageChats = () => page.evaluate(() => { try { const d = JSON.parse(localStorage.getItem('studymind_db') || '{}'); return d.chats || []; } catch (e) { return []; } });
  const storageHas = async id => (await storageChats()).some(c => c._id === id);
  const emptyVisible = () => page.evaluate(() => { const e = document.querySelector('#chat-list .empty-state'); return !!e && /暂无对话/.test(e.textContent); });
  const itemByTitle = t => page.locator('#chat-list .conversation-item', { has: page.locator('.conv-title', { hasText: t }) });
  const openDeleteModal = async t => { const it = itemByTitle(t); await it.hover(); await page.waitForTimeout(200); await it.locator('.conv-delete-btn').click(); await page.waitForSelector('.modal-overlay', { timeout: 4000 }); await page.waitForTimeout(150); };
  const seed = async t => { await page.evaluate(tt => window.DB.createChat({ title: tt, agentId: 'general' }), t); await page.evaluate(() => window.loadChatList()); await page.waitForTimeout(500); };
  const snap = async n => { try { await page.screenshot({ path: OUT + '/' + label + '-' + n + '.png' }); } catch (e) {} };

  // SETUP
  await step('setup', async () => { await gotoAi(true); return { emptyAtStart: await emptyVisible() }; });
  await step('seed', async () => { await seed('对话A'); await seed('对话B'); return { count: await convCount(), ids: await convIds(), note: 'seeded' }; });

  // A 弹层出现与文案 + 取消获焦
  await step('A-modal', async () => {
    await openDeleteModal('对话A');
    const boxText = await page.locator('.modal-box').innerText();
    const title = await page.locator('.modal-title').innerText();
    const msgHasTitle = boxText.includes('对话A');
    const hasDel = await page.locator('.modal-delete').count();
    const hasCancel = await page.locator('.modal-cancel').count();
    const cancelFocused = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('modal-cancel'));
    const msgHas5s = /5 秒|5秒/.test(boxText);
    snap('01-modal');
    await page.locator('.modal-cancel').click();
    await page.waitForTimeout(300);
    const modalGone = await page.locator('.modal-overlay').count() === 0;
    const pass = title === '删除对话' && msgHasTitle && hasDel === 1 && hasCancel === 1 && cancelFocused && msgHas5s && modalGone;
    return { title, msgHasTitle, msgHas5s, hasDel, hasCancel, cancelFocused, modalGoneAfterCancel: modalGone, pass, note: `title=${title} cancelFocused=${cancelFocused}` };
  });

  // B 确认删除 + 撤销 toast 出现
  let delId;
  await step('B-delete-toast', async () => {
    delId = await idByTitle('对话A');
    await openDeleteModal('对话A');
    await page.locator('.modal-delete').click();
    await page.waitForTimeout(1000);
    const toastCount = await page.locator('.undo-toast').count();
    const toastText = toastCount ? await page.locator('.undo-toast').innerText() : '';
    const inConv = (await convIds()).includes(delId);
    const inDom = await itemByTitle('对话A').count();
    snap('02-undo-toast');
    const pass = toastCount === 1 && /撤销/.test(toastText) && !inConv && inDom === 0;
    return { delId, toastCount, toastHasUndo: /撤销/.test(toastText), removedFromConv: !inConv, removedFromDom: inDom === 0, pass, note: `toast=${toastCount} removedConv=${!inConv}` };
  });

  // C 撤销恢复 (DB 未真删)
  await step('C-undo-restore', async () => {
    await page.locator('.undo-toast button').click();
    await page.waitForTimeout(1000);
    const toastGone = await page.locator('.undo-toast').count() === 0;
    const restoredConv = (await convIds()).includes(delId);
    const restoredDom = await itemByTitle('对话A').count() === 1;
    const stillInDb = await storageHas(delId);
    const pass = toastGone && restoredConv && restoredDom && stillInDb;
    return { toastGone, restoredConv, restoredDom, stillInDb, pass, note: `restored=${restoredConv} dbStill=${stillInDb}` };
  });

  // D 取消不删 (Esc)
  await step('D-cancel-keep', async () => {
    const before = await convIds();
    await openDeleteModal('对话B');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const modalGone = await page.locator('.modal-overlay').count() === 0;
    const after = await convIds();
    const toast = await page.locator('.undo-toast').count();
    const kept = after.length === before.length && (await idByTitle('对话B')) !== null;
    const pass = modalGone && toast === 0 && kept;
    return { modalGone, toastCount: toast, kept, pass, note: `kept=${kept} modalGone=${modalGone}` };
  });

  // E 超时真删 (reload 后确认已不存在)
  await step('E-timeout-realdelete', async () => {
    const idB = await idByTitle('对话B');
    await openDeleteModal('对话B');
    await page.locator('.modal-delete').click();
    await page.waitForTimeout(5500);
    const toastGone = await page.locator('.undo-toast').count() === 0;
    await gotoAi(false);
    const inDomAfter = await itemByTitle('对话B').count();
    const inDbAfter = await storageHas(idB);
    const pass = toastGone && inDomAfter === 0 && !inDbAfter;
    return { idB, toastGone, inDomAfter, inDbAfter, pass, note: `toastGone=${toastGone} dbAfter=${inDbAfter}` };
  });

  // F 删除当前对话 + 持久化清理 (刷新后不再恢复)
  await step('F-current-session-clear', async () => {
    await seed('当前对话F');
    const idF = await idByTitle('当前对话F');
    await itemByTitle('当前对话F').click();
    await page.waitForTimeout(400);
    const currentBefore = await page.evaluate(() => window.chatState.currentChatId);
    await page.locator('button[onclick="deleteChatConfirm()"]').click();
    await page.waitForSelector('.modal-overlay', { timeout: 4000 });
    await page.locator('.modal-delete').click();
    await page.waitForTimeout(5500);
    await gotoAi(false);
    const title = await page.evaluate(() => document.getElementById('chat-title').textContent.trim());
    const currentAfter = await page.evaluate(() => window.chatState.currentChatId);
    const fInDb = await storageHas(idF);
    const pass = title === 'AI助手' && !currentAfter && !fInDb;
    return { currentBefore, title, currentAfter, fInDb, pass, note: `title=${title} currentAfter=${currentAfter}` };
  });

  // G agentId 落库
  await step('G-agentId', async () => {
    const agentBefore = await page.evaluate(() => window.chatState.currentAgent);
    await page.click('button[onclick="createNewChat()"]');
    await page.waitForTimeout(1000);
    const newId = await page.evaluate(() => window.chatState.currentChatId);
    const chats = await storageChats();
    const doc = chats.find(c => c._id === newId);
    const hasAgent = !!(doc && Object.prototype.hasOwnProperty.call(doc, 'agentId'));
    const agentVal = doc ? doc.agentId : null;
    const pass = hasAgent && agentVal === agentBefore;
    return { agentBefore, newId, hasAgent, agentVal, pass, note: `agentVal=${agentVal} expected=${agentBefore}` };
  });

  // H 空状态
  await step('H-empty-state', async () => {
    let guard = 0;
    while ((await convCount()) > 0 && guard < 8) {
      const t = (await convTitles())[0];
      await openDeleteModal(t);
      await page.locator('.modal-delete').click();
      await page.waitForTimeout(5500);
      guard++;
    }
    const empty = await emptyVisible();
    const count = await convCount();
    snap('04-empty');
    const pass = count === 0 && empty;
    return { count, empty, pass, note: `count=${count} empty=${empty}` };
  });

  // I 触屏可达
  let touch;
  try {
    const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const tpage = await tctx.newPage();
    const tErr = []; tpage.on('pageerror', e => tErr.push(e.message));
    await tpage.route('**/cloudbase.full.js**', r => r.abort());
    await tpage.goto(base + 'index.html', { waitUntil: 'domcontentloaded' });
    await tpage.waitForFunction(() => window.DB && window.db, { timeout: 20000 });
    await tpage.evaluate(() => window.DB.createChat({ title: '触屏对话', agentId: 'general' }));
    await tpage.evaluate(() => window.navigateTo('ai-chat'));
    await tpage.waitForTimeout(1200);
    const hoverNone = await tpage.evaluate(() => matchMedia('(hover: none)').matches);
    const opacity = await tpage.evaluate(() => { const b = document.querySelector('#chat-list .conv-delete-btn'); return b ? getComputedStyle(b).opacity : 'NOBTN'; });
    snap('03-touch');
    touch = { hoverNone, opacity, alwaysVisible: hoverNone && opacity === '1', pageErrors: tErr };
    await tctx.close();
  } catch (e) { touch = { error: e.message }; }

  // K 预发布冒烟
  await step('K-smoke', async () => {
    const pages = ['home', 'plan', 'news', 'knowledge', 'review', 'output', 'settings'];
    const white = [];
    for (const p of pages) {
      await page.evaluate(pp => window.navigateTo(pp), p);
      await page.waitForTimeout(500);
      const c = await page.evaluate(() => document.getElementById('content-container').children.length);
      if (c === 0) white.push(p);
    }
    snap('05-smoke');
    const pass = white.length === 0;
    return { visited: pages.length, whiteScreens: white, pass, note: white.length ? 'WHITE:' + white.join(',') : 'no white' };
  });

  const jsPageErrors = pageErrors.filter(e => !isForcedErr(e.msg));
  const jsConsoleErrors = consoleErrors.filter(t => !isForcedErr(t));
  results.errors = { pageErrors: pageErrors.length, consoleErrors: consoleErrors.length, jsPageErrors, jsConsoleErrors };
  const g = n => (results.steps.find(s => s.name === n) || {}).pass;
  results.pass = { A: g('A-modal'), B: g('B-delete-toast'), C: g('C-undo-restore'), D: g('D-cancel-keep'), E: g('E-timeout-realdelete'), F: g('F-current-session-clear'), G: g('G-agentId'), H: g('H-empty-state'), I: !!(touch && touch.alwaysVisible), J: jsPageErrors.length === 0 && jsConsoleErrors.length === 0, K: g('K-smoke') };
  results.go = Object.values(results.pass).every(Boolean);
  await browser.close();
  return results;
};

const out = [];
out.push(await runSuite('http://localhost:8090/', 'src'));
out.push(await runSuite('http://localhost:8091/', 'dist'));
const final = { generatedAt: new Date().toISOString(), suites: out };
fs.writeFileSync(OUT + '/ai-delete-qa-v2.json', JSON.stringify(final, null, 2));
console.log('=== V2 SUMMARY ===');
for (const s of out) {
  console.log(s.label, 'GO=', s.go);
  console.log('  PASS', JSON.stringify(s.pass));
  console.log('  ERRORS page=', s.errors.pageErrors, 'console=', s.errors.consoleErrors, 'jsPage=', s.errors.jsPageErrors.length, 'jsConsole=', s.errors.jsConsoleErrors.length);
}
console.log('DONE');
