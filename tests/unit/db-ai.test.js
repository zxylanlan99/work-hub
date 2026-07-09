/**
 * db-ai.test.js — DB 集成单测（问题4 落库 / 问题3 无来源删除 / 模型收敛）
 *  - 用 jsdom 构造 window，按 src/index.html 脚本顺序注入（去掉 framework/home）
 *  - 桩 window.DB 的 CloudBase 依赖：_aiProxy / createReviewCard / permanentDeleteNews / _exec / _collection
 *  - 桩 window.fetch 捕获请求体验证 Hy3 收敛
 * 运行：node --test tests/unit/
 */
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');
const SRC_JS = path.join(ROOT, 'src/js');

// 防止 fire-and-forget 的 _aiScoreNewsAsync 未处理拒绝导致进程退出
const leaked = [];
process.on('unhandledRejection', (reason) => { leaked.push(reason); });

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

// 按 src/index.html 顺序（去掉 framework.js / home.js）注入脚本
const SCRIPT_ORDER = [
  'cloudbase-mock.js', 'utils.js', 'config.js', 'cloudbase.js',
  'ai-service.js', 'mock.js', 'db.js',
  'chat-session.js', 'rag.js', 'news-scorer.js', 'review-card-parser.js'
];

function loadWindow() {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => console.log('[jsdomError]', e && e.message ? e.message : String(e)));
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
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

