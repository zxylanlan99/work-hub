#!/usr/bin/env node
/**
 * scripts/build.js — StudyMind 静态构建（无打包器）
 * ---------------------------------------------------------------------------
 * 职责：
 *   1) 语法检查 src/js 下所有 .js（node --check），提前暴露解析错误
 *   2) 校验关键入口文件存在（index.html / pages / vendor）
 *   3) 将 src/ 原样拷贝到 dist/ 作为可部署静态产物
 *
 * 退出码：任何语法错误或非致命校验失败 → 退出 1
 * 依赖：仅 Node 内置模块（零额外依赖，沙箱可用）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

let failures = 0;
function fail(msg) {
  failures++;
  console.error('[BUILD FAIL] ' + msg);
}
function ok(msg) {
  console.log('[BUILD OK] ' + msg);
}

/* ---------- 1. 语法检查 src/js ---------- */
function collectJs(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJs(full, acc);
    else if (entry.isFile() && entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const jsFiles = collectJs(path.join(SRC, 'js'), []);
let syntaxOk = 0;
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    syntaxOk++;
  } catch (e) {
    const out = (e.stderr || e.stdout || '').toString();
    fail('语法错误 ' + path.relative(ROOT, f) + ':\n' + out.trim());
  }
}
ok(`语法检查 ${syntaxOk}/${jsFiles.length} 个 JS 文件通过`);

/* ---------- 2. 关键入口校验 ---------- */
const required = [
  'index.html',
  'pages',
  'pages/home.html',
  'js',
  'js/vendor',
  'css'
];
for (const rel of required) {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) fail('缺少必要文件/目录: src/' + rel);
}
if (failures === 0) ok('关键入口文件校验通过');

/* ---------- 3. 拷贝到 dist/ ---------- */
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const dstPath = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(srcPath, dstPath);
    else fs.copyFileSync(srcPath, dstPath);
  }
}
try {
  fs.rmSync(DIST, { recursive: true, force: true });
  copyTree(SRC, DIST);
  ok('已生成静态产物 dist/ (' + jsFiles.length + ' 个 JS + 资源)');
} catch (e) {
  fail('拷贝到 dist/ 失败: ' + e.message);
}

/* ---------- 结果 ---------- */
if (failures > 0) {
  console.error(`\n构建失败：${failures} 项问题`);
  process.exit(1);
}
console.log('\n构建成功 ✅ (artifact: dist/)');
