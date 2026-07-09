// Phase 1: Environment verification + per-page structure exploration.
// Uses the installed Playwright engine (chromium-1228) — equivalent to the
// playwright-cli skill's open/goto/snapshot/console/network semantics.
import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'https://studymind-d7g06nv0de98a1f1b.tcloudbaseapp.com/';
const CHROMIUM = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = '/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1/qa-results';
fs.mkdirSync(OUT, { recursive: true });

const consoleMsgs = [];
const pageErrors = [];
const failedReqs = [];
const responses = [];

function isBackend(u) {
  return /tcloudbase|tencentcloudapi|cloudbase|tcb-api|tcb\.|myqcloud|service\.tcloudbase/.test(u);
}
function isLocalBackend(u) { return /localhost:8765/.test(u); }

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text(), loc: m.location() ? (m.location().url + ':' + m.location().lineNumber) : '' }));
page.on('pageerror', e => pageErrors.push({ msg: e.message, stack: (e.stack || '').split('\n').slice(0, 3).join(' | ') }));
page.on('requestfailed', r => failedReqs.push({ url: r.url(), err: r.failure() ? r.failure().errorText : '?' }));
page.on('response', r => { const u = r.url(); if (isBackend(u) || isLocalBackend(u) || r.status() >= 400) responses.push({ url: u, status: r.status(), backend: isBackend(u), local: isLocalBackend(u) }); });

const report = { env: {}, pages: {}, mockCheck: {}, meta: { url: URL, startedAt: new Date().toISOString() } };

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // wait for app + CloudBase init
  await page.waitForFunction(() => window.DB && (window.db || window.app) && window.TCB, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  report.env = await page.evaluate(() => {
    const ls = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k) ? (k === 'studymind_db' ? '<NON-EMPTY>' : '<present>') : null; } } catch (e) {}
    return {
      hasTCB: typeof window.TCB,
      tcbHasInit: !!(window.TCB && typeof window.TCB.init === 'function'),
      cloudbaseIsTCB: window.cloudbase === window.TCB,
      cloudbaseType: typeof window.cloudbase,
      sdkVersion: (window.__CLOUDBASE_SDK_VERSION__ !== undefined ? window.__CLOUDBASE_SDK_VERSION__ : null),
      tcbVersion: (window.TCB && (window.TCB.__version__ || window.TCB.version)) || null,
      hasMockData: typeof window.mockData,
      mockDataKeys: window.mockData ? Object.keys(window.mockData) : [],
      cloudbaseInited: !!window.db,
      appInited: !!window.app,
      anonymousUid: (window.app && window.app.auth && window.app.auth().getUserInfo) ? 'n/a' : (window.app ? 'app-present' : 'none'),
      localStorageKeys: ls,
      localStorageStudymindDb: localStorage.getItem('studymind_db'),
      dbFunctions: window.DB ? Object.getOwnPropertyNames(window.DB).filter(n => typeof window.DB[n] === 'function').slice(0, 60) : []
    };
  });

  report.mockCheck.consoleHasMock = consoleMsgs.filter(m => /\[MockDB\]|Mock SDK|Mock:/.test(m.text)).map(m => ({ type: m.type, text: m.text }));
  report.mockCheck.localStorageStudymindDbWritten = report.env.localStorageStudymindDb != null;

  const pages = ['home', 'plan', 'news', 'knowledge', 'ai-chat', 'review', 'output', 'settings'];
  for (const p of pages) {
    await page.evaluate((pg) => window.navigateTo(pg), p);
    await page.waitForTimeout(1600);
    const info = await page.evaluate(() => {
      const out = { title: document.getElementById('page-title') ? document.getElementById('page-title').textContent : '', visibleText: '', buttons: [], onclicks: [], modals: [], inputs: [], toasts: [] };
      // visible text of content container
      const cc = document.getElementById('content-container');
      out.visibleText = cc ? cc.innerText.slice(0, 1200) : '';
      // buttons
      document.querySelectorAll('button').forEach(b => { if (b.offsetParent !== null || b.textContent.trim()) out.buttons.push({ text: b.textContent.trim().slice(0, 40), id: b.id, cls: b.className }); });
      // onclick elements
      document.querySelectorAll('[onclick]').forEach(e => { const t = (e.textContent || '').trim().slice(0, 30); const oc = e.getAttribute('onclick') || ''; if (oc.length < 200) out.onclicks.push({ tag: e.tagName, text: t, onclick: oc.slice(0, 120) }); });
      // modals
      document.querySelectorAll('.modal-overlay').forEach(m => out.modals.push({ id: m.id, hasShow: m.classList.contains('show') }));
      // inputs in content
      document.querySelectorAll('#content-container input, #content-container textarea, #content-container select').forEach(i => out.inputs.push({ id: i.id, name: i.name, ph: i.placeholder || '', type: i.type }));
      // toasts
      document.querySelectorAll('.toast').forEach(t => out.toasts.push(t.textContent.trim().slice(0, 80)));
      return out;
    });
    report.pages[p] = info;
  }

  // capture console/network evidence collected so far
  report.meta.consoleCount = consoleMsgs.length;
  report.meta.consoleErrors = consoleMsgs.filter(m => m.type === 'error').map(m => m.text).slice(0, 40);
  report.meta.pageErrors = pageErrors;
  report.meta.failedReqs = failedReqs;
  report.meta.backendResponses = responses;

} catch (e) {
  report.fatal = { msg: e.message, stack: (e.stack || '').split('\n').slice(0, 5).join(' | ') };
} finally {
  fs.writeFileSync(OUT + '/explore-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
console.log('DONE. Wrote', OUT + '/explore-report.json');
