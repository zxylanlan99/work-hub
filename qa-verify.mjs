// StudyMind 上线前前端真实浏览器点击验证 — 4 个功能点
// 本地静态服务 (http://localhost:8090) → 真实 CloudBase 后端 (匿名登录)
// 驱动真实 chromium 点击、截图、捕获 console/网络/弹窗
import { chromium } from 'playwright';
import fs from 'fs';

const CHROMIUM = '/Users/zouxiaoyong/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const BASE = 'http://localhost:8090/';
const OUT = '/Users/zouxiaoyong/Desktop/学习资料/StudyMind_TRAE_V1.1/qa-results';
fs.mkdirSync(OUT, { recursive: true });

const isBackend = u => /tcloudbase|tencentcloudapi|cloudbase|tcb-api|tcb\.|myqcloud|service\.tcloudbase|api\.tcb/i.test(u);

const consoleMsgs = [], pageErrors = [], backendReqs = [], backendResp = [], dialogs = [];

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  proxy: PROXY ? { server: PROXY, bypass: 'localhost,127.0.0.1' } : undefined
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => pageErrors.push({ msg: e.message, stack: (e.stack||'').split('\n').slice(0,3).join(' | ') }));
page.on('request', r => { if (isBackend(r.url())) backendReqs.push({ url: r.url(), method: r.method() }); });
page.on('response', async r => {
  const u = r.url();
  if (isBackend(u)) {
    let body = null;
    try { const b = await r.body(); body = b.toString('utf8').slice(0, 4000); } catch (e) { body = '(body unreadable)'; }
    backendResp.push({ url: u, status: r.status(), body });
  }
});
// 安全处理弹窗：记录类型+内容，全部 dismiss（避免真实写入/删除）
page.on('dialog', async d => {
  dialogs.push({ type: d.type(), message: d.message() });
  try { await d.dismiss(); } catch (e) {}
});

const report = {
  meta: { base: BASE, chromium: 'chromium-1228', proxy: PROXY, startedAt: new Date().toISOString() },
  cloudbase: null,
  backendConnectivity: null,
  vp1: {}, vp2: {}, vp3: {}, vp4: {},
  console: consoleMsgs, pageErrors, backendResp, dialogs
};
const save = () => fs.writeFileSync(OUT + '/verify-report.json', JSON.stringify(report, null, 2));
const snap = async name => { try { await page.screenshot({ path: OUT + '/' + name + '.png', fullPage: false }); } catch (e) {} };
const wait = ms => page.waitForTimeout(ms);
const go = async (pageId, settle = 3000) => { await page.evaluate(p => window.navigateTo(p), pageId); await wait(settle); };

// 1) 打开首页，等待 CloudBase 匿名登录 + DB 初始化
try {
  await page.goto(BASE + 'index.html', { waitUntil: 'domcontentloaded' });
} catch (e) { console.log('GOTO ERROR', e.message); }
await wait(7000); // 等待 SDK + 匿名登录

report.cloudbase = await page.evaluate(() => ({
  hasCloudbaseSDK: !!window.cloudbase,
  hasDB: !!window.DB,
  hasApp: !!window.app,
  hasRawDb: !!window.db,
  dbInitType: window.DB ? (typeof window.DB.init) : 'n/a'
}));
console.log('CLOUDBASE', JSON.stringify(report.cloudbase));
await snap('01-initial-home');

// 后端连通性：检查是否真正打到了 CloudBase（非 mock）
report.backendConnectivity = {
  backendRequestCount: backendReqs.length,
  sampleUrls: backendReqs.slice(0, 5).map(r => r.url.slice(0, 120)),
  responses: backendResp.slice(0, 8).map(r => ({ status: r.status, url: r.url.slice(0, 120) }))
};
console.log('BACKEND REQS', backendReqs.length);