// 安装桩：覆盖 CloudBase 依赖方法，保留其余真实逻辑
function installStubs(w, opts) {
  const DB = w.DB;
  const calls = { aiProxy: 0, createReviewCard: 0, permanentDeleteNews: 0, cards: [] };
  const aiProxyReturns = opts && opts.aiProxyReturns;

  DB._aiProxy = async (data) => {
    calls.aiProxy++;
    return (typeof aiProxyReturns === 'function') ? aiProxyReturns(data) : aiProxyReturns;
  };
  DB.createReviewCard = async (data) => {
    calls.createReviewCard++;
    calls.cards.push(data);
    return { success: true, data: { id: 'card-' + calls.createReviewCard } };
  };
  DB.permanentDeleteNews = async (id) => {
    calls.permanentDeleteNews++;
    return { success: true };
  };

  function chain() {
    return {
      doc: () => chain(),
      where: () => chain(),
      orderBy: () => chain(),
      limit: () => chain(),
      skip: () => chain(),
      count: async () => ({ total: 0 }),
      get: async () => ({ data: [] }),
      add: async () => ({ id: 'fake-id' }),
      update: async () => ({ data: {} }),
      remove: async () => ({})
    };
  }
  DB._collection = () => chain();
  DB._exec = async (p) => {
    try {
      const r = await p;
      return { success: true, data: (r && r.data !== undefined) ? r.data : r };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };
  return { DB, calls };
}

test('db-ai.test.js — 落库/无来源删除/模型收敛', async () => {
  const w = loadWindow();
  check('window.DB 已加载', !!w.DB);
  check('window.AIService 已加载', !!w.AIService);
  if (!w.DB || !w.AIService) {
    const failed = results.filter(r => !r.pass);
    throw new Error(`脚本注入失败，${failed.length} 断言失败 (db-ai.test.js)`);
  }

  /* ===== P4 落库：AI 生成复习卡片并逐张落库 ===== */
  {
    const { DB, calls } = installStubs(w, {
      aiProxyReturns: { success: true, content: '[{"question":"q1","answer":"a1"},{"question":"q2","answer":"a2"}]' }
    });
    const res = await DB.aiGenerateReviewCards('ITEM1');
    check('P4 返回 success=true', res && res.success === true, JSON.stringify(res));
    check('P4 返回 data.count=2', res && res.data && res.data.count === 2, 'count=' + (res && res.data && res.data.count));
    check('P4 createReviewCard 调用2次', calls.createReviewCard === 2, 'calls=' + calls.createReviewCard);
    check('P4 每张入参含 knowledgeId=ITEM1',
      calls.cards.length === 2 && calls.cards.every(c => c.knowledgeId === 'ITEM1'),
      JSON.stringify(calls.cards));
  }

  /* ===== P4 异常：AI 返回无法解析 → success=false ===== */
  {
    const { DB } = installStubs(w, { aiProxyReturns: { success: true, content: '完全不是json的文本' } });
    const res = await DB.aiGenerateReviewCards('ITEM2');
    check('P4 无法解析文本→{success:false}', res && res.success === false, JSON.stringify(res));
  }

  /* ===== P3 无来源删除：_aiScoreNewsAsync 命中 no-source ===== */
  {
    const { DB, calls } = installStubs(w, {
      aiProxyReturns: { success: true, content: '{"title":"x","score":80,"level":"high","tags":["t"]}' }
    });
    const r = await DB._aiScoreNewsAsync('N1', { title: 't', content: '内容足够长 xxxxx', sourceUrl: '' });
    check('P3 无来源 permanentDeleteNews 被调用1次', calls.permanentDeleteNews === 1, 'calls=' + calls.permanentDeleteNews);
    check('P3 无来源 命中 no-source', r && r.reason === 'no-source', JSON.stringify(r));
    check('P3 无来源 不进入AI评分(_aiProxy未调用)', calls.aiProxy === 0, 'aiProxy=' + calls.aiProxy);
  }

  /* ===== P3 正常项：带来源 → 不删除、进入评分 ===== */
  {
    const { DB, calls } = installStubs(w, {
      aiProxyReturns: { success: true, content: '{"title":"生成标题","score":85,"level":"high","tags":["t1"]}' }
    });
    const r = await DB._aiScoreNewsAsync('N2', {
      title: 'T', content: '内容足够长 xxxxx 这是一段足够长的正常资讯内容', sourceUrl: 'http://example.com/news/1'
    });
    check('P3 正常项 不删除(permanentDeleteNews未调用)', calls.permanentDeleteNews === 0, 'calls=' + calls.permanentDeleteNews);
    check('P3 正常项 进入AI评分(_aiProxy被调用1次)', calls.aiProxy === 1, 'aiProxy=' + calls.aiProxy);
  }

  /* ===== P3 手动录入校验：addManualNews 缺来源拒绝 ===== */
  {
    const { DB } = installStubs(w, { aiProxyReturns: { success: true, content: '{}' } });
    const noSrc = await DB.addManualNews({ title: 'x' });
    check('P3 addManualNews 无sourceUrl→{success:false}', noSrc && noSrc.success === false, JSON.stringify(noSrc));
    check('P3 addManualNews 错误含"信息来源"', noSrc && typeof noSrc.error === 'string' && noSrc.error.indexOf('信息来源') !== -1, 'error=' + (noSrc && noSrc.error));

    const withSrc = await DB.addManualNews({ title: 'x', content: '内容足够长', sourceUrl: 'http://example.com/m/1' });
    check('P3 addManualNews 有sourceUrl→进入正常流程{success:true}', withSrc && withSrc.success === true, JSON.stringify(withSrc));
  }

  /* ===== Hy3 收敛：模型默认统一为 Hy3 ===== */
  {
    w.localStorage.setItem('studymind_ai_models', JSON.stringify([
      { id: 'Hy3', modelName: 'Hy3', provider: 'hy3', baseUrl: 'http://localhost:11434', apiKey: '' }
    ]));
    let capturedBody = null;
    w.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }] }), text: async () => '' };
    };

    const modelId = w.AIService.getActiveModelId();
    check('Hy3 getActiveModelId()===\'Hy3\'', modelId === 'Hy3', 'modelId=' + modelId);

    const callRes = await w.AIService.callAI({ action: 'chat', messages: [{ role: 'user', content: 'hi' }] });
    check('Hy3 callAI 请求 body.model===\'Hy3\'', capturedBody && capturedBody.model === 'Hy3', 'model=' + (capturedBody && capturedBody.model));
    check('Hy3 callAI 成功返回', callRes && callRes.success === true, JSON.stringify(callRes));
  }

  /* ---------- 汇总 ---------- */
  check('无泄漏未处理 Promise 拒绝', leaked.length === 0, 'leaked=' + leaked.length);
  const failed = results.filter(r => !r.pass);
  console.log(`\n[SUMMARY] db-ai.test.js: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach(f => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (db-ai.test.js)`);
  }
});
