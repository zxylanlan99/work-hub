/**
 * rag.js — 知识库 RAG 检索纯函数（问题2 基础）
 *
 * - 双导出：浏览器挂到 window（window.RAG），Node 通过 require 引入
 * - 纯函数，不依赖 window / CloudBase / 网络；DB 通过 deps 注入便于桩测
 * - retrieveContext(agentId, query, deps)：deps.DB 注入 searchKnowledgeChunks / searchWeb
 *
 * 版本: v1.1 | 2026-07-08
 */
(function(root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window['RAG'] = api;
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  /** 默认走 RAG 检索的智能体白名单 */
  var RAG_AGENTS = {
    'learning-coach': true,
    'review-coach': true,
    'kb-butler': true,
    'news-butler': true,
    'general': false
  };

  /**
   * 该智能体是否启用 RAG（先 KB 后 web）
   * 可由全局 CONFIG.rag.forceAgents 覆盖
   * @param {string} agentId
   * @returns {boolean}
   */
  function shouldUseRAG(agentId) {
    // CONFIG 覆盖优先
    if (typeof CONFIG !== 'undefined' && CONFIG.rag && CONFIG.rag.forceAgents &&
        typeof CONFIG.rag.forceAgents === 'object' && agentId in CONFIG.rag.forceAgents) {
      return !!CONFIG.rag.forceAgents[agentId];
    }
    return RAG_AGENTS[agentId] === true;
  }

  /** 统一把 KB/web 返回结果规整为数组 */
  function normalizeChunks(chunks) {
    if (!chunks) return [];
    if (Array.isArray(chunks)) return chunks;
    if (Array.isArray(chunks.data)) return chunks.data;
    if (Array.isArray(chunks.results)) return chunks.results;
    return [];
  }

  /** 取相似度（兼容 similarity / score 字段） */
  function getSim(item) {
    if (!item || typeof item !== 'object') return 0;
    if (typeof item.similarity === 'number') return item.similarity;
    if (typeof item.score === 'number') return item.score;
    return 0;
  }

  /**
   * 判断是否需要 web 兜底：KB 为空 / 无有效命中 / 平均相似度过低 → true
   * @param {Array|Object} kbChunks - 原始 KB 返回（可能是 {data:[...]} 或数组）
   * @param {{minSim?:number, topK?:number}} [opts]
   * @returns {boolean}
   */
  function needsWebFallback(kbChunks, opts) {
    opts = opts || {};
    var minSim = (typeof opts.minSim === 'number') ? opts.minSim : 0.3;
    var list = normalizeChunks(kbChunks);
    if (list.length === 0) return true;

    var valid = list.filter(function(c) { return getSim(c) >= minSim; });
    // 有效条数为 0（低于阈值）→ 需要兜底
    if (valid.length === 0) return true;

    var sum = valid.reduce(function(s, c) { return s + getSim(c); }, 0);
    var avg = sum / valid.length;
    if (avg < minSim) return true;

    return false;
  }

  /**
   * 格式化 RAG 上下文文本（KB 在前，web 在后）
   * @param {Array|Object} kbChunks
   * @param {Array|Object} [webChunks]
   * @returns {string}
   */
  function formatRAGContext(kbChunks, webChunks) {
    var kb = normalizeChunks(kbChunks);
    var web = normalizeChunks(webChunks);

    var out = '';
    if (kb.length) {
      out += '## 知识库参考内容\n';
      kb.forEach(function(c, i) {
        var text = c.content || c.text || c.chunk || '';
        var src = c.source || c.title || c.sourceUrl || '';
        out += '[KB' + (i + 1) + '] ' + (src ? '(' + src + ') ' : '') + text + '\n';
      });
      out += '\n';
    }
    if (web.length) {
      out += '## 全网检索补充内容\n';
      web.forEach(function(c, i) {
        var text = c.content || c.text || c.snippet || '';
        var src = c.source || c.title || c.url || c.sourceUrl || '';
        out += '[WEB' + (i + 1) + '] ' + (src ? '(' + src + ') ' : '') + text + '\n';
      });
    }
    return out.trim();
  }

  /**
   * 前端纯函数智能分块器（C4 验收：离线可验证分块 + 暴露 chunkCount）
   *
   * 与后端 backend/chunker.py 的切分策略保持一致思路：
   * - 先按段落（空行分隔）切分；
   * - 单段超过 maxChunkSize 时，再按句子（中英文标点）二次切分；
   * - 相邻 chunk 以 overlap 个字符重叠，保证语义连贯；
   * - 极端无标点超长文本，最终以 maxChunkSize 硬截断兜底。
   *
   * 返回 { chunks: string[], chunkCount: number }，
   * 每个 chunk 长度不超过 maxChunkSize。
   *
   * @param {string} text - 待分块文本（可含多个段落，以空行分隔）
   * @param {{maxChunkSize?:number, overlap?:number}} [opts]
   *   maxChunkSize 默认 500；overlap 默认 50（相邻重叠字符数）
   * @returns {{chunks:string[], chunkCount:number}}
   */
  function intelligentChunk(text, opts) {
    opts = opts || {};
    var maxChunkSize = (typeof opts.maxChunkSize === 'number' && opts.maxChunkSize > 0) ? opts.maxChunkSize : 500;
    var overlap = (typeof opts.overlap === 'number' && opts.overlap >= 0) ? opts.overlap : 50;

    if (!text || !String(text).trim()) {
      return { chunks: [], chunkCount: 0 };
    }

    // 1. 按段落切分（兼容 \n\n 与单换行混排）
    var rawParas = String(text).split(/\n\s*\n/);
    var paragraphs = [];
    for (var pi = 0; pi < rawParas.length; pi++) {
      var trimmed = rawParas[pi].trim();
      if (trimmed) paragraphs.push(trimmed);
    }
    if (paragraphs.length === 0) paragraphs = [String(text).trim()];

    // 按句子切分（中英文标点，保留标点）
    function splitSentences(p) {
      var parts = p.match(/[^。！？!?]+[。！？!?]?/g);
      if (!parts) return [p];
      var sents = [];
      for (var i = 0; i < parts.length; i++) {
        var s = parts[i].trim();
        if (s) sents.push(s);
      }
      return sents.length ? sents : [p];
    }

    var chunks = [];
    var current = '';
    for (var i = 0; i < paragraphs.length; i++) {
      var para = paragraphs[i];
      if (para.length > maxChunkSize) {
        // 超长段落：先 flush 当前累积块
        if (current.trim()) { chunks.push(current.trim()); current = ''; }
        var sents = splitSentences(para);
        for (var j = 0; j < sents.length; j++) {
          var sent = sents[j];
          if ((current + sent).length > maxChunkSize && current.trim()) {
            chunks.push(current.trim());
            current = overlap ? current.slice(-overlap) : '';
          }
          current += (current.trim() ? '' : '') + sent;
        }
      } else if ((current + '\n\n' + para).length > maxChunkSize && current.trim()) {
        chunks.push(current.trim());
        current = overlap ? (current.slice(-overlap) + '\n\n' + para) : para;
      } else {
        current += (current.trim() ? '\n\n' : '') + para;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    // 2. 兜底：极端无标点超长块，硬截断到 maxChunkSize
    var finalChunks = [];
    for (var k = 0; k < chunks.length; k++) {
      var c = chunks[k];
      if (c.length <= maxChunkSize) {
        finalChunks.push(c);
        continue;
      }
      for (var off = 0; off < c.length; off += maxChunkSize) {
        finalChunks.push(c.substring(off, off + maxChunkSize));
      }
    }

    return { chunks: finalChunks, chunkCount: finalChunks.length };
  }

  /**
   * 检索上下文：先 KB，命中不足再 web 兜底，最后拼成文本
   * @param {string} agentId - 智能体 ID（用于判断是否启用 RAG）
   * @param {string} query - 用户查询
   * @param {{DB:Object, cfg?:Object}} deps - 注入依赖（DB 必须提供 searchKnowledgeChunks / searchWeb）
   * @returns {Promise<string>} 拼装好的上下文文本（空串表示无内容）
   */
  async function retrieveContext(agentId, query, deps) {
    deps = deps || {};
    var DB = deps.DB;
    if (!DB || typeof DB.searchKnowledgeChunks !== 'function') return '';

    var cfg = deps.cfg ||
      ((typeof CONFIG !== 'undefined' && CONFIG.kbBackend) || {});
    var topK = cfg.searchTopK || 10;
    var minSim = cfg.minSimilarity || 0.3;

    var kb = await DB.searchKnowledgeChunks(query, topK, minSim);

    if (needsWebFallback(kb, { minSim: minSim })) {
      if (typeof DB.searchWeb === 'function') {
        var web = await DB.searchWeb(query, topK);
        return formatRAGContext(kb, web);
      }
    }
    return formatRAGContext(kb, null);
  }

  return {
    shouldUseRAG: shouldUseRAG,
    needsWebFallback: needsWebFallback,
    formatRAGContext: formatRAGContext,
    retrieveContext: retrieveContext,
    // 前端纯函数智能分块器（C4 验收）：优先远端 /api/knowledge/chunk-text，
    // 离线或远端失败时由 importNewsToKnowledge 调用本地 intelligentChunk 兜底。
    intelligentChunk: intelligentChunk,
    chunkText: intelligentChunk
  };
});