// ============ 验证点 1：知识库「分类目录」编辑/删除 ============
try {
  await go('knowledge', 4000);
  const treeState = await page.evaluate(() => {
    const tree = document.querySelector('#category-tree, .category-tree, [data-category-tree]');
    const editBtns = [...document.querySelectorAll('.cat-edit-btn')];
    const delBtns = [...document.querySelectorAll('.cat-del-btn')];
    const treeText = tree ? tree.innerText.slice(0, 400) : (document.querySelector('.category-panel') ? document.querySelector('.category-panel').innerText.slice(0,400) : 'NO TREE CONTAINER');
    return {
      editBtnCount: editBtns.length,
      delBtnCount: delBtns.length,
      hasUncategorizedOnly: /分类加载失败|暂无分类/.test(document.body.innerText),
      treeText,
      firstEditOnclick: editBtns[0] ? editBtns[0].getAttribute('onclick') : null,
      firstDelOnclick: delBtns[0] ? delBtns[0].getAttribute('onclick') : null
    };
  });
  await snap('02-knowledge-category-tree');

  // 点击第一个分类的「编辑」按钮，验证是否弹出编辑交互（prompt）
  let editDialog = null;
  if (treeState.editBtnCount > 0) {
    await page.evaluate(() => document.querySelector('.cat-edit-btn').click());
    await wait(800);
    editDialog = dialogs.filter(d => d.type === 'prompt' || d.type === 'confirm').slice(-1)[0] || null;
  }
  // 点击第一个分类的「删除」按钮，验证是否弹出二次确认（confirm）
  let delDialog = null;
  if (treeState.delBtnCount > 0) {
    await page.evaluate(() => document.querySelector('.cat-del-btn').click());
    await wait(800);
    delDialog = dialogs.filter(d => d.type === 'confirm').slice(-1)[0] || null;
  }

  report.vp1 = {
    name: '知识库「分类目录」支持编辑、删除',
    editBtnCount: treeState.editBtnCount,
    delBtnCount: treeState.delBtnCount,
    treeLoaded: !treeState.hasUncategorizedOnly && (treeState.editBtnCount > 0 || treeState.delBtnCount > 0),
    editDialogFired: !!editDialog,
    editDialogMessage: editDialog ? editDialog.message : null,
    deleteDialogFired: !!delDialog,
    deleteDialogMessage: delDialog ? delDialog.message : null,
    firstEditOnclick: treeState.firstEditOnclick,
    firstDelOnclick: treeState.firstDelOnclick,
    treeTextSnippet: treeState.treeText
  };
  // 判定
  if (treeState.editBtnCount > 0 && treeState.delBtnCount > 0 && editDialog && delDialog) {
    report.vp1.verdict = '✅ 通过';
  } else if (treeState.editBtnCount > 0 && treeState.delBtnCount > 0) {
    report.vp1.verdict = '⚠️ 部分验证（按钮存在但弹窗未捕获）';
  } else {
    report.vp1.verdict = '❌ 不通过 / 无法验证（分类树未渲染编辑删除入口）';
  }
} catch (e) {
  report.vp1 = { verdict: '⚠️ 无法验证（脚本异常）', error: e.message };
}
console.log('VP1', JSON.stringify(report.vp1.verdict));
save();

// ============ 验证点 2：知识库「AI推荐清单」已移除 ============
try {
  // 在知识库页整体检查（含滚动）
  await go('knowledge', 2500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(500);
  const aiCheck = await page.evaluate(() => {
    const txt = document.body.innerText;
    const html = document.body.innerHTML;
    const hits = [];
    ['AI推荐清单','AI 推荐','AI推荐','推荐清单','智能推荐'].forEach(k => {
      if (txt.includes(k) || html.includes(k)) hits.push(k);
    });
    return { anyAIMatch: hits.length > 0, matchedKeywords: hits, bodyTextLen: txt.length };
  });
  await snap('03-knowledge-no-ai-recommend');
  report.vp2 = {
    name: '知识库「AI推荐清单」已移除',
    anyAIMatch: aiCheck.anyAIMatch,
    matchedKeywords: aiCheck.matchedKeywords,
    verdict: aiCheck.anyAIMatch ? '❌ 不通过（页面仍存在 AI 推荐相关字样）' : '✅ 通过（知识库页面无任何 AI推荐清单字样）'
  };
} catch (e) {
  report.vp2 = { verdict: '⚠️ 无法验证（脚本异常）', error: e.message };
}
console.log('VP2', JSON.stringify(report.vp2.verdict));
save();

// ============ 验证点 3：资讯「知识源管理」forEach bug ============
try {
  await go('news', 3500);
  // 注入 getRssSources 拦截，捕获 news 代码实际收到的 res.data 结构
  await page.evaluate(() => {
    window.__rssCapture = null;
    if (window.DB && typeof window.DB.getRssSources === 'function') {
      const orig = window.DB.getRssSources.bind(window.DB);
      window.DB.getRssSources = async function (...a) {
        const r = await orig(...a);
        let sample = null;
        try { sample = (Array.isArray(r.data) && r.data[0]) ? JSON.parse(JSON.stringify(r.data[0])) : null; } catch (e) {}
        window.__rssCapture = {
          success: r.success,
          dataType: typeof r.data,
          isArray: Array.isArray(r.data),
          length: Array.isArray(r.data) ? r.data.length : 'n/a',
          sample
        };
        return r;
      };
    }
  });
  // 点击「📡 RSS源管理」按钮（news.html:43）
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const target = btns.find(b => (b.getAttribute('onclick') || '').includes("newsRssManageModal"));
    if (target) { target.click(); return true; }
    return false;
  });
  await wait(3500);
  const rssState = await page.evaluate(() => {
    const c = document.getElementById('rssSourceList');
    const modal = document.getElementById('newsRssManageModal');
    const modalVisible = modal ? getComputedStyle(modal).display !== 'none' && !modal.classList.contains('hidden') : false;
    return {
      buttonClicked: true,
      modalExists: !!modal,
      modalVisible,
      containerText: c ? c.innerText.slice(0, 600) : 'NO CONTAINER',
      capture: window.__rssCapture
    };
  });
  await snap('04-news-rss-management');
  // 捕获 console 中是否有 forEach / 加载失败 报错
  const errLogs = consoleMsgs.filter(m => /forEach is not a function|加载失败|res\.data/.test(m.text)).map(m => m.text);
  report.vp3 = {
    name: '资讯「知识源管理」res.data.forEach is not a function',
    rssButtonClicked: clicked,
    modalVisible: rssState.modalVisible,
    containerText: rssState.containerText,
    resDataCapture: rssState.capture,
    forEachErrorInConsole: errLogs,
    rawBackendRssResp: backendResp.filter(r => /rss_sources/i.test(r.url)).slice(0, 3).map(r => ({ status: r.status, bodySnippet: r.body ? r.body.slice(0, 1200) : null }))
  };
  // 判定
  const cap = rssState.capture;
  const hasForEachErr = errLogs.length > 0;
  if (hasForEachErr) {
    report.vp3.verdict = '❌ 不通过（复现 forEach is not a function）';
  } else if (cap && cap.isArray) {
    report.vp3.verdict = '✅ 通过 / 未复现（res.data 为数组，无 forEach 报错）';
  } else if (cap && !cap.isArray) {
    report.vp3.verdict = '❌ 不通过（res.data 非数组，结构=' + cap.dataType + '）';
  } else {
    report.vp3.verdict = '⚠️ 无法验证（未捕获到 getRssSources 返回）';
  }
} catch (e) {
  report.vp3 = { verdict: '⚠️ 无法验证（脚本异常）', error: e.message };
}
console.log('VP3', JSON.stringify(report.vp3.verdict));
save();

