/**
 * acceptance-criteria-1-2-4-5.test.js
 * ---------------------------------------------------------------------------
 * 验收标准 1/2/4/5 的合并验证测试（node:test 风格）。
 * 运行：node --test tests/acceptance-criteria-1-2-4-5.test.js
 *
 * 覆盖：
 *   C1  所有统计卡片必须匹配 DB 数据；前端不得有 mock/硬编码数据
 *   C2  Review 模块必须按设计规则生成 review 卡片
 *   C4  知识库必须对所有来源信息分块；news→KB 必须使用智能分块并显示分块数量
 *   C5  AI 模块：5 个 agent 的聊天必须有记忆；必须支持引用知识库
 *
 * 约定：每个 criterion 一个 test() 块，内部用 check() 收集断言；
 *       若存在真实产品缺口导致的断言失败，不弱化断言，原样报错并在汇总中标注。
 */
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const SRC_JS = path.join(SRC, 'js');
const HOME_HTML = path.join(SRC, 'pages', 'home.html');
const HOME_JS = path.join(SRC_JS, 'home.js');

// 纯函数模块（无需浏览器，直接 require）
const RCP = require(path.join(SRC_JS, 'review-card-parser.js'));
const RAG = require(path.join(SRC_JS, 'rag.js'));

// 完整 DB 加载顺序（沿用 db-ai.test.js，已验证可在 jsdom 下单测）
const SCRIPT_ORDER = [
  'cloudbase-mock.js', 'utils.js', 'config.js', 'cloudbase.js',
  'ai-service.js', 'mock.js', 'db.js',
  'chat-session.js', 'rag.js', 'news-scorer.js', 'review-card-parser.js'
];

// 防止 fire-and-forget 的未处理拒绝导致进程异常退出
const leaked = [];
process.on('unhandledRejection', (reason) => { leaked.push(reason); });

/* ---------- 通用工具 ---------- */
function waitFor(fn, timeout = 3000, interval = 25) {
  const start = Date.now();
  return new Promise((resolve) => {
    (async function poll() {
      while (Date.now() - start < timeout) {
        let ok = false;
        try { ok = fn(); } catch (e) { /* ignore */ }
        if (ok) return resolve(true);
        await new Promise((r) => setTimeout(r, interval));
      }
      resolve(false);
    })();
  });
}

function loadFullWindow() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => console.log('[jsdomError]', e && e.message ? e.message : String(e)));
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  if (!w.AbortController && globalThis.AbortController) w.AbortController = globalThis.AbortController;

  SCRIPT_ORDER.forEach((f) => {
    const src = fs.readFileSync(path.join(SRC_JS, f), 'utf8');
    const s = w.document.createElement('script');
    s.textContent = src;
    w.document.body.appendChild(s);
  });
  return w;
}

/**
 * 安装桩：覆盖 CloudBase 依赖（_aiProxy / _collection / _exec / createReviewCard / fetch / getCategories）
 * 同时捕获网络请求与落库对象，便于断言。
 */
