/**
 * crawler-fallback.test.js
 * ---------------------------------------------------------------------------
 * 验收标准 C3 · 在线抓取三级 fallback 单元测试（node:test 风格）。
 *
 * 验证 src/js/db.js 的 _callCrawler 三级调用策略：
 *   1) HTTP POST（真实环境 + 后端非 localhost）
 *   2) CloudBase SDK callFunction（HTTP 失败时回退）
 *   3) 本地规则兜底（与部署的 filter_news_items 等价）
 *
 * 关键保证：纯 Mock 开发环境（window.TCB 不存在）绝不触碰真实网络 /
 * 真实 callFunction，直接本地兜底，不打扰 dev。
 *
 * 运行：node --test tests/unit/crawler-fallback.test.js
 */
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC_JS = path.join(ROOT, 'src', 'js');

function loadWindow() {
  const vc = new VirtualConsole();
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const w = dom.window;
  ['cloudbase-mock.js', 'config.js', 'db.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(SRC_JS, f), 'utf8');
    const s = w.document.createElement('script');
    s.textContent = src;
    w.document.body.appendChild(s);
  });
  return w;
}

// 60 字正文，用于通过"正文过短"校验
const LONG = '内容'.repeat(30);

test('mock env: _validateNewsItem 走本地规则且绝不发起网络请求', async (t) => {
  const w = loadWindow();
  delete w.TCB;
  w.app = undefined;
  let fetchCalled = false;
  w.fetch = () => { fetchCalled = true; throw new Error('mock env 不应调用 fetch'); };

  const DB = w.DB;
  const ok = await DB._validateNewsItem({ title: 't', body: LONG, source: 'https://e.com', sourceUrl: 'https://e.com' });
  t.assert.strictEqual(ok, true, '有正文+有来源 应通过本地规则');

  const short = await DB._validateNewsItem({ title: 't', body: '短', source: 'https://e.com' });
  t.assert.strictEqual(short, false, '正文过短 应被本地规则拒绝');

  const noSrc = await DB._validateNewsItem({ title: 't', body: LONG });
  t.assert.strictEqual(noSrc, false, '无来源 应被本地规则拒绝');

  t.assert.strictEqual(fetchCalled, false, 'Mock 环境不应调用 fetch');
});

test('real env: HTTP POST 优先，返回 valid', async (t) => {
  const w = loadWindow();
  w.TCB = { init: () => ({}) }; // 标记为真实环境
  let httpArgs = null;
  w.app = { callFunction: () => { throw new Error('HTTP 成功时不应调用 callFunction'); } };
  w.fetch = async (url, opts) => {
    httpArgs = { url, opts };
    return { ok: true, json: async () => ({ valid: [{ title: 'x' }], dropped: [] }) };
  };

  const r = await w.DB._validateNewsItem({ title: 't', body: LONG, source: 'https://e.com', sourceUrl: 'https://e.com' });
  t.assert.strictEqual(r, true, 'HTTP valid 响应应得 true');
  t.assert.ok(httpArgs, '应发起 fetch');
  const sent = JSON.parse(httpArgs.opts.body);
  t.assert.strictEqual(sent.action, 'validate');
  t.assert.strictEqual(sent.items.length, 1);
});

test('real env: HTTP 失败回退 callFunction', async (t) => {
  const w = loadWindow();
  w.TCB = { init: () => ({}) };
  let cfCalled = false;
  w.app = {
    callFunction: async (req) => {
      cfCalled = true;
      t.assert.strictEqual(req.name, 'news-crawler');
      t.assert.strictEqual(req.data.action, 'validate');
      // callFunction 走 HTTP 语义信封：result.body 为 JSON 字符串
      return { result: { statusCode: 200, headers: {}, body: JSON.stringify({ valid: [{ title: 'x' }], dropped: [] }) } };
    }
  };
  let httpAttempts = 0;
  w.fetch = async () => { httpAttempts++; throw new Error('INVALID_PATH'); };

  const r = await w.DB._validateNewsItem({ title: 't', body: LONG, source: 'https://e.com' });
  t.assert.strictEqual(r, true, 'callFunction valid 应得 true');
  t.assert.strictEqual(cfCalled, true, 'HTTP 失败后应调用 callFunction');
  t.assert.strictEqual(httpAttempts, 1, 'HTTP 应被尝试一次');
});

test('real env: HTTP 与 callFunction 均失败 → 本地兜底仍成立', async (t) => {
  const w = loadWindow();
  w.TCB = { init: () => ({}) };
  w.app = { callFunction: async () => { throw new Error('cf down'); } };
  w.fetch = async () => { throw new Error('http down'); };

  const DB = w.DB;
  const valid = await DB._validateNewsItem({ title: 't', body: LONG, source: 'https://e.com' });
  t.assert.strictEqual(valid, true, '本地规则应接受合规项');
  const invalid = await DB._validateNewsItem({ title: 't', body: '短', source: 'https://e.com' });
  t.assert.strictEqual(invalid, false, '本地规则应拒绝正文过短');
});

test('fetchRSSSources: mock 环境返回本地空结果并带 failedSources', async (t) => {
  const w = loadWindow();
  delete w.TCB;
  w.app = undefined;
  w.fetch = () => { throw new Error('mock 不应联网'); };

  const res = await w.DB.fetchRSSSources(['https://a.com/rss']);
  t.assert.strictEqual(res.success, true);
  t.assert.strictEqual(Array.isArray(res.data), true);
  t.assert.strictEqual(res.data.length, 0, 'mock/local RSS 返回空');
  t.assert.strictEqual(res.failedSources.length, 1, '应记录失败源');
});

test('fetchRSSSources: real env HTTP 返回文章', async (t) => {
  const w = loadWindow();
  w.TCB = { init: () => ({}) };
  w.app = { callFunction: () => { throw new Error('HTTP 成功时不应调用 callFunction'); } };
  w.fetch = async () => ({ ok: true, json: async () => ({ success: true, data: [{ title: 'a' }], count: 1, failedSources: [] }) });

  const res = await w.DB.fetchRSSSources(['https://a.com/rss']);
  t.assert.strictEqual(res.success, true);
  t.assert.strictEqual(res.data.length, 1, '应返回抓取到的文章');
  t.assert.strictEqual(res.source, 'http');
});

test('_localCrawler validate 复刻 filter_news_items 语义', (t) => {
  const w = loadWindow();
  const out = w.DB._localCrawler('validate', {
    items: [
      { id: 1, body: '', source: 'https://e.com' },
      { id: 2, body: '短', source: 'https://e.com' },
      { id: 3, body: LONG, source: '' },
      { id: 4, body: LONG, source: 'https://e.com' }
    ]
  });
  t.assert.strictEqual(out.valid.length, 1, '仅 id=4 应合规');
  t.assert.strictEqual(out.valid[0].id, 4);
  const reasons = out.dropped.map((d) => d.reason);
  t.assert.ok(reasons.includes('no_body'), '应标记无正文');
  t.assert.ok(reasons.includes('body_too_short'), '应标记正文过短');
  t.assert.ok(reasons.includes('no_source'), '应标记无来源');
});
