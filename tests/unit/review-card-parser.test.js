/**
 * review-card-parser.test.js — 复习卡片解析纯函数单元测试（问题4 基础）
 * 直接 require 双导出模块，无需浏览器。
 * 运行：node --test tests/unit/
 */
const { test } = require('node:test');
const RCP = require('../../src/js/review-card-parser.js');

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

test('review-card-parser.test.js — 复习卡片解析', async () => {
  /* 1. 裸 JSON 数组 */
  const a = RCP.parseReviewCards('[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2"}]');
  check('裸JSON数组 长度=2', a.length === 2, 'len=' + a.length);
  check('裸JSON数组 front/back 正确', a[0].front === 'Q1' && a[0].back === 'A1');
  check('裸JSON数组 question/answer 正确', a[0].question === 'Q1' && a[0].answer === 'A1');
  check('裸JSON数组 type 默认 open', a[0].type === 'open', 'type=' + (a[0] && a[0].type));

  /* 2. ```json 代码块 */
  const b = RCP.parseReviewCards('```json\n[{"question":"q","answer":"a"}]\n```');
  check('代码块 长度=1', b.length === 1, 'len=' + b.length);

  /* 3. {cards:[...]} 包裹 */
  const c = RCP.parseReviewCards('{"cards":[{"question":"q","answer":"a"}]}');
  check('{cards} 包裹 长度=1', c.length === 1, 'len=' + c.length);

  /* 4. 单对象 */
  const d = RCP.parseReviewCards('{"question":"q","answer":"a"}');
  check('单对象 长度=1', d.length === 1, 'len=' + d.length);

  /* 5. 完全不是 JSON */
  const e = RCP.parseReviewCards('完全不是json');
  check('非JSON→[]', Array.isArray(e) && e.length === 0, 'result=' + JSON.stringify(e));

  /* 6. 空问答被过滤 */
  const f = RCP.parseReviewCards('[{"question":"","answer":""}]');
  check('空问答过滤→[]', Array.isArray(f) && f.length === 0, 'result=' + JSON.stringify(f));

  /* ---------- 汇总 ---------- */
  const failed = results.filter(r => !r.pass);
  console.log(`\n[SUMMARY] review-card-parser.test.js: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach(ff => console.log('  - FAIL: ' + ff.name + (ff.detail ? ' (' + ff.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (review-card-parser.test.js)`);
  }
});
