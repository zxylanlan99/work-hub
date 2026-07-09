/**
 * StudyMind 首页重写 — 真实逻辑冒烟测试 (jsdom)
 * ---------------------------------------------------------------------------
 * 目标：在不依赖 CloudBase / 网络 / CDN 的受管 Node 环境下，用桩 window.DB
 *       证明 home.js 真的能把真实统计填充进 home.html 的 DOM。
 *
 * 运行：node tests/home-rewrite.smoke.test.js
 * 依赖：jsdom（已安装到 workbuddy workspace，通过 NODE_PATH 引入）
 */

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HOME_HTML = path.join(ROOT, 'src', 'pages', 'home.html');
const HOME_JS = path.join(ROOT, 'src', 'js', 'home.js');

/* ---------- 断言收集 ---------- */
const results = [];
function assert(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  const tag = cond ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

/* ---------- 工具 ---------- */
function dayAgo(offsetDays, hour = 12) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

async function waitFor(fn, timeout = 3000, interval = 25) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let ok = false;
    try { ok = fn(); } catch (e) { /* ignore */ }
    if (ok) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

/* ---------- 已知固定数据桩 ---------- */
function makeKnownDB() {
  const now = new Date();

  // 热力图记录：14 天窗口内，按 offset(距今天数) 分布复习次数
  const heatCounts = { 13: 4, 10: 3, 7: 2, 3: 1, 0: 5 }; // 其余为 0
  const heatRecords = [];
  Object.keys(heatCounts).forEach((off) => {
    for (let k = 0; k < heatCounts[off]; k++) {
      heatRecords.push({ reviewedAt: dayAgo(Number(off)).toISOString() });
    }
  });

  // 趋势 history：today / today-1 / today-2 各一次 → 连续天数=3
  const weeklyHistory = [
    { reviewedAt: dayAgo(0).toISOString() },
    { reviewedAt: dayAgo(1).toISOString() },
    { reviewedAt: dayAgo(2).toISOString() },
  ];
  // 趋势 cards：两张均 today 到期 → dueThisWeek=2
  const weeklyCards = [
    { nextReview: dayAgo(0).toISOString() },
    { nextReview: dayAgo(0).toISOString() },
  ];

  return {
    getPlanStats: async () => ({ success: true, data: { active: 3, paused: 1, completed: 2, total: 6 } }),
    getTodayReviewStats: async () => ({ success: true, data: { dueToday: 5, overdue: 2 } }),
    getNewsStats: async () => ({ success: true, data: { unread: 2, total: 10 } }),
    getKnowledgeOutputStats: async () => ({ success: true, data: { drafts: 3, published: 1, total: 4 } }),
    getYesterdayReview: async () => ({ success: true, data: [
      { topic: '微积分', reviewedAt: dayAgo(1).toISOString() },
      { topic: '英语', reviewedAt: dayAgo(1).toISOString() },
    ] }),
    getQuiz: async () => ({ success: true, content: { question: '1+1=?', options: ['1', '2', '3', '4'], answer: 'B' } }),
    getLastBreakpoint: async () => ({ success: true, data: {
      goals: [{ title: '机器学习', weeklyHours: 10, progress: 45, updatedAt: now.toISOString() }],
      reviewCards: [], chats: [],
    } }),
    getStudyHeatmap: async (startDate) => {
      const s = new Date(startDate);
      const data = heatRecords.filter((r) => new Date(r.reviewedAt) >= s);
      return { success: true, data };
    },
    getWeeklyStudyStats: async () => ({ success: true, data: { history: weeklyHistory, cards: weeklyCards } }),
  };
}

/* ---------- 空数据桩 ---------- */
function makeEmptyDB() {
  return {
    getPlanStats: async () => ({ success: true, data: { active: 0, paused: 0, completed: 0, total: 0 } }),
    getTodayReviewStats: async () => ({ success: true, data: { dueToday: 0, overdue: 0 } }),
    getNewsStats: async () => ({ success: true, data: { unread: 0, total: 0 } }),
    getKnowledgeOutputStats: async () => ({ success: true, data: { drafts: 0, published: 0, total: 0 } }),
    getYesterdayReview: async () => ({ success: true, data: [] }),
    getQuiz: async () => ({ success: false, content: '' }),
    getLastBreakpoint: async () => ({ success: true, data: { goals: [], reviewCards: [], chats: [] } }),
    getStudyHeatmap: async () => ({ success: true, data: [] }),
    getWeeklyStudyStats: async () => ({ success: true, data: { history: [], cards: [] } }),
  };
}

/* ---------- 场景运行器 ---------- */
async function runScenario(dbStub, label) {
  const homeHtml = fs.readFileSync(HOME_HTML, 'utf8');
  const homeSrc = fs.readFileSync(HOME_JS, 'utf8');

  const html = `<!DOCTYPE html><html><head></head><body><div id="content-container">${homeHtml}</div></body></html>`;

  const consoleErrors = [];
  const jsdomErrors = [];
  const vc = new VirtualConsole();
  vc.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));
  vc.on('jsdomError', (e) => jsdomErrors.push(e.message || String(e)));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const win = dom.window;

  // 桩全局
  win.DB = dbStub;
  win.initCloudbase = async () => {};
  win.toast = () => {};
  win.navigateTo = () => {};

  // 注入 home.js（模拟 index.html 的 <script src="js/home.js">）
  const script = win.document.createElement('script');
  script.textContent = homeSrc;
  win.document.body.appendChild(script);

  if (typeof win.initHomePage !== 'function') {
    assert(`${label} home.js 暴露 window.initHomePage`, false, 'window.initHomePage 未定义');
    return { consoleErrors, jsdomErrors };
  }
  assert(`${label} home.js 暴露 window.initHomePage`, true);

  try {
    await win.initHomePage();
  } catch (e) {
    assert(`${label} initHomePage 不抛异常`, false, e.message);
    return { consoleErrors, jsdomErrors };
  }

  // 等待异步区块加载完成（heatmap 渲染是可靠信号）
  await waitFor(() => win.document.querySelectorAll('#heatmap .heatmap-cell').length === 14);
  // 再给一点缓冲，确保所有区块填充
  await new Promise((r) => setTimeout(r, 60));

  const $ = (id) => win.document.getElementById(id);

  /* ---- 四宫格数字 ---- */
  assert(`${label} stat-goals 填充`, $('stat-goals').textContent === '3', `实际="${$('stat-goals').textContent}"`);
  assert(`${label} stat-review 填充`, $('stat-review').textContent === '5', `实际="${$('stat-review').textContent}"`);
  assert(`${label} stat-news 填充`, $('stat-news').textContent === '2', `实际="${$('stat-news').textContent}"`);
  assert(`${label} stat-output 填充`, $('stat-output').textContent === '3', `实际="${$('stat-output').textContent}"`);

  /* ---- 逾期徽标 ---- */
  const badge = $('review-badge');
  assert(`${label} review-badge 逾期文案`, badge.textContent.indexOf('逾期') !== -1, `text="${badge.textContent}"`);
  assert(`${label} review-badge qbadge-warn 类`, badge.className.indexOf('qbadge-warn') !== -1, `class="${badge.className}"`);

  /* ---- 四宫格副标题 ---- */
  const cards = win.document.querySelectorAll('.quick-card');
  assert(`${label} 学习计划副标题`, cards[0] && cards[0].querySelector('.quick-card-sub').textContent === '3 个学习目标进行中', cards[0] && cards[0].querySelector('.quick-card-sub').textContent);
  assert(`${label} 复习副标题含逾期`, cards[1] && cards[1].querySelector('.quick-card-sub').textContent === '5 张卡片待复习 · 2 张已逾期', cards[1] && cards[1].querySelector('.quick-card-sub').textContent);

  /* ---- 热力图 ---- */
  const cells = win.document.querySelectorAll('#heatmap .heatmap-cell');
  assert(`${label} heatmap 恰好 14 格`, cells.length === 14, `实际=${cells.length}`);
  const expectedLevels = ['h4', 'h0', 'h0', 'h3', 'h0', 'h0', 'h2', 'h0', 'h0', 'h0', 'h1', 'h0', 'h0', 'h4'];
  let heatOk = cells.length === 14;
  for (let k = 0; k < expectedLevels.length; k++) {
    if (cells[k].className.indexOf(expectedLevels[k]) === -1) {
      heatOk = false;
      break;
    }
  }
  assert(`${label} heatmap 等级分布正确`, heatOk, `期望 ${expectedLevels.join(',')}`);

  /* ---- 昨日回顾 ---- */
  assert(`${label} yesterday-summary 填充`, $('yesterday-summary').textContent.indexOf('微积分') !== -1, $('yesterday-summary').textContent);

  /* ---- 快问快答 ---- */
  assert(`${label} quiz-question 填充`, $('quiz-question').textContent === '1+1=?', $('quiz-question').textContent);
  const opts = $('quiz-options').children;
  assert(`${label} quiz 渲染 4 个选项`, opts.length === 4, `实际=${opts.length}`);
  // 点击"查看答案"
  $('quiz-answer-btn').click();
  assert(`${label} 点击查看答案显示答案`, $('quiz-answer').textContent.indexOf('参考答案') !== -1 && $('quiz-answer').textContent.indexOf('B') !== -1, $('quiz-answer').textContent);
  assert(`${label} 查看答案后按钮隐藏`, $('quiz-answer-btn').style.display === 'none', `display=${$('quiz-answer-btn').style.display}`);

  /* ---- 智能续接 ---- */
  assert(`${label} resume-topic 填充`, $('resume-topic-content').textContent === '机器学习', $('resume-topic-content').textContent);
  assert(`${label} resume-duration 填充`, $('resume-duration').textContent.indexOf('10 小时') !== -1, $('resume-duration').textContent);
  assert(`${label} resume-progress 填充`, $('resume-progress').textContent === '📊 进度 45%', $('resume-progress').textContent);
  assert(`${label} resume-time 含时间`, /:\d\d/.test($('resume-time').textContent), $('resume-time').textContent);

  /* ---- 本周趋势 ---- */
  // 独立按相同算法计算期望值（不写死数字，避免与源码重复 bug 的假通过）
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const weeklyHistory = [
    { reviewedAt: dayAgo(0).toISOString() },
    { reviewedAt: dayAgo(1).toISOString() },
    { reviewedAt: dayAgo(2).toISOString() },
  ];
  const weeklyCards = [{ nextReview: dayAgo(0).toISOString() }, { nextReview: dayAgo(0).toISOString() }];
  const dueThisWeek = weeklyCards.filter((c) => { const d = new Date(c.nextReview); return d >= monday && d <= sunday; }).length;
  const reviewedThisWeek = weeklyHistory.filter((h) => { const d = new Date(h.reviewedAt); return d >= monday && d <= sunday; }).length;
  const expCompletion = dueThisWeek > 0 ? Math.min(100, Math.round((reviewedThisWeek / dueThisWeek) * 100)) : (reviewedThisWeek > 0 ? 100 : 0);
  assert(`${label} trend-completion 完成率正确`, $('trend-completion').textContent === expCompletion + '%', `实际="${$('trend-completion').textContent}" 期望="${expCompletion}%"`);
  assert(`${label} trend-completion-bar 宽度正确`, $('trend-completion-bar').style.width === expCompletion + '%', `width=${$('trend-completion-bar').style.width}`);

  // 连续天数：today/today-1/today-2 连续 → 3
  const studyDays = new Set(weeklyHistory.map((h) => { const d = new Date(h.reviewedAt); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  if (!studyDays.has(cursor.getFullYear() + '-' + cursor.getMonth() + '-' + cursor.getDate())) cursor.setDate(cursor.getDate() - 1);
  while (studyDays.has(cursor.getFullYear() + '-' + cursor.getMonth() + '-' + cursor.getDate())) { streak++; cursor.setDate(cursor.getDate() - 1); }
  assert(`${label} trend-streak 连续天数正确`, $('trend-streak').textContent === streak + ' 天', `实际="${$('trend-streak').textContent}" 期望="${streak} 天"`);

  /* ---- 跳过暖身 ---- */
  $('skip-warmup').click();
  assert(`${label} skipWarmup 隐藏暖身卡`, $('warmupPanel').style.display === 'none', `display=${$('warmupPanel').style.display}`);

  return { consoleErrors, jsdomErrors };
}

/* ---------- 空数据场景断言 ---------- */
async function runEmptyScenario(dbStub, label) {
  const homeHtml = fs.readFileSync(HOME_HTML, 'utf8');
  const homeSrc = fs.readFileSync(HOME_JS, 'utf8');
  const html = `<!DOCTYPE html><html><head></head><body><div id="content-container">${homeHtml}</div></body></html>`;

  const consoleErrors = [];
  const jsdomErrors = [];
  const vc = new VirtualConsole();
  vc.on('error', (...args) => consoleErrors.push(args.map(String).join(' ')));
  vc.on('jsdomError', (e) => jsdomErrors.push(e.message || String(e)));

  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window;
  win.DB = dbStub;
  win.initCloudbase = async () => {};
  win.toast = () => {};
  win.navigateTo = () => {};

  const script = win.document.createElement('script');
  script.textContent = homeSrc;
  win.document.body.appendChild(script);

  try {
    await win.initHomePage();
  } catch (e) {
    assert(`${label} initHomePage 不抛异常`, false, e.message);
    return { consoleErrors, jsdomErrors };
  }
  await waitFor(() => win.document.querySelectorAll('#heatmap .heatmap-cell').length === 14);
  await new Promise((r) => setTimeout(r, 60));

  const $ = (id) => win.document.getElementById(id);

  assert(`${label} 空数据不抛异常(stat 归零)`, $('stat-goals').textContent === '0' && $('stat-review').textContent === '0' && $('stat-news').textContent === '0' && $('stat-output').textContent === '0',
    `goals=${$('stat-goals').textContent} review=${$('stat-review').textContent} news=${$('stat-news').textContent} output=${$('stat-output').textContent}`);

  const badge = $('review-badge');
  assert(`${label} 空数据逾期徽标走兜底(待复习)`, badge.textContent === '待复习' && badge.className.indexOf('qbadge-warn') === -1, `text="${badge.textContent}" class="${badge.className}"`);

  const cells = win.document.querySelectorAll('#heatmap .heatmap-cell');
  let allH0 = cells.length === 14;
  for (let k = 0; k < cells.length; k++) {
    if (cells[k].className.indexOf('h0') === -1) { allH0 = false; break; }
  }
  assert(`${label} 空数据 heatmap 14 个 h0 格`, allH0, `数量=${cells.length}`);

  assert(`${label} 空数据昨日回顾兜底文案`, $('yesterday-summary').textContent.indexOf('昨日暂无复习记录') !== -1, $('yesterday-summary').textContent);

  // 空数据下 quiz 无题 → quizContainer 隐藏
  assert(`${label} 空数据快问快答隐藏`, $('quizContainer').style.display === 'none', `display=${$('quizContainer').style.display}`);

  assert(`${label} 空数据续接兜底文案`, $('resume-topic-content').textContent === '暂无学习记录', $('resume-topic-content').textContent);

  assert(`${label} 空数据 trend-completion=0%`, $('trend-completion').textContent === '0%', $('trend-completion').textContent);
  assert(`${label} 空数据 trend-streak=0 天`, $('trend-streak').textContent === '0 天', $('trend-streak').textContent);

  assert(`${label} 空数据无 console.error 致命错误`, consoleErrors.length === 0, consoleErrors.join(' | '));

  return { consoleErrors, jsdomErrors };
}

/* ---------- id 一致性静态检查 ---------- */
function checkIdConsistency() {
  const homeHtml = fs.readFileSync(HOME_HTML, 'utf8');
  const homeSrc = fs.readFileSync(HOME_JS, 'utf8');
  const refs = new Set();
  let m;
  const re1 = /(?:\$\(|getElementById\()'([^']+)'/g;
  const re2 = /setText\('([^']+)'/g;
  while ((m = re1.exec(homeSrc))) refs.add(m[1]);
  while ((m = re2.exec(homeSrc))) refs.add(m[1]);

  // home.html 中存在的 id 集合
  const htmlIds = new Set();
  const reId = /id="([^"]+)"/g;
  while ((m = reId.exec(homeHtml))) htmlIds.add(m[1]);

  const missing = [];
  refs.forEach((id) => { if (!htmlIds.has(id)) missing.push(id); });

  // 任务明确列出的关键 id
  const critical = ['stat-goals', 'stat-review', 'stat-news', 'stat-output', 'review-badge', 'yesterday-summary',
    'quiz-question', 'quiz-options', 'quiz-answer-btn', 'quiz-answer', 'quizContainer', 'resumePanel',
    'resume-topic-content', 'resume-time', 'resume-duration', 'resume-progress', 'heatmap', 'trend-completion',
    'trend-completion-bar', 'trend-completion-change', 'trend-streak', 'trend-streak-change', 'warmupPanel', 'skip-warmup'];
  const missingCritical = critical.filter((id) => !htmlIds.has(id));

  assert('id 一致性：home.js 引用的 id 全部存在于 home.html', missing.length === 0, missing.length ? '缺失: ' + missing.join(', ') : `共检查 ${refs.size} 个引用，全部命中`);
  assert('id 一致性：关键 id 清单全部存在', missingCritical.length === 0, missingCritical.length ? '缺失: ' + missingCritical.join(', ') : '24 个关键 id 全部存在');

  return { refs: refs.size, missing };
}

