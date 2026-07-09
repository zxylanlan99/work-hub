/**
 * news-scorer.test.js — 资讯评分/决策纯函数单元测试（问题3 基础）
 * 直接 require 双导出模块，无需浏览器。
 * 运行：node --test tests/unit/
 */
const { test } = require('node:test');
const NS = require('../../src/js/news-scorer.js');

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

test('news-scorer.test.js — 资讯评分/决策纯函数', async () => {
  /* ---------- decideDisposition：硬规则（无来源即删） ---------- */
  const dNoSrc = NS.decideDisposition({ flags: { hasSource: false } });
  check('decideDisposition 无来源→delete/no-source', dNoSrc.action === 'delete' && dNoSrc.reason === 'no-source', JSON.stringify(dNoSrc));

  const dShort = NS.decideDisposition({ flags: { tooShort: true, hasSource: true } });
  check('decideDisposition 过短→delete/too-short', dShort.action === 'delete' && dShort.reason === 'too-short', JSON.stringify(dShort));

  const dAd = NS.decideDisposition({ flags: { isAd: true, hasSource: true } });
  check('decideDisposition 广告→delete/ad-promo', dAd.action === 'delete' && dAd.reason === 'ad-promo', JSON.stringify(dAd));

  const dDup = NS.decideDisposition({ flags: { isDuplicate: true, hasSource: true } });
  check('decideDisposition 重复→delete/duplicate', dDup.action === 'delete' && dDup.reason === 'duplicate', JSON.stringify(dDup));

  const dKeep = NS.decideDisposition({ flags: { hasSource: true } });
  check('decideDisposition 有来源且正常→keep', dKeep.action === 'keep' && dKeep.reason === 'passed', JSON.stringify(dKeep));

  /* ---------- evaluateNews ---------- */
  const ev = NS.evaluateNews({ title: '标题', content: '足够长的正文内容 xxxxxxxxxx', sourceUrl: 'http://a.com/x' });
  check('evaluateNews 返回数值 score', typeof ev.score === 'number', 'score=' + ev.score);
  check('evaluateNews flags.hasSource=true', ev.flags.hasSource === true);

  /* ---------- isAdOrPromo ---------- */
  check('isAdOrPromo 含广告词→true', NS.isAdOrPromo('点击购买 限时折扣') === true);
  check('isAdOrPromo 正常文→false', NS.isAdOrPromo('正常技术文章') === false);

  /* ---------- dedupe ---------- */
  check('dedupe 相同 sourceUrl→true', NS.dedupe({ sourceUrl: 'http://a.com/x' }, { sourceUrl: 'http://a.com/x' }) === true);
  check('dedupe 相同 title→true', NS.dedupe({ title: '相同标题' }, { title: '相同标题' }) === true);
  check('dedupe 不同→false', NS.dedupe({ sourceUrl: 'http://a.com/x' }, { sourceUrl: 'http://b.com/y' }) === false);

  /* ---------- authorityScore ---------- */
  check('authorityScore arxiv.org=90', NS.authorityScore({ sourceUrl: 'https://arxiv.org' }) === 90);
  const unknownAuth = NS.authorityScore({ sourceUrl: 'https://unknown-site-xyz.com' });
  check('authorityScore 未知域名>0', unknownAuth > 0, 'value=' + unknownAuth);

  /* ---------- 汇总 ---------- */
  const failed = results.filter(r => !r.pass);
  console.log(`\n[SUMMARY] news-scorer.test.js: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach(f => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (news-scorer.test.js)`);
  }
});
