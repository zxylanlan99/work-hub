import { chromium } from 'playwright';
const CHROMIUM = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const URL = 'http://localhost:8090/';

const consoleMsgs = [];
const backendReqs = [];
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--no-sandbox'],
  proxy: PROXY ? { server: PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const page = await browser.newPage();
page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on('request', r => { const u = r.url(); if (/tcloudbase|tencentcloudapi|cloudbase|tcb-api|tcb\.|myqcloud|service\.tcloudbase|localhost:8765/.test(u)) backendReqs.push({ url: u, method: r.method() }); });
page.on('requestfailed', r => { const u = r.url(); if (/tcloudbase|tencentcloudapi|cloudbase|tcb-api|tcb\.|myqcloud|service\.tcloudbase|localhost:8765/.test(u)) backendReqs.push({ url: u, failed: r.failure() ? r.failure().errorText : '?' }); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => window.DB && (window.db || window.app), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(3000);

const env = await page.evaluate(() => ({
  hasTCB: typeof window.TCB, tcbInit: !!(window.TCB && window.TCB.init), cloudbaseIsTCB: window.cloudbase === window.TCB,
  dbInited: !!window.db, appInited: !!window.app, sdkVer: window.__CLOUDBASE_SDK_VERSION__ ?? null,
  lsStudymind: localStorage.getItem('studymind_db')
}));

let reads = {};
try {
  reads.categories = await page.evaluate(async () => { try { const r = await window.DB.getCategories(); return { success: r.success, count: (r.data||[]).length, err: r.error }; } catch(e){ return { success:false, err: e.message }; } });
} catch(e){ reads.categories = { err: e.message }; }
try {
  reads.goals = await page.evaluate(async () => { try { const r = await window.DB.getGoals(); return { success: r.success, count: (r.data||[]).length, err: r.error }; } catch(e){ return { success:false, err: e.message }; } });
} catch(e){ reads.goals = { err: e.message }; }

console.log('ENV:', JSON.stringify(env));
console.log('READS:', JSON.stringify(reads));
console.log('BACKEND_REQ_COUNT:', backendReqs.length);
console.log('BACKEND_SAMPLE:', JSON.stringify(backendReqs.slice(0, 6), null, 1));
console.log('CONSOLE_MOCK:', JSON.stringify(consoleMsgs.filter(m=>/\[MockDB\]|Mock SDK|Mock:/.test(m.text))));
console.log('CONSOLE_ERRORS:', JSON.stringify(consoleMsgs.filter(m=>m.type==='error').map(m=>m.text).slice(0,15), null, 1));
await browser.close();