function installStubs(w, opts) {
  opts = opts || {};
  const DB = w.DB;
  const calls = { aiProxy: 0, captured: [] };
  const captures = { adds: [], createCards: [] };

  DB._aiProxy = async (data) => {
    calls.aiProxy++;
    calls.captured.push(data);
    if (typeof opts.aiProxyReturns === 'function') return opts.aiProxyReturns(data);
    return { success: true, content: 'ok', tokens: 1, cost: 0 };
  };

  DB.createReviewCard = async (data) => {
    captures.createCards.push(data);
    return { success: true, data: { id: 'card-' + calls.aiProxy } };
  };

  DB._collection = function (name) {
    return {
      doc: function (id) {
        return {
          get: async function () {
            if (name === 'knowledge_items' && opts.kbItem) return { data: [opts.kbItem] };
            return { data: [] };
          },
          update: async function () { return { updated: 1 }; },
          remove: async function () { return { deleted: 1 }; }
        };
      },
      where: function () { return this; },
      orderBy: function () { return this; },
      limit: function () { return this; },
      skip: function () { return this; },
      count: async function () { return { total: 0 }; },
      get: async function () { return { data: [] }; },
      add: async function (data) { captures.adds.push({ name: name, data: data }); return { id: 'id-' + calls.aiProxy }; },
      update: async function () { return { data: {} }; },
      remove: async function () { return {}; }
    };
  };

  DB._exec = async (p) => {
    try {
      const r = await p;
      return { success: true, data: (r && r.data !== undefined) ? r.data : r };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  DB.getCategories = async () => ({ data: [{ _id: 'c1', name: '分类A', icon: '📁' }] });

  // 桩 fetch（用于 C4 chunkKnowledgeText 网络路径）
  const fetchCaptured = { url: null, opts: null };
  w.fetch = async (url, fo) => {
    fetchCaptured.url = url;
    fetchCaptured.opts = fo;
    const body = (fo && fo.body) ? JSON.parse(fo.body) : null;
    return {
      ok: true,
      json: async () => (opts.chunkResult || { data: { chunkCount: 5, taskId: 't', status: 'done' } })
    };
  };

  return { DB, calls, captures, fetchCaptured };
}

/* ================================================================
 * C1 — 统计卡片匹配 DB / 无硬编码
 * ================================================================ */
function makeStatDB(seed, empty) {
  const z = empty ? 0 : undefined;
  const d = (v) => (empty ? 0 : v);
  return {
    getPlanStats: async () => ({ success: true, data: { active: d(seed.goals), paused: 0, completed: 0, total: d(seed.goals) } }),
    getTodayReviewStats: async () => ({ success: true, data: { dueToday: d(seed.review), overdue: d(seed.overdue || 0) } }),
    getNewsStats: async () => ({ success: true, data: { unread: d(seed.news), total: d(seed.news + 5) } }),
    getKnowledgeOutputStats: async () => ({ success: true, data: { drafts: d(seed.output), published: d(seed.output + 3), total: d(seed.output + 3) } }),
    getYesterdayReview: async () => ({ success: true, data: empty ? [] : [{ topic: '微积分', reviewedAt: new Date().toISOString() }] }),
    getQuiz: async () => ({ success: empty ? false : true, content: empty ? '' : { question: '1+1=?', options: ['1', '2'], answer: 'B' } }),
    getLastBreakpoint: async () => ({ success: true, data: { goals: [], reviewCards: [], chats: [] } }),
    getStudyHeatmap: async () => ({ success: true, data: [] }),
    getWeeklyStudyStats: async () => ({ success: true, data: { history: [], cards: [] } })
  };
}

async function runHomeScenario(dbStub) {
  const html = `<!DOCTYPE html><html><body><div id="content-container">${fs.readFileSync(HOME_HTML, 'utf8')}</div></body></html>`;
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.DB = dbStub;
  w.initCloudbase = async () => {};
  w.toast = () => {};
  w.navigateTo = () => {};

  const script = w.document.createElement('script');
  script.textContent = fs.readFileSync(HOME_JS, 'utf8');
  w.document.body.appendChild(script);

  await w.initHomePage();
  // 等待热力图渲染完成（可靠就绪信号），再给缓冲确保统计填充
  await waitFor(() => w.document.querySelectorAll('#heatmap .heatmap-cell').length === 14);
  await new Promise((r) => setTimeout(r, 250));

  const $ = (id) => w.document.getElementById(id);
  return {
    goals: $('stat-goals').textContent,
    review: $('stat-review').textContent,
    news: $('stat-news').textContent,
    output: $('stat-output').textContent
  };
}

test('C1 — 统计卡片匹配 DB 数据 / 前端无硬编码', async () => {
  const results = [];
  function check(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail || '' });
    console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
  }

  // 种子 A：互不相同的已知数（若前端写死常量，只有碰巧等于该常量的一格会过）
  const seedA = { goals: 7, review: 3, news: 4, output: 2, overdue: 0 };
  const a = await runHomeScenario(makeStatDB(seedA, false));
  check('C1 stat-goals == DB active(7)', a.goals === '7', `实际="${a.goals}"`);
  check('C1 stat-review == DB dueToday(3)', a.review === '3', `实际="${a.review}"`);
  check('C1 stat-news == DB unread(4)', a.news === '4', `实际="${a.news}"`);
  check('C1 stat-output == DB drafts(2)', a.output === '2', `实际="${a.output}"`);

  // 种子 B：另一组不同数（证明数据驱动，非写死常量）
  const seedB = { goals: 11, review: 5, news: 8, output: 3, overdue: 1 };
  const b = await runHomeScenario(makeStatDB(seedB, false));
  check('C1 切换种子后 stat-goals 跟随变化(11)', b.goals === '11', `实际="${b.goals}"`);
  check('C1 切换种子后 stat-review 跟随变化(5)', b.review === '5', `实际="${b.review}"`);
  check('C1 切换种子后 stat-news 跟随变化(8)', b.news === '8', `实际="${b.news}"`);
  check('C1 切换种子后 stat-output 跟随变化(3)', b.output === '3', `实际="${b.output}"`);
  check('C1 数据驱动（两组渲染结果不同）', a.goals !== b.goals && a.news !== b.news,
    `A=(${a.goals},${a.review},${a.news},${a.output}) B=(${b.goals},${b.review},${b.news},${b.output})`);

  // 空数据：必须渲染 0 / 兜底，不得出现假数字
  const e = await runHomeScenario(makeStatDB({}, true));
  check('C1 空数据 stat-goals 归零', e.goals === '0', `实际="${e.goals}"`);
  check('C1 空数据 stat-review 归零', e.review === '0', `实际="${e.review}"`);
  check('C1 空数据 stat-news 归零', e.news === '0', `实际="${e.news}"`);
  check('C1 空数据 stat-output 归零', e.output === '0', `实际="${e.output}"`);

  check('C1 无泄漏未处理 Promise 拒绝', leaked.length === 0, 'leaked=' + leaked.length);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[SUMMARY] C1: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (C1)`);
  }
});

/* ================================================================
 * C2 — Review 模块按设计规则生成 review 卡片
 * ================================================================ */
test('C2 — Review 卡片按设计规则生成（含来源关联 / 异常过滤）', async () => {
  const results = [];
  function check(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail || '' });
    console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
  }

  // 2a. 单卡：必须含 question / answer / type（设计规则核心字段）
  const single = RCP.parseReviewCards('[{"question":"光合作用是什么","answer":"植物利用光合成有机物"}]');
  check('C2 单卡解析长度=1', single.length === 1, 'len=' + single.length);
  check('C2 卡片含 question', single[0] && single[0].question === '光合作用是什么', JSON.stringify(single[0]));
  check('C2 卡片含 answer', single[0] && single[0].answer === '植物利用光合成有机物', JSON.stringify(single[0]));
  check('C2 卡片含 type 且默认 open', single[0] && single[0].type === 'open', 'type=' + (single[0] && single[0].type));
  check('C2 卡片含 front/back 镜像', single[0] && single[0].front === single[0].question && single[0].back === single[0].answer, JSON.stringify(single[0]));

  // 2b. 多卡数组
  const multi = RCP.parseReviewCards('[{"question":"q1","answer":"a1"},{"question":"q2","answer":"a2"}]');
  check('C2 多卡数组长度=2', multi.length === 2, 'len=' + multi.length);
  check('C2 自定义 type 被保留', RCP.parseReviewCards('[{"question":"q","answer":"a","type":"choice"}]')[0].type === 'choice', 'type 丢失');

  // 2c. 异常输入按规则过滤（不抛异常，返回 []）
  check('C2 非JSON文本 → []', Array.isArray(RCP.parseReviewCards('完全不是json')) && RCP.parseReviewCards('完全不是json').length === 0);
  check('C2 空问答 → []', RCP.parseReviewCards('[{"question":"","answer":""}]').length === 0);
  check('C2 空输入 → []', RCP.parseReviewCards('').length === 0);
  check('C2 null 输入 → []', RCP.parseReviewCards(null).length === 0);

  // 2d. 通过 DB.aiGenerateReviewCards 落库时携带来源关联（knowledgeId = 来源条目）
  const w = loadFullWindow();
  const { DB, captures } = installStubs(w, {
    aiProxyReturns: (data) => data.action === 'generate-cards'
      ? { success: true, content: '[{"question":"卡1问","answer":"卡1答"},{"question":"卡2问","answer":"卡2答"}]' }
      : { success: true, content: 'ok' }
  });
  check('C2 window.DB / window.ReviewCardParser 已加载', !!DB && !!w.ReviewCardParser);
  const res = await DB.aiGenerateReviewCards('ITEM-X');
  check('C2 aiGenerateReviewCards success=true', res && res.success === true, JSON.stringify(res));
  check('C2 生成 2 张卡', res && res.data && res.data.count === 2, 'count=' + (res && res.data && res.data.count));
  check('C2 每张卡携带来源关联 knowledgeId=ITEM-X',
    captures.createCards.length === 2 && captures.createCards.every((c) => c.knowledgeId === 'ITEM-X'),
    JSON.stringify(captures.createCards));
  check('C2 落库卡片含 question', captures.createCards.length === 2 && captures.createCards.every((c) => !!c.question), JSON.stringify(captures.createCards));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[SUMMARY] C2: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (C2)`);
  }
});

