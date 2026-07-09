/**
 * news-scorer.js — 资讯评分 / 决策纯函数（问题3 基础）
 *
 * - 双导出：浏览器挂到 window（window.NewsScorer），Node 通过 require 引入
 * - 纯函数：不依赖 window / CloudBase / 网络，可被桩测
 * - 硬规则（无论 AI 怎么说）：
 *     !hasSource || tooShort || isAd || isDuplicate → action:'delete'
 *   软维度（权威/可读/广告软分）参与 score 计算但不直接删除（除非命中 isAd）
 *
 * 版本: v1.1 | 2026-07-08
 */
(function(root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window['NewsScorer'] = api;
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  /** 最小长度阈值（低于此长度判定 tooShort） */
  var MIN_CONTENT_LEN = 20;

  /** 广告 / 软文强特征词 */
  var AD_PATTERNS = [
    '限时折扣', '点击购买', '加微信', '扫码购买', '优惠促销', '抢购', '特价', '代购',
    '微信号', '加我微信', '私聊', '下单链接', '免费领取', '立即购买', '推广', '优惠券',
    '秒杀', '返利', '兼职刷单', '加好友', '扫码领', '低价转让', '代运营'
  ];

  /** 高权威域名（示例） */
  var HIGH_AUTHORITY = [
    'arxiv.org', 'wikipedia.org', 'github.com', 'nature.com', 'science.org',
    'ieee.org', 'acm.org', 'bbc.com', 'bbc.co.uk', 'reuters.com', 'nytimes.com',
    'mit.edu', 'stanford.edu', 'edu', 'gov', 'who.int', 'nih.gov', 'nasa.gov'
  ];
  /** 中权威域名（示例） */
  var MID_AUTHORITY = [
    'medium.com', 'zhihu.com', 'juejin.cn', 'infoq.cn', '36kr.com', 'sspai.com',
    'cnblogs.com', 'csdn.net', 'ruanyifeng.com', 'jiqizhixin.com', 'huxiu.com'
  ];

  function toStr(v) { return (v == null) ? '' : String(v); }

  function getDomain(url) {
    var u = toStr(url).trim();
    if (!u) return '';
    try {
      // 兼容无协议的 URL
      var withProto = /^https?:\/\//i.test(u) ? u : 'http://' + u;
      return new URL(withProto).hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  /**
   * 判断文本是否为广告 / 软文推广
   * @param {string} text
   * @returns {boolean}
   */
  function isAdOrPromo(text) {
    if (!text) return false;
    var t = toStr(text).toLowerCase();
    for (var i = 0; i < AD_PATTERNS.length; i++) {
      if (t.indexOf(AD_PATTERNS[i].toLowerCase()) !== -1) return true;
    }
    return false;
  }

  /**
   * 判断 item 是否与已有列表重复（按 sourceUrl 或 归一化标题）
   * @param {Object} item - {sourceUrl?, url?, title?}
   * @param {Array<Object>|Object} existing - 已有资讯列表或单条
   * @returns {boolean}
   */
  function dedupe(item, existing) {
    if (!item) return false;
    var list = Array.isArray(existing) ? existing : (existing ? [existing] : []);
    var url = toStr(item.sourceUrl || item.url).trim();
    var title = toStr(item.title).trim().toLowerCase().replace(/\s+/g, '');
    if (!url && !title) return false;
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      if (url && toStr(e.sourceUrl || e.url).trim() === url) return true;
      var et = toStr(e.title).trim().toLowerCase().replace(/\s+/g, '');
      if (title && et && et === title) return true;
    }
    return false;
  }

  /**
   * 信源权威度评分（0-100）
   * @param {Object} raw - {sourceUrl?, url?, sourceName?}
   * @returns {number}
   */
  function authorityScore(raw) {
    raw = raw || {};
    var domain = getDomain(raw.sourceUrl || raw.url);
    if (!domain) return 40; // 未知域名：中等偏下
    for (var i = 0; i < HIGH_AUTHORITY.length; i++) {
      if (domain === HIGH_AUTHORITY[i] || domain.endsWith('.' + HIGH_AUTHORITY[i]) || domain.endsWith(HIGH_AUTHORITY[i])) {
        return 90;
      }
    }
    for (var j = 0; j < MID_AUTHORITY.length; j++) {
      if (domain === MID_AUTHORITY[j] || domain.endsWith('.' + MID_AUTHORITY[j]) || domain.endsWith(MID_AUTHORITY[j])) {
        return 65;
      }
    }
    return 50;
  }

  /**
   * 可读性分级
   * @param {Object} raw - {content?, summary?, title?}
   * @returns {'high'|'mid'|'low'}
   */
  function classifyReadability(raw) {
    raw = raw || {};
    var text = toStr(raw.content || raw.summary || raw.title);
    var len = text.trim().length;
    if (len >= 200) return 'high';
    if (len >= 60) return 'mid';
    return 'low';
  }

  /** 内容价值维度（0-100） */
  function valueScore(text, isAd) {
    var len = toStr(text).trim().length;
    var s = 0;
    if (len >= 500) s = 85;
    else if (len >= 200) s = 70;
    else if (len >= 60) s = 55;
    else s = 35;
    if (isAd) s = Math.min(s, 20);
    return s;
  }

  /** 主题关联度维度（0-100，默认中等，可由 AI 覆盖） */
  function relatednessScore(raw) {
    raw = raw || {};
    var hasTag = Array.isArray(raw.tags) && raw.tags.length > 0;
    return hasTag ? 70 : 60;
  }

  /** 新鲜度维度（0-100，默认中等） */
  function freshnessScore(raw) {
    raw = raw || {};
    var pub = raw.publishedAt || raw.pubDate || raw.createdAt;
    if (!pub) return 60;
    try {
      var d = new Date(pub);
      if (isNaN(d.getTime())) return 60;
      var days = (Date.now() - d.getTime()) / 86400000;
      if (days <= 1) return 95;
      if (days <= 7) return 80;
      if (days <= 30) return 65;
      if (days <= 180) return 50;
      return 35;
    } catch (e) {
      return 60;
    }
  }

  /** 可转化性维度（0-100） */
  function transformScore(text) {
    var len = toStr(text).trim().length;
    if (len >= 200) return 75;
    if (len >= 60) return 60;
    return 45;
  }

  /**
   * 综合评分（纯规则兜底，AI 结果可覆盖）
   * @param {Object} raw
   * @returns {{score:number, level:string, dims:Object, flags:Object}}
   */
  function evaluateNews(raw) {
    raw = raw || {};
    var text = [raw.title, raw.content, raw.summary].filter(Boolean).join('\n');
    var url = toStr(raw.sourceUrl || raw.url).trim();

    var hasSource = !!url;
    var tooShort = toStr(text).trim().length < MIN_CONTENT_LEN;
    var isAd = isAdOrPromo(text);
    var lowAuthority = authorityScore(raw) < 30;
    var lowReadability = classifyReadability(raw) === 'low';

    var dims = {
      信源: authorityScore(raw),
      价值: valueScore(text, isAd),
      关联: relatednessScore(raw),
      新鲜: freshnessScore(raw),
      可转化: transformScore(text)
    };

    var score = Math.round(
      dims.信源 * 0.2 + dims.价值 * 0.3 + dims.关联 * 0.25 + dims.新鲜 * 0.15 + dims.可转化 * 0.1
    );
    var level = score >= 80 ? 'high' : score >= 60 ? 'mid' : score >= 40 ? 'low' : 'reject';

    var flags = {
      hasSource: hasSource,
      tooShort: tooShort,
      isAd: isAd,
      isDuplicate: false, // 由调用方通过 dedupe() 填充
      lowAuthority: lowAuthority,
      lowReadability: lowReadability
    };

    return { score: score, level: level, dims: dims, flags: flags };
  }

  /**
   * 纯规则决策：是否删除 / 保留（QA 单测核心）
   * @param {{score:number, level:string, flags:Object}} evaluation
   * @param {Object} [raw]
   * @returns {{action:'delete'|'keep', reason:string, score:number, level:string}}
   */
  function decideDisposition(evaluation, raw) {
    evaluation = evaluation || {};
    var f = evaluation.flags || {};
    var score = (typeof evaluation.score === 'number') ? evaluation.score : 0;
    var level = evaluation.level || 'low';

    if (!f.hasSource) return { action: 'delete', reason: 'no-source', score: score, level: level };
    if (f.tooShort) return { action: 'delete', reason: 'too-short', score: score, level: level };
    if (f.isAd) return { action: 'delete', reason: 'ad-promo', score: score, level: level };
    if (f.isDuplicate) return { action: 'delete', reason: 'duplicate', score: score, level: level };

    return { action: 'keep', reason: 'passed', score: score, level: level };
  }

  return {
    evaluateNews: evaluateNews,
    decideDisposition: decideDisposition,
    isAdOrPromo: isAdOrPromo,
    dedupe: dedupe,
    authorityScore: authorityScore,
    classifyReadability: classifyReadability
  };
});
