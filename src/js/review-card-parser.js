/**
 * review-card-parser.js — 复习卡片解析纯函数（问题4 基础）
 *
 * - 双导出：浏览器挂到 window（window.ReviewCardParser），Node 通过 require 引入
 * - 兼容多种 AI 返回格式：裸 JSON 数组 / {cards:[...]} / ```json 代码块 / 多张
 * - 解析失败返回 []（不抛异常）
 *
 * 版本: v1.1 | 2026-07-08
 */
(function(root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window['ReviewCardParser'] = api;
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  /**
   * 从 AI 文本中解析复习卡片数组
   * @param {string} aiText - AI 返回的原始文本
   * @returns {Array<{front:string, back:string, question:string, answer:string, type:string, hint:string}>}
   */
  function parseReviewCards(aiText) {
    if (!aiText || typeof aiText !== 'string') return [];

    var text = aiText.trim();

    // 1. 剥离 markdown 代码块（```json ... ``` 或 ``` ... ```）
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1]) text = fence[1].trim();

    // 2. 尝试直接 JSON.parse
    var data = safeParse(text);

    // 3. 直接 parse 失败，尝试提取首个 [...] 或 {...}
    if (data === null) {
      var arrMatch = text.match(/\[[\s\S]*\]/);
      var objMatch = text.match(/\{[\s\S]*\}/);
      var candidate = arrMatch ? arrMatch[0] : (objMatch ? objMatch[0] : null);
      if (candidate) data = safeParse(candidate);
    }

    if (data === null) return [];

    // 4. 规整为卡片数组
    var list = null;
    if (Array.isArray(data)) {
      list = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.cards)) list = data.cards;
      else if (Array.isArray(data.cardList)) list = data.cardList;
      else if (data.front || data.back || data.question || data.answer || data.q || data.a) {
        // 单张卡对象
        list = [data];
      }
    }
    if (!list) return [];

    return list.map(function(item) {
      if (!item || typeof item !== 'object') return null;
      var question = toStr(item.question || item.front || item.q || '');
      var answer = toStr(item.answer || item.back || item.a || '');
      if (!question && !answer) return null;
      return {
        front: question,
        back: answer,
        question: question,
        answer: answer,
        type: toStr(item.type || item.questionType || 'open'),
        hint: toStr(item.hint || '')
      };
    }).filter(Boolean);
  }

  function safeParse(s) {
    try {
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  }

  function toStr(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { return JSON.stringify(v); } catch (e) { return ''; }
  }

  return {
    parseReviewCards: parseReviewCards
  };
});