/* ---------- 主流程 ---------- */
(async () => {
  console.log('==================================================');
  console.log(' StudyMind 首页重写 — 真实逻辑冒烟测试');
  console.log('==================================================');

  const idInfo = checkIdConsistency();
  console.log(`\n[静态] home.js 共引用 ${idInfo.refs} 个 DOM id，缺失 ${idInfo.missing.length} 个\n`);

  const known = await runScenario(makeKnownDB(), '[已知数据]');
  if (known.consoleErrors.length) {
    console.log(`\n[警告] 已知数据场景出现 console.error: ${known.consoleErrors.join(' | ')}`);
  }

  console.log('');
  const empty = await runEmptyScenario(makeEmptyDB(), '[空数据]');
  if (empty.jsdomErrors.length) {
    console.log(`\n[信息] jsdom 非致命提示(${empty.jsdomErrors.length}): ${empty.jsdomErrors.slice(0, 3).join(' | ')}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n==================================================');
  console.log(` 总计 ${results.length} 项断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    console.log(' 失败项:');
    failed.forEach((f) => console.log(`   - ${f.name} ${f.detail ? '(' + f.detail + ')' : ''}`));
    console.log('\n 判定: FAIL');
    process.exit(1);
  } else {
    console.log('\n 判定: PASS');
    process.exit(0);
  }
})();