// ============ 验证点 4：今日暖身「快问快答」数据来源 ============
try {
  await go('home', 4500);
  const quizState = await page.evaluate(async () => {
    const qEl = document.getElementById('quiz-question');
    const displayed = qEl ? qEl.textContent.trim() : null;
    // 直接调用 DB.getReviewQueue 取真实复习卡片
    let rq = null, rqErr = null;
    try {
      const res = await window.DB.getReviewQueue();
      rq = { success: res.success, dataType: typeof res.data, isArray: Array.isArray(res.data), length: Array.isArray(res.data) ? res.data.length : 'n/a', firstQuestion: (Array.isArray(res.data) && res.data[0]) ? (res.data[0].question || null) : null, firstCardId: (Array.isArray(res.data) && res.data[0]) ? (res.data[0]._id || res.data[0].id) : null };
    } catch (e) { rqErr = e.message; }
    return { displayedQuestion: displayed, reviewQueue: rq, reviewQueueError: rqErr };
  });
  await snap('05-home-quick-ask');
  const dq = quizState.displayedQuestion;
  const rqQ = quizState.reviewQueue ? quizState.reviewQueue.firstQuestion : null;
  const linked = !!(dq && rqQ && dq === rqQ) || !!(dq && quizState.reviewQueue && quizState.reviewQueue.length === 0 && /暂无待复习卡片/.test(dq || ''));
  report.vp4 = {
    name: '今日暖身「快问快答」数据来源',
    displayedQuestion: dq,
    reviewQueueFirstQuestion: rqQ,
    reviewQueue: quizState.reviewQueue,
    reviewQueueError: quizState.reviewQueueError,
    dataLinked: linked,
    verdict: linked
      ? '✅ 通过（快问快答题面与 DB.getReviewQueue 首张复习卡片一致，数据来自复习计划）'
      : (quizState.reviewQueueError
          ? '⚠️ 无法验证（DB.getReviewQueue 调用异常：' + quizState.reviewQueueError + '）'
          : '❌ 不通过（快问快答题面与复习计划数据不一致/疑似写死）')
  };
} catch (e) {
  report.vp4 = { verdict: '⚠️ 无法验证（脚本异常）', error: e.message };
}
console.log('VP4', JSON.stringify(report.vp4.verdict));
save();

// 收尾
report.summary = {
  vp1: report.vp1.verdict,
  vp2: report.vp2.verdict,
  vp3: report.vp3.verdict,
  vp4: report.vp4.verdict,
  backendRequests: backendReqs.length,
  consoleErrors: consoleMsgs.filter(m => m.type === 'error').length,
  pageErrors: pageErrors.length
};
save();
console.log('DONE. Report ->', OUT + '/verify-report.json');

// 额外：把关键 console 错误单独列出
report.consoleErrorsOnly = consoleMsgs.filter(m => m.type === 'error').map(m => m.text);
save();

await browser.close();
