#!/usr/bin/env node
/**
 * scripts/deploy.js — StudyMind 部署脚本（CloudBase）
 * ---------------------------------------------------------------------------
 * 流程：
 *   1) 先执行构建（scripts/build.js 已生成 dist/）
 *   2) 校验 @cloudbase/cli (tcb) 是否可用
 *   3) 打印/执行真实部署命令：tcb deploy --mode=auto
 *
 * 沙箱说明：CI/沙箱通常无 CloudBase 登录态，故脚本在检测到未登录时
 *   仅打印“应执行的真实命令”并以退出码 0 结束（不阻塞本地/CI 跑测试）。
 *   在已登录的机器上会自动执行 tcb deploy。
 *
 * 依赖：@cloudbase/cli（已在 dependencies）
 */
'use strict';

const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, args, opts) {
  return spawnSync(cmd, args, Object.assign({ cwd: ROOT, stdio: 'inherit' }, opts || {}));
}

// 带超时保护的同步执行：避免未登录/网络异常时 tcb 交互挂起阻塞门禁
function runWithTimeout(cmd, args, ms) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', timeout: ms, killSignal: 'SIGKILL' });
  return { status: r.status === null ? 1 : r.status, timedOut: !!r.timedOut };
}

console.log('=== StudyMind 部署流程 ===');

/* 1. 构建 */
console.log('\n[1/3] 构建静态产物...');
const build = run(process.execPath, [path.join(__dirname, 'build.js')]);
if (build.status !== 0) {
  console.error('构建失败，中止部署');
  process.exit(1);
}

/* 2. 校验 tcb CLI 与登录态 */
console.log('\n[2/3] 校验 CloudBase CLI (tcb)...');
let tcbOk = false;
let loggedIn = false;
try {
  const v = spawnSync('tcb', ['--version'], { cwd: ROOT, encoding: 'utf8' });
  tcbOk = v.status === 0;
  if (tcbOk) console.log('tcb 可用: ' + String(v.stdout || '').trim().split('\n')[0]);

  // 快速登录态探针：未登录时 ~1s 返回 code!=0（不挂起），避免误触发真实部署
  const auth = spawnSync('tcb', ['env:list'], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
  loggedIn = auth.status === 0;
} catch (e) {
  tcbOk = false;
}

if (!tcbOk || !loggedIn) {
  const reason = !tcbOk ? '未安装 tcb CLI' : 'tcb 未登录';
  console.log(reason + '（沙箱/本地未登录属正常）。');
  console.log('应执行的真实部署命令：\n  tcb login && tcb deploy --mode=auto\n');
  console.log('=== 部署流程结束（未实际推送，需先 `tcb login`）===');
  process.exit(0);
}

/* 3. 实际部署（带超时保护，避免极端情况下挂起阻塞门禁） */
// 注意：CloudBase CLI 3.x 的 `tcb deploy` 为「云应用部署」，不读取 cloudbaserc v2 的
// staticAssets 段，且 `--mode=auto` 为非法参数（会交互式卡死退出 1）。
// 静态托管的正确原语是 `tcb hosting deploy <dir> -e <envId>`。
let envId = 'studymind-d7g06nv0de98a1f1b';
let staticSrc = 'src';
try {
  const rc = JSON.parse(require('fs').readFileSync(path.join(ROOT, 'cloudbaserc.json'), 'utf8'));
  if (rc.envId) envId = rc.envId;
  if (rc.deploy && rc.deploy.staticAssets && rc.deploy.staticAssets.src) staticSrc = rc.deploy.staticAssets.src;
} catch (e) { /* 回退默认值 */ }
console.log('\n[3/3] 执行部署 tcb hosting deploy ' + staticSrc + ' -e ' + envId + ' ...');
const dep = runWithTimeout('tcb', ['hosting', 'deploy', staticSrc, '-e', envId], 120000);
if (dep.timedOut) {
  console.error('部署命令在 120s 内未完成，可能网络异常。请手动重试：tcb hosting deploy ' + staticSrc + ' -e ' + envId);
  process.exit(1);
}
process.exit(dep.status === 0 ? 0 : 1);
