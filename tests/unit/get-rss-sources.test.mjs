/**
 * get-rss-sources.test.mjs
 * ---------------------------------------------------------------------------
 * 单元测试：db.js 中 getRssSources() 的「数组归一化」逻辑（Issue 修复核心）。
 *
 * 背景：CloudBase 的 .get() 实际返回 result.data 可能是数组，也可能是
 * { data: [...] } / { list: [...] }，甚至普通对象、null、undefined。
 * 旧实现（直接 result.data.forEach）在 result.data 不是数组时会崩溃。
 * getRssSources() 必须把 result.data 归一成数组或空数组 []，保证下游安全。
 *
 * 方案：方案A —— 在 node 下通过全局 window 桩 + mock CloudBase 的 _collection
 * （使 .get() 返回受控的 { data }），直接调用真实的 DB.getRssSources()，
 * 断言 a–e 五个用例全部通过。不 import 真实 CloudBase SDK。
 *
 * 运行：/Users/zouxiaoyong/.workbuddy/binaries/node/versions/22.12.0/bin/node \
 *         tests/unit/get-rss-sources.test.mjs
 *
 * 不修改任何 production 代码（db.js 保持原样）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const DB_PATH = path.join(ROOT, 'src', 'js', 'db.js');

/* --------------------------------------------------------------------------
 * 1. 准备浏览器全局桩，使 db.js（经典脚本，结尾 window.DB = DB）可在 node 加载
 * ------------------------------------------------------------------------ */
globalThis.window = globalThis.window || {};
// _collection 内部会读 window.db，但我们将直接 mock _collection，这里给个占位即可。
globalThis.window.db = globalThis.window.db || {};

/* --------------------------------------------------------------------------
 * 2. 加载 db.js（间接 eval 在全局作用域执行，结尾 window.DB = DB 暴露对象）
 * ------------------------------------------------------------------------ */
const code = fs.readFileSync(DB_PATH, 'utf8');
(0, eval)(code); // 间接 eval：非严格全局作用域

const DB = globalThis.window.DB;
if (!DB || typeof DB.getRssSources !== 'function') {
  console.error('❌ 加载 db.js 失败：window.DB.getRssSources 不存在');
  process.exitCode = 1;
  // 不抛未捕获异常，按失败退出
  throw new Error('db.js 加载失败');
}

/* --------------------------------------------------------------------------
 * 3. mock CloudBase 的 _collection：返回一个可链式调用且 .get() 返回受控数据的桩
 * ------------------------------------------------------------------------ */
function installCollectionStub(controlledData) {
  DB._collection = function () {
    const stub = {
      orderBy: () => stub,
      get: () => Promise.resolve({ data: controlledData }),
    };
    return stub;
  };
}

/* --------------------------------------------------------------------------
 * 4. 简易断言收集器
 * ------------------------------------------------------------------------ */
let passed = 0;
let failed = 0;
const failures = [];

function check(condition, msg) {
  if (condition) {
    passed++;
    console.log('  ✅ ' + msg);
  } else {
    failed++;
    failures.push(msg);
    console.log('  ❌ ' + msg);
  }
}

function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, msg + `（期望 ${e}，实际 ${a}）`);
}

/* --------------------------------------------------------------------------
 * 5. 执行用例 a–e
 * ------------------------------------------------------------------------ */
async function runTests() {
  console.log('\n=== getRssSources 数组归一化测试 ===\n');

  // 用例 a) result.data 为数组 → 原样返回该数组
  {
    const arr = [{ url: 'https://a.com' }, { url: 'https://b.com' }];
    installCollectionStub(arr);
    const res = await DB.getRssSources();
    console.log('用例 a) result.data 为数组');
    eq(res.success, true, '  - 返回 success=true');
    check(res.data === arr, '  - 返回原数组引用（同一数组）');
    eq(res.data, arr, '  - 数组内容与原样一致');
  }

  // 用例 b) result.data 为 { data: [...] } → 返回内层数组
  {
    const inner = [{ url: 'https://c.com' }];
    installCollectionStub({ data: inner });
    const res = await DB.getRssSources();
    console.log('用例 b) result.data 为 { data: [...] }');
    eq(res.success, true, '  - 返回 success=true');
    check(res.data === inner, '  - 返回内层 data 数组引用');
    eq(res.data, inner, '  - 内容等于内层数组');
  }

  // 用例 c) result.data 为 { list: [...] } → 返回内层数组
  {
    const inner = [{ url: 'https://d.com' }];
    installCollectionStub({ list: inner });
    const res = await DB.getRssSources();
    console.log('用例 c) result.data 为 { list: [...] }');
    eq(res.success, true, '  - 返回 success=true');
    check(res.data === inner, '  - 返回内层 list 数组引用');
    eq(res.data, inner, '  - 内容等于内层数组');
  }

  // 用例 d) result.data 为普通对象（如 { a: 1 }） → 返回 []
  {
    installCollectionStub({ a: 1 });
    const res = await DB.getRssSources();
    console.log('用例 d) result.data 为普通对象 { a: 1 }');
    eq(res.success, true, '  - 返回 success=true');
    eq(res.data, [], '  - 普通对象归一成空数组 []');
  }

  // 用例 e-1) result.data 为 null → 返回 []
  {
    installCollectionStub(null);
    const res = await DB.getRssSources();
    console.log('用例 e-1) result.data 为 null');
    eq(res.success, true, '  - 返回 success=true');
    eq(res.data, [], '  - null 归一成空数组 []');
  }

  // 用例 e-2) result.data 为 undefined → 返回 []
  {
    installCollectionStub(undefined);
    const res = await DB.getRssSources();
    console.log('用例 e-2) result.data 为 undefined');
    eq(res.success, true, '  - 返回 success=true');
    eq(res.data, [], '  - undefined 归一成空数组 []');
  }

  // 附加用例：深层嵌套但非数组，应安全归一成 []（回归下游 forEach 不崩）
  {
    installCollectionStub({ data: 'not-an-array', list: 42 });
    const res = await DB.getRssSources();
    console.log('附加) result.data 为 { data: 非数组, list: 非数组 }');
    eq(res.data, [], '  - 非数组字段安全归一成空数组 []（不会返回字符串/数字）');
  }
}

runTests()
  .then(() => {
    console.log('\n========================================');
    console.log(`测试结果：通过 ${passed} 项，失败 ${failed} 项`);
    if (failed > 0) {
      console.log('失败项：');
      for (const f of failures) console.log('  - ' + f);
      process.exitCode = 1;
    } else {
      console.log('✅ 全部用例通过');
    }
    console.log('========================================\n');
  })
  .catch((err) => {
    console.error('❌ 测试执行异常：', err);
    process.exitCode = 1;
  });
