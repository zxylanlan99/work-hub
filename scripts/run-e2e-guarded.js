#!/usr/bin/env node
'use strict';
// 安全包装：运行 e2e 测试，内置超时保护，避免沙箱内网络等待导致卡死。
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GUARD_MS = Number(process.env.E2E_GUARD_MS || 120000);

console.log(`[guard] spawning tests/test-ai.js (guard=${GUARD_MS}ms)`);
const p = spawn('node', ['tests/test-ai.js'], { cwd: ROOT, stdio: 'inherit' });

const timer = setTimeout(() => {
  console.error(`\n[guard] TIMEOUT after ${GUARD_MS}ms — killing e2e process`);
  try { p.kill('SIGKILL'); } catch (e) {}
  process.exit(124);
}, GUARD_MS);

p.on('exit', (code, signal) => {
  clearTimeout(timer);
  console.log(`\n[guard] e2e exited code=${code} signal=${signal || 'none'}`);
  process.exit(code === null ? 1 : code);
});
p.on('error', (err) => {
  clearTimeout(timer);
  console.error(`[guard] failed to spawn e2e: ${err.message}`);
  process.exit(1);
});