/* ================================================================
 * C4 — 知识库分块（news→KB 智能分块 + 显示分块数量）
 * ================================================================ */
test('C4 — 知识库智能分块 / news→KB 携带分块数量', async () => {
  const results = [];
  function check(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail || '' });
    console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
  }

  // 4a. 前端应存在可单测的"智能分块"纯函数（返回 >1 块并暴露 chunkCount）。
  //     实际：rag.js 不含任何 chunk 函数；分块完全委托给远端后端 HTTP 接口。
  const hasPureChunker =
    typeof RAG.chunkText === 'function' ||
    typeof RAG.intelligentChunk === 'function' ||
    typeof RAG.splitChunks === 'function' ||
    typeof RAG.chunk === 'function';
  check('C4 [GAP] 前端存在纯函数智能分块器(返回>1块+chunkCount)',
    hasPureChunker,
    'rag.js 仅含 shouldUseRAG/needsWebFallback/formatRAGContext/retrieveContext，无 chunk 函数；分块逻辑在 backend/chunker.py，前端 DB.chunkKnowledgeText 仅转发 HTTP');

  // 4b. news→KB 分块路径：DB.chunkKnowledgeText 调用后端 /api/knowledge/chunk-text 并回传 chunkCount
  const w = loadFullWindow();
  w.CONFIG = Object.assign({}, w.CONFIG, { kbBackend: { baseURL: 'http://kb.test' } });
  const { DB, fetchCaptured, captures } = installStubs(w, { chunkResult: { data: { chunkCount: 5, taskId: 't', status: 'done' } } });
  const text = '第一段内容。\n\n第二段内容更长一些用于测试分块。\n\n第三段也是独立段落内容。';
  const chunkRes = await DB.chunkKnowledgeText(text, '测试文章', 'item-1', 'cat-1');
  check('C4 chunkKnowledgeText POST 到 /api/knowledge/chunk-text',
    fetchCaptured.url && String(fetchCaptured.url).endsWith('/api/knowledge/chunk-text'),
    'url=' + fetchCaptured.url);
  check('C4 chunkKnowledgeText 请求方法 POST', fetchCaptured.opts && fetchCaptured.opts.method === 'POST', 'method=' + (fetchCaptured.opts && fetchCaptured.opts.method));
  check('C4 chunkKnowledgeText 回传成功', chunkRes && chunkRes.success === true, JSON.stringify(chunkRes));
  check('C4 后端回传 chunkCount=5 被透传', chunkRes && chunkRes.data && chunkRes.data.chunkCount === 5, 'chunkCount=' + (chunkRes && chunkRes.data && chunkRes.data.chunkCount));

  // 4c. news→KB 入库时把 chunkCount 落到知识条目
  const addRes = await DB.createKnowledgeItem({ title: '测试条目', content: text, chunkCount: 7, sourceType: 'news' });
  const added = captures.adds.find((x) => x.name === 'knowledge_items');
  check('C4 addKnowledgeItem 成功', addRes && addRes.success === true, JSON.stringify(addRes));
  check('C4 入库条目携带 chunkCount=7', added && added.data && added.data.chunkCount === 7, JSON.stringify(added && added.data));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[SUMMARY] C4: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (C4)`);
  }
});

/* ================================================================
 * C5 — AI 记忆（5 agent）+ 引用知识库
 * ================================================================ */
test('C5 — AI 聊天记忆(5 agent) + 引用知识库', async () => {
  const results = [];
  function check(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail || '' });
    console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
  }

  const AGENTS = ['general', 'kb-butler', 'news-butler', 'learning-coach', 'review-coach'];

  // 5a. 记忆原语：buildAgentMessages 将历史(prior turns)前置到当前消息之前
  const w = loadFullWindow();
  const AIS = w.AIService;
  const hist = [
    { role: 'user', content: '第一轮问题' },
    { role: 'assistant', content: '第一轮回答' }
  ];
  const built = AIS.buildAgentMessages(hist, 'SYS', '第二轮问题');
  check('C5 记忆原语：历史被前置', built.length === 4 && built[0].role === 'system' && built[1].content === '第一轮问题' && built[2].content === '第一轮回答', JSON.stringify(built));
  check('C5 记忆原语：当前用户消息在末尾', built[built.length - 1].role === 'user' && built[built.length - 1].content === '第二轮问题', JSON.stringify(built));

  // 5b. RAG/引用开关：4 个领域 agent 启用 RAG，general 不启用
  AGENTS.forEach((id) => {
    const useRag = RAG.shouldUseRAG(id);
    if (id === 'general') check('C5 shouldUseRAG(general)=false', useRag === false);
    else check(`C5 shouldUseRAG(${id})=true`, useRag === true);
  });

  // 5c. 对话历史持久化累积（跨多轮，每个 agent）
  const { DB, calls, captures } = installStubs(w, {
    aiProxyReturns: (data) => ({ success: true, content: '回复内容', tokens: 1, cost: 0 })
  });
  for (const agent of AGENTS) {
    const chatId = 'chat-' + agent;
    captures.adds.length = 0; // 每个 agent 独立计数，避免跨 agent 累积
    await DB.sendMessageAndReply(chatId, '你好 ' + agent);
    await DB.sendMessageAndReply(chatId, '再问一次 ' + agent);
    const msgAdds = captures.adds.filter((x) => x.name === 'messages');
    check(`C5 [${agent}] 两轮对话共落库 4 条消息(2用户+2助手)`, msgAdds.length === 4,
      'adds=' + msgAdds.length);
  }

  // 5d. [GAP] 后续轮次的 AI 请求 payload 必须包含前轮上下文（真正的"记忆"）
  //      实际：sendMessageAndReply 仅把当前消息塞进 _aiProxy，历史未回灌给 AI。
  const chatId = 'chat-memory';
  calls.captured.length = 0;
  await DB.sendMessageAndReply(chatId, '第一轮用户消息');
  await DB.sendMessageAndReply(chatId, '第二轮用户消息');
  const secondPayload = calls.captured[1];
  const msgs2 = secondPayload && secondPayload.messages;
  const includesPrior = Array.isArray(msgs2) && msgs2.some((m) => m.role === 'user' && m.content === '第一轮用户消息');
  check('C5 [GAP] 第二轮 AI 请求包含第一轮上下文',
    includesPrior,
    'payload.messages=' + JSON.stringify(msgs2));

  // 5e. 引用知识库支持：sendMessageWithKnowledge 把知识条目注入 outgoing payload
  calls.captured.length = 0;
  const kbItem = { title: '知识条目标题XYZ', content: '这是被引用的知识库正文内容，用于验证引用注入。' };
  const { calls: calls2, captures: cap2 } = installStubs(w, {
    kbItem,
    aiProxyReturns: (data) => ({ success: true, content: '已参考资料回复', tokens: 1, cost: 0 })
  });
  await w.DB.sendMessageWithKnowledge('chat-kb', '请基于资料回答', ['k1']);
  const kbPayload = calls2.captured[0];
  const kbContent = kbPayload && kbPayload.messages && kbPayload.messages[0] && kbPayload.messages[0].content;
  check('C5 引用知识库：outgoing 含"请参考以下资料"前缀', typeof kbContent === 'string' && kbContent.indexOf('请参考以下资料') !== -1, 'content=' + kbContent);
  check('C5 引用知识库：outgoing 含被引用条目标题', typeof kbContent === 'string' && kbContent.indexOf('知识条目标题XYZ') !== -1, 'content=' + kbContent);

  // 5f. 自动 KB 上下文注入：kb-butler 的 system prompt 含知识库状态
  const sysPrompt = await AIS.buildAgentSystemPrompt('kb-butler');
  check('C5 kb-butler system prompt 自动注入知识库上下文',
    typeof sysPrompt === 'string' && sysPrompt.indexOf('当前知识库状态') !== -1,
    'len=' + (sysPrompt ? sysPrompt.length : 0));

  check('C5 无泄漏未处理 Promise 拒绝', leaked.length === 0, 'leaked=' + leaked.length);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[SUMMARY] C5: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (C5)`);
  }
});
