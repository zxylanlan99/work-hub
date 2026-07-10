// StudyMind 验证点1（分类编辑/删除）与 验证点4（快问快答数据来源）深度验证
// 通过真实浏览器点击 + 创建临时数据验证，验证后清理，不污染真实数据
import { chromium } from 'playwright';
import fs from 'fs';

const CHROMIUM = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const BASE = 'http://localhost:8090/';
const OUT = '/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1/qa-results';
fs.mkdirSync(OUT, { recursive: true });

const consoleMsgs = [], dialogs = [], pageErrors = [];
const browser = await chromium.launch({
  headless: true, executablePath: CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  proxy: PROXY ? { server: PROXY, bypass: 'localhost,127.0.0.1' } : undefined
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => pageErrors.push({ msg: e.message }));
page.on('dialog', async d => { dialogs.push({ type: d.type(), message: d.message() }); try { await d.dismiss(); } catch (e) {} });

const wait = ms => page.waitForTimeout(ms);
const go = async (p, settle = 3500) => { await page.evaluate(x => window.navigateTo(x), p); await wait(settle); };
const snap = async n => { try { await page.screenshot({ path: OUT + '/' + n + '.png' }); } catch (e) {} };
const report = { meta: { base: BASE, startedAt: new Date().toISOString() }, vp1: {}, vp4: {} };
const save = () => fs.writeFileSync(OUT + '/verify-report2.json', JSON.stringify(report, null, 2));

await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
await wait(7000);
await snap('v2-01-home');

// ================= 验证点 1 =================
await go('knowledge', 4000);
const catState0 = await page.evaluate(async () => {
  try { const r = await window.DB.getCategories(); return { success: r.success, count: Array.isArray(r.data) ? r.data.length : 0, err: r.error || null }; }
  catch (e) { return { success: false, err: e.message }; }
});
await snap('v2-02-knowledge-before');

let createdCatId = null;
try {
  // 打开「新建分类」弹窗（点击 + 新建 按钮）
  await page.evaluate(() => { const el = [...document.querySelectorAll('[onclick*="modal-new-category"]')][0]; if (el) el.click(); });
  await wait(600);
  const modalOpen = await page.evaluate(() => { const m = document.getElementById('modal-new-category'); return m ? getComputedStyle(m).display !== 'none' : false; });
  await snap('v2-03-newcat-modal');

  const ts = 'QA_临时分类_' + Date.now();
  await page.evaluate(name => { document.getElementById('cat-name').value = name; }, ts);
  // 点击「创建」
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('onclick') || '') === 'createCategory()'); if (b) b.click(); });
  await wait(2500);
  await snap('v2-04-after-create');

  const afterCreate = await page.evaluate(async (name) => {
    const editBtns = [...document.querySelectorAll('.cat-edit-btn')];
    const delBtns = [...document.querySelectorAll('.cat-del-btn')];
    const panel = document.querySelector('.category-panel');
    const treeText = panel ? panel.innerText : '';
    let newCatId = null;
    try { const cats = await window.DB.getCategories(); if (Array.isArray(cats.data)) { const f = cats.data.find(c => c.name && c.name.includes('QA_临时')); if (f) newCatId = f._id || f.id; } } catch (e) {}
    return {
      editBtnCount: editBtns.length, delBtnCount: delBtns.length,
      treeHasName: treeText.includes(name), newCatId,
      firstEditOnclick: editBtns[0] ? editBtns[0].getAttribute('onclick') : null,
      firstDelOnclick: delBtns[0] ? delBtns[0].getAttribute('onclick') : null
    };
  }, ts);
  createdCatId = afterCreate.newCatId;

  // 点击编辑 → 应弹出 prompt 对话框
  let editDialog = null;
  if (afterCreate.editBtnCount > 0) {
    await page.evaluate(() => document.querySelector('.cat-edit-btn').click());
    await wait(700);
    editDialog = dialogs.filter(d => d.type === 'prompt').slice(-1)[0] || null;
  }
  // 点击删除 → 应弹出 confirm 二次确认
  let delDialog = null;
  if (afterCreate.delBtnCount > 0) {
    await page.evaluate(() => document.querySelector('.cat-del-btn').click());
    await wait(700);
    delDialog = dialogs.filter(d => d.type === 'confirm').slice(-1)[0] || null;
  }
  await snap('v2-05-after-edit-del-click');

  report.vp1 = {
    name: '知识库「分类目录」支持编辑、删除',
    categoriesExistedInitially: catState0,
    modalOpened: modalOpen,
    afterCreateEditBtnCount: afterCreate.editBtnCount,
    afterCreateDelBtnCount: afterCreate.delBtnCount,
    treeShowsNewCategory: afterCreate.treeHasName,
    newCategoryEditOnclick: afterCreate.firstEditOnclick,
    newCategoryDelOnclick: afterCreate.firstDelOnclick,
    editDialogFired: !!editDialog,
    editDialogMessage: editDialog ? editDialog.message : null,
    deleteDialogFired: !!delDialog,
    deleteDialogMessage: delDialog ? delDialog.message : null,
    createdCatId,
    verdict: (afterCreate.editBtnCount > 0 && afterCreate.delBtnCount > 0 && afterCreate.treeHasName && editDialog && delDialog)
      ? '✅ 通过'
      : '⚠️ 部分验证（编辑/删除入口或弹窗未完全确认）'
  };
} catch (e) { report.vp1 = { verdict: '⚠️ 脚本异常', error: e.message }; }
save();

