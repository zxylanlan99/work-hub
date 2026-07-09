/**
 * StudyMind 前端页面点击验证（jsdom 真实交互模拟）
 * ---------------------------------------------------------------------------
 * 目标：用 jsdom 加载真实 http://localhost:8080/index.html（含真实 JS），
 *       等待 window.navigateTo 就绪后，模拟点击侧边栏 8 个菜单按钮，验证：
 *         - window.navigateTo 是函数
 *         - 点击后对应 pages/<page>.html 被真实 fetch 加载（page-title 更新）
 *         - 无 jsdomError（JS 运行时错误）
 *       额外：关键按钮接线（news 抓取/录入、plan 新建目标）、二次进入 knowledge
 *             复现 const 重复声明缺陷（P0）。
 *
 * 说明：框架 navigateTo 带 isLoading 并发守卫，快速连点会被丢弃，因此本测试
 *       每次点击后等待页面真正切换完成（page-title 更新）再继续。
 *
 * 前置：已在后台启动 `python3 -m http.server 8080 --directory src`
 * 运行：node tests/unit/qa-ui-click.test.js
 * 依赖：jsdom（已安装）
 */

const { JSDOM, VirtualConsole } = require('jsdom');

const BASE = 'http://localhost:8080';

const PAGES = ['home', 'plan', 'news', 'knowledge', 'ai-chat', 'review', 'output', 'settings'];
const ROUTE_FILE = {
  'home': 'pages/home.html',
  'plan': 'pages/plan.html',
  'news': 'pages/news.html',
  'knowledge': 'pages/knowledge.html',
  'ai-chat': 'pages/ai-chat.html',
  'review': 'pages/review.html',
  'output': 'pages/output.html',
  'settings': 'pages/settings.html'
};
const TITLE_ZH = {
  'home': '首页',
  'plan': '学习计划',
  'news': '资讯',
  'knowledge': '知识库',
  'ai-chat': 'AI对话',
  'review': '复习计划',
  'output': '知识沉淀',
  'settings': '系统设置'
};

