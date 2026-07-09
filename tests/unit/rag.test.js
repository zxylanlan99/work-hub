/**
 * rag.test.js — RAG 纯函数单元测试（问题2 基础）
 * 直接 require 双导出模块，无需浏览器。
 * 运行：node --test tests/unit/
 */
const { test } = require('node:test');
const RAG = require('../../src/js/rag.js');

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

test('rag.test.js — RAG 纯函数', async () => {
  /* ---------- shouldUseRAG ---------- */
  check('shouldUseRAG learning-coach=true', RAG.shouldUseRAG('learning-coach') === true);
  check('shouldUseRAG review-coach=true', RAG.shouldUseRAG('review-coach') === true);
  check('shouldUseRAG kb-butler=true', RAG.shouldUseRAG('kb-butler') === true);
  check('shouldUseRAG news-butler=true', RAG.shouldUseRAG('news-butler') === true);
  check('shouldUseRAG general=false', RAG.shouldUseRAG('general') === false);
  check('shouldUseRAG 未知=false', RAG.shouldUseRAG('some-unknown-agent') === false);

  /* ---------- needsWebFallback ---------- */
  check('needsWebFallback []=>true', RAG.needsWebFallback([]) === true);
  check('needsWebFallback [{sim:0.1}]=>true', RAG.needsWebFallback([{ similarity: 0.1 }]) === true);
  check('needsWebFallback [{sim:0.9}]=>false', RAG.needsWebFallback([{ similarity: 0.9 }]) === false);
  check('needsWebFallback {data:[{score:0.05}]}=>true', RAG.needsWebFallback({ data: [{ score: 0.05 }] }) === true);
  check('needsWebFallback {data:[{score:0.85}]}=>false', RAG.needsWebFallback({ data: [{ score: 0.85 }] }) === false);

  /* ---------- formatRAGContext ---------- */
  const kb = [{ content: 'KB内容A', source: 'src1' }];
  const web = [{ content: 'WEB内容B', source: 'src2' }];
  const both = RAG.formatRAGContext(kb, web);
  check('formatRAGContext 含 知识库参考内容', both.indexOf('知识库参考内容') !== -1, both);
  check('formatRAGContext 含 全网检索补充内容', both.indexOf('全网检索补充内容') !== -1, both);
  check('formatRAGContext KB 出现在 WEB 之前',
    both.indexOf('知识库参考内容') < both.indexOf('全网检索补充内容'));
  const kbOnly = RAG.formatRAGContext(kb, null);
  check('formatRAGContext web=null 只含KB',
    kbOnly.indexOf('知识库参考内容') !== -1 && kbOnly.indexOf('全网检索补充内容') === -1, kbOnly);

  /* ---------- retrieveContext：先 KB 后 web 兜底 ---------- */
  // 场景1：KB 为空 → 必须调 searchWeb 一次，结果含 web 内容
  let webCalls1 = 0;
  const deps1 = {
    DB: {
      searchKnowledgeChunks: async () => [],
      searchWeb: async () => { webCalls1++; return [{ content: 'WEB结果X', source: 'w' }]; }
    }
  };
  const r1 = await RAG.retrieveContext('learning-coach', 'q', deps1);
  check('retrieveContext KB空→searchWeb调用1次', webCalls1 === 1, 'calls=' + webCalls1);
  check('retrieveContext KB空→结果含web内容', r1.indexOf('WEB结果X') !== -1, r1);

  // 场景2：KB 命中（sim>=0.3）→ searchWeb 不被调用，结果含 KB 内容
  let webCalls2 = 0;
  const deps2 = {
    DB: {
      searchKnowledgeChunks: async () => [{ similarity: 0.9, content: 'KB结果Y' }],
      searchWeb: async () => { webCalls2++; return [{ content: 'WEB结果Z' }]; }
    }
  };
  const r2 = await RAG.retrieveContext('learning-coach', 'q', deps2);
  check('retrieveContext KB命中→searchWeb不被调用', webCalls2 === 0, 'calls=' + webCalls2);
  check('retrieveContext KB命中→结果含KB内容', r2.indexOf('KB结果Y') !== -1, r2);

  /* ---------- 汇总 ---------- */
  const failed = results.filter(r => !r.pass);
  console.log(`\n[SUMMARY] rag.test.js: ${results.length} 断言 | 通过 ${results.length - failed.length} | 失败 ${failed.length}`);
  if (failed.length) {
    failed.forEach(f => console.log('  - FAIL: ' + f.name + (f.detail ? ' (' + f.detail + ')' : '')));
    throw new Error(`${failed.length} 断言失败 (rag.test.js)`);
  }
});
