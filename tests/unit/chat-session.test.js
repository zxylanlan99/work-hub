/**
 * chat-session.test.js — 聊天会话状态单例 + localStorage 持久化（问题1 基础）
 *  - Node require：验证单例
 *  - jsdom：验证 save/load/restore 持久化 与 defaultState.currentModel === 'Hy3'
 * 运行：node --test tests/unit/
 */
const { test } = require('node:test');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');
const SRC_JS = path.join(ROOT, 'src/js');

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

// Node 下直接 require（无 window）→ 模块级单例
const CS_NODE = require('../../src/js/chat-session.js');

test('chat-session.test.js — Node 单例 + jsdom 持久化', async () => {
  /* ===== 1. Node require 单例 ===== */
  const s1 = CS_NODE.getChatState();
  const s2 = CS_NODE.getChatState();
  check('Node getChatState 多次调用返回同一单例', s1 === s2);

  /* ===== 2. jsdom：save/load/restore + currentModel=Hy3 ===== */
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => console.log('[jsdomError]', e && e.message ? e.message : String(e)));
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    virtualConsole: vc
  });
  const w = dom.window;

  function inject(file) {
    const src = fs.readFileSync(path.join(SRC_JS, file), 'utf8');
    const s = w.document.createElement('script');
    s.textContent = src;
    w.document.body.appendChild(s);
  }
  inject('config.js');
  inject('chat-session.js');

  const CS = w.ChatSession;
  check('window.ChatSession 已挂载', !!CS);

  // save → load 持久化
  CS.saveChatSession({ currentAgent: 'learning-coach', currentChatId: 'c1' });
  const loaded = CS.loadChatSession();
  check('loadChatSession 返回 currentAgent', loaded.currentAgent === 'learning-coach', 'agent=' + loaded.currentAgent);
  check('loadChatSession 返回 currentChatId', loaded.currentChatId === 'c1', 'id=' + loaded.currentChatId);

  // restore 写回单例
  const st = CS.restoreChatSession();
  check('restoreChatSession 写回 currentAgent', st.currentAgent === 'learning-coach', 'agent=' + st.currentAgent);
  check('restoreChatSession 写回 currentChatId', st.currentChatId === 'c1', 'id=' + st.currentChatId);

  // defaultState.currentModel 应为 Hy3（config.js 注入）
  const model = CS.getChatState().currentModel;
  check('defaultState.currentModel === Hy3', model === 'Hy3', 'model=' + model);

  /* ---------- 汇总 ---------- */
  const failed = results.filter(r => !r.pass);
  console.log(`\n[SUMMARY] chat-session.test.js: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach(f => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (chat-session.test.js)`);
  }
});
