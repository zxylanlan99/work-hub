#!/usr/bin/env node
'use strict';
/**
 * scripts/run-e2e-serve.js — 自包含 E2E 运行器（测试基建，非业务代码）
 * ---------------------------------------------------------------------------
 * 职责：
 *   1) 启动静态 dev 服务：python3 -m http.server 8090 --directory src
 *   2) 轮询直到 http://localhost:8090/index.html 可访问（node http 不走系统代理）
 *   3) 调用 scripts/run-e2e-guarded.js 跑浏览器 e2e（内置超时保护）
 *   4) 无论成败都关停 dev 服务，并以 e2e 的退出码退出
 *
 * 用途：本地一键跑“前端 E2E 层”门禁，无需手动先开 dev server。
 * 依赖：playwright（已装）、python3（系统自带）。沙箱无浏览器时本脚本会失败，
 *       属预期——E2E 层在纯 headless CI 中标“未实跑”，见 QA 报告。
 */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8090;
const PROBE_URL = `http://localhost:${PORT}/index.html`;
const MAX_PROBE = 20;
const PROBE_INTERVAL = 500;

function startServer() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', 'src'], {
    cwd: ROOT, stdio: 'ignore'
  });
  srv.on('error', (e) => { console.error('[serve] 启动 dev server 失败:', e.message); process.exit(1); });
  return srv;
}

function probe() {
  return new Promise((resolve) => {
    const req = http.get(PROBE_URL, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer() {
  for (let i = 0; i < MAX_PROBE; i++) {
    if (await probe()) return true;
    await new Promise((r) => setTimeout(r, PROBE_INTERVAL));
  }
  return false;
}

function runE2e() {
  return new Promise((resolve) => {
    const e = spawn('node', ['scripts/run-e2e-guarded.js'], { cwd: ROOT, stdio: 'inherit' });
    e.on('exit', (code) => resolve(code === null ? 1 : code));
    e.on('error', (err) => { console.error('[serve] e2e 启动失败:', err.message); resolve(1); });
  });
}

(async () => {
  console.log('[serve] 启动 dev server (localhost:' + PORT + ')...');
  const srv = startServer();
  const up = await waitForServer();
  if (!up) {
    console.error('[serve] dev server 未在预期时间内就绪，中止 E2E');
    try { srv.kill(); } catch (_) {}
    process.exit(3);
  }
  console.log('[serve] dev server 就绪，开始 E2E...');
  const code = await runE2e();
  try { srv.kill(); } catch (_) {}
  console.log('[serve] dev server 已关停。E2E 退出码=' + code);
  process.exit(code);
})();