/* ---------- 结果收集 ---------- */
const asserts = [];
let failCount = 0;
function assert(name, cond, detail) {
  const pass = !!cond;
  if (!pass) failCount++;
  asserts.push({ name, pass, detail: detail || '' });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
function observe(name, detail) {
  console.log(`[OBS] ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 5000, interval = 30) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let ok = false;
    try { ok = fn(); } catch (e) { /* ignore */ }
    if (ok) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

(async () => {
  const jsdomErrors = [];
  const consoleErrors = [];
  const fetchCount = Object.create(null); // url -> 请求次数

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    jsdomErrors.push(e && e.message ? e.message : String(e));
  });
  vc.on('error', (...args) => {
    consoleErrors.push(args.map(String).join(' '));
  });

  const nodeFetch = globalThis.fetch;

  const fetchPolyfill = async (input, init) => {
    let url = typeof input === 'string' ? input : (input && input.url) || '';
    const abs = new URL(url, BASE + '/').href;
    fetchCount[abs] = (fetchCount[abs] || 0) + 1;
    const res = await nodeFetch(abs, init);
    const body = await res.text();
    return { ok: res.ok, status: res.status, text: async () => body };
  };

  const idxRes = await nodeFetch(BASE + '/index.html');
  const idxHtml = await idxRes.text();

  const dom = new JSDOM(idxHtml, {
    url: BASE + '/index.html',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = fetchPolyfill;
      window.confirm = () => true;
      window.prompt = () => 'test-input';
      window.alert = () => {};
      if (!window.matchMedia) {
        window.matchMedia = () => ({
          matches: false,
          addListener() {}, removeListener() {},
          addEventListener() {}, removeEventListener() {}
        });
      }
    }
  });

  const win = dom.window;
  const doc = win.document;

  /* 点击某菜单并等待页面真正切换完成（page-title 更新）。带重试以规避 isLoading 守卫。 */
  async function gotoPage(page) {
    const navEl = doc.querySelector(`[data-page="${page}"]`);
    if (!navEl) return false;
    const routeUrl = BASE + '/' + ROUTE_FILE[page];
    const before = fetchCount[routeUrl] || 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      navEl.click();
      const switched = await waitFor(() => {
        const titleEl = doc.getElementById('page-title');
        const titleText = titleEl ? titleEl.textContent : '';
        const fetched = (fetchCount[routeUrl] || 0) > before;
        return titleText.includes(TITLE_ZH[page]) || fetched;
      }, 4000);
      if (switched) {
        await sleep(150); // 等 init 渲染
        return true;
      }
    }
    return false;
  }

  /* 1) 框架就绪 */
  const okNav = await waitFor(() => typeof win.navigateTo === 'function', 8000);
  assert('window.navigateTo 已定义为函数（框架加载成功）', okNav);

  /* 2) 依次点击 8 个菜单（充分等待切换完成） */
  for (const page of PAGES) {
    const before = jsdomErrors.length;
    assert(`侧边栏存在 [data-page="${page}"] 按钮`, !!doc.querySelector(`[data-page="${page}"]`));

    const switched = await gotoPage(page);
    const routeUrl = BASE + '/' + ROUTE_FILE[page];
    const fetched = (fetchCount[routeUrl] || 0) > 0;
    const titleEl = doc.getElementById('page-title');
    const titleText = titleEl ? titleEl.textContent : '';
    const titleOk = titleText.includes(TITLE_ZH[page]);
    const container = doc.getElementById('content-container');
    const hasContent = container && container.children.length > 0;
    const newErrors = jsdomErrors.slice(before);

    assert(`[${page}] 点击触发 pages/${ROUTE_FILE[page]} fetch 加载`, fetched && switched, `switched=${switched}`);
    assert(`[${page}] page-title 更新为「${TITLE_ZH[page]}」`, titleOk, `实际="${titleText}"`);
    assert(`[${page}] 内容容器已渲染`, hasContent);
    assert(`[${page}] 点击过程无 JS 运行时错误`, newErrors.length === 0, newErrors.join(' | '));
  }

  /* 3) 关键按钮接线（确认 handler 已绑定且点击不抛未捕获异常；后端不可达允许网络错误）
   *    注意：真实页面按钮多通过 onclick 属性接线且无 id（如 news.html 用
   *    onclick="triggerCrawlNews()"），故支持 id / onclick 子串 / 文本三种定位。 */
  async function clickButton(page, findSpec, label) {
    await gotoPage(page);
    await sleep(250);
    const before = jsdomErrors.length;
    let btn = null;
    if (typeof findSpec === 'string') {
      btn = doc.getElementById(findSpec) ||
        doc.querySelector(`[onclick*="${findSpec}"]`) ||
        [...doc.querySelectorAll('button')].find((b) => b.textContent.includes(findSpec));
    } else if (findSpec && findSpec.onclick) {
      btn = doc.querySelector(`[onclick*="${findSpec.onclick}"]`);
    } else if (findSpec && findSpec.text) {
      btn = [...doc.querySelectorAll('button')].find((b) => b.textContent.includes(findSpec.text));
    }
    assert(`[${page}] 找到按钮（${label}）`, !!btn, btn ? '已定位' : '未找到');
    if (btn) {
      try { btn.click(); } catch (e) { jsdomErrors.push('click ' + label + ': ' + e.message); }
    }
    await sleep(350);
    const newErrors = jsdomErrors.slice(before);
    assert(`[${page}] 点击「${label}」未抛未捕获 JS 错误`, newErrors.length === 0, newErrors.join(' | '));
  }
  // 真实 news.html 抓取按钮：onclick="triggerCrawlNews()"（无 id）；手动录入：onclick="openNewsModal('newsManualModal')"
  await clickButton('news', 'triggerCrawlNews', '抓取资讯');
  await clickButton('news', 'newsManualModal', '手动录入');
  // 真实 plan 新建目标按钮：id="planCreateBtn"（framework topbar 注入，onclick="openCreateModal()"）
  await clickButton('plan', 'planCreateBtn', '新建目标');

  /* 4) 复现 const 重复声明缺陷：离开 knowledge → 二次进入 */
  {
    const before = jsdomErrors.length;
    const routeUrl = BASE + '/pages/knowledge.html';
    const kBefore = fetchCount[routeUrl] || 0;
    await gotoPage('home');     // 离开 knowledge
    await gotoPage('knowledge'); // 二次进入（若首次在循环内则此处为第 2 次）
    const reFetched = (fetchCount[routeUrl] || 0) > kBefore;
    await sleep(400);
    const newErrors = jsdomErrors.slice(before);
    const hasRedecl = newErrors.some((e) => /already been declared|Identifier|kbState/i.test(e));
    observe(`[re-nav knowledge] 二次进入复现 const 重复声明缺陷: ${hasRedecl ? '已复现(P0)' : '未复现'}`,
      'reFetched=' + reFetched + (newErrors.length ? ' | errors=' + newErrors.join(' | ') : ''));
  }

  /* 4b) 增强验证：P0-2 涉及的 5 个页面「进入 → 离开 → 再次进入」，
   *     断言 virtualConsole 捕获的 jsdomError 为 0（二次进入不再抛 const 重复声明）。
   *     由于 section 2 已各加载过一次，此处 gotoPage 即为第 2 次进入。 */
  const P0_PAGES = ['knowledge', 'plan', 'review', 'output', 'settings'];
  for (const page of P0_PAGES) {
    const before = jsdomErrors.length;
    const routeUrl = BASE + '/' + ROUTE_FILE[page];
    const kBefore = fetchCount[routeUrl] || 0;
    await gotoPage('home');   // 离开目标页面
    await gotoPage(page);     // 再次进入（第 2 次）
    const reFetched = (fetchCount[routeUrl] || 0) > kBefore;
    await sleep(400);
    const newErrors = jsdomErrors.slice(before);
    const hasRedecl = newErrors.some((e) =>
      /already been declared|Identifier|has already been|kbState|_editingGoalIdForMs|reviewState|currentDocId|PROVIDER_PRESETS/i.test(e));
    assert(`[re-enter ${page}] 二次进入后 jsdomError = 0（P0-2 已修复）`,
      newErrors.length === 0 && !hasRedecl,
      `reFetched=${reFetched}` + (newErrors.length ? ' | errors=' + newErrors.join(' | ') : ''));
  }

  /* 5) 汇总 */
  console.log('\n==================================================');
  console.log(`  菜单点击验证: ${PAGES.length} 个菜单`);
  console.log(`  断言总数: ${asserts.length} | 通过: ${asserts.filter((a) => a.pass).length} | 失败: ${failCount}`);
  console.log(`  收集到的 jsdomError 总数: ${jsdomErrors.length}`);
  if (jsdomErrors.length) {
    console.log('  --- jsdomError 明细 ---');
    [...new Set(jsdomErrors)].forEach((e) => console.log('   • ' + e));
  }
  const verdict = failCount === 0 ? 'PASS' : 'FAIL';
  console.log(`  判定: ${verdict}`);
  console.log('==================================================');

  process.exit(failCount === 0 ? 0 : 1);
})().catch((err) => {
  console.error('[FATAL] qa-ui-click test crashed:', err);
  process.exit(2);
});