// 清理临时分类
if (createdCatId) {
  try { const r = await page.evaluate(async id => await window.DB.deleteCategory(id), createdCatId); report.vp1.cleanup = { deletedId: createdCatId, result: r }; }
  catch (e) { report.vp1.cleanupError = e.message; }
  await wait(1500);
}
save();

// ================= 验证点 4（数据联动）=================
let probeId = null;
try {
  const ts = 'QA_LINKAGE_PROBE_' + Date.now();
  const created = await page.evaluate(async q => {
    const past = new Date(Date.now() - 86400000);
    const r = await window.DB.createReviewCard({ question: q, answer: 'QA探针答案', nextReview: past });
    let id = null;
    try { id = (r && r.data) ? (r.data._id || r.data.id) : (r && r._id ? r._id : (r && r.id ? r.id : null)); } catch (e) {}
    return { raw: JSON.parse(JSON.stringify(r)), id };
  }, ts);
  probeId = created.id;
  await wait(1500);
  await go('home', 5000);
  await snap('v2-06-home-with-probe');
  const quiz = await page.evaluate(async q => {
    const qEl = document.getElementById('quiz-question');
    const displayed = qEl ? qEl.textContent.trim() : null;
    let rq = null, rqErr = null;
    try { const res = await window.DB.getReviewQueue(); rq = { length: Array.isArray(res.data) ? res.data.length : 0, firstQuestion: (Array.isArray(res.data) && res.data[0]) ? res.data[0].question : null }; }
    catch (e) { rqErr = e.message; }
    return { displayed, rq, rqErr };
  }, ts);
  await snap('v2-07-quiz-probe');
  report.vp4 = {
    name: '今日暖身「快问快答」数据来源',
    probeQuestion: ts,
    createdCardId: probeId,
    createdCardRaw: created.raw,
    displayedQuizQuestion: quiz.displayed,
    reviewQueue: quiz.rq,
    reviewQueueError: quiz.rqErr,
    exactMatch: quiz.displayed === ts,
    verdict: (quiz.displayed === ts)
      ? '✅ 通过（快问快答题面==临时复习卡片题面，证实来自复习计划且数据联动）'
      : '❌ 不通过（快问快答题面与复习卡片不一致/疑似写死）'
  };
} catch (e) { report.vp4 = { verdict: '⚠️ 脚本异常', error: e.message }; }
save();

// 清理临时复习卡片
if (probeId) {
  try { const r = await page.evaluate(async id => await window.DB._collection('review_cards').doc(id).remove(), probeId); report.vp4.cleanup = { deletedId: probeId, result: JSON.parse(JSON.stringify(r)) }; }
  catch (e) { report.vp4.cleanupError = e.message; }
  await wait(1200);
}
save();

report.summary = {
  vp1: report.vp1.verdict, vp4: report.vp4.verdict,
  consoleErrors: consoleMsgs.filter(m => m.type === 'error').length,
  pageErrors: pageErrors.length,
  dialogsCaptured: dialogs
};
save();
console.log('VP1 =>', report.vp1.verdict);
console.log('VP4 =>', report.vp4.verdict);
await browser.close();
