/**
 * chat-session.js — 聊天会话状态单例 + localStorage 持久化（问题1 基础）
 *
 * 设计要点：
 * - 双导出：浏览器挂到 window，Node 通过 require 引入（便于 QA 桩测）
 * - 不依赖 window / CloudBase / 网络 即可被 require（localStorage 仅在函数体内访问）
 * - 单例在浏览器环境以 window.__chatState 为准（framework.js 重复执行内联脚本也不会重置）
 *
 * 版本: v1.1 | 2026-07-08
 */
(function(root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window['ChatSession'] = api;
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var _state = null; // Node / 无 window 环境下的模块级单例

  function defaultState() {
    return {
      currentChatId: null,
      currentModel: (typeof AI_MODEL !== 'undefined' && AI_MODEL) ? AI_MODEL : null,
      currentAgent: 'general',
      inflightCount: 0,
      conversations: [],
      pendingFiles: [],
      selectedKnowledgeIds: []
    };
  }

  function getStoreKey(name) {
    var keys = (typeof CONFIG !== 'undefined' && CONFIG.chatPersistenceKeys) || {};
    if (name === 'agent') return keys.agent || 'studymind.chat.agent';
    if (name === 'current') return keys.current || 'studymind.chat.current';
    return 'studymind.chat.' + name;
  }

  /**
   * 获取跨挂载单例（浏览器：window.__chatState；Node：模块级单例）
   * @returns {Object}
   */
  function getChatState() {
    if (typeof window !== 'undefined') {
      if (!window.__chatState) {
        window.__chatState = defaultState();
      }
      return window.__chatState;
    }
    if (!_state) _state = defaultState();
    return _state;
  }

  /**
   * 从 localStorage 读取持久化的会话（不依赖单例当前值）
   * @returns {{currentAgent:string, currentChatId:?string}}
   */
  function loadChatSession() {
    var agent = 'general';
    var currentChatId = null;
    try {
      if (typeof localStorage !== 'undefined') {
        agent = localStorage.getItem(getStoreKey('agent')) || 'general';
        currentChatId = localStorage.getItem(getStoreKey('current')) || null;
      }
    } catch (e) {
      /* localStorage 不可用时静默降级 */
    }
    return { currentAgent: agent, currentChatId: currentChatId };
  }

  /**
   * 持久化会话到 localStorage，并同步单例
   * @param {{currentAgent?:string, currentChatId:?string}} sess
   * @returns {boolean}
   */
  function saveChatSession(sess) {
    sess = sess || {};
    try {
      if (typeof localStorage !== 'undefined') {
        if (sess.currentAgent) localStorage.setItem(getStoreKey('agent'), sess.currentAgent);
        if (sess.currentChatId !== undefined && sess.currentChatId !== null) {
          localStorage.setItem(getStoreKey('current'), sess.currentChatId);
        } else if (sess.currentChatId === null) {
          localStorage.removeItem(getStoreKey('current'));
        }
      }
    } catch (e) {
      /* 忽略写入异常 */
    }
    // 同步单例
    var st = getChatState();
    if (sess.currentAgent) st.currentAgent = sess.currentAgent;
    if (sess.currentChatId !== undefined) st.currentChatId = sess.currentChatId;
    return true;
  }

  /**
   * 恢复会话：读 localStorage → 写回单例 → 返回单例
   * @returns {Object}
   */
  function restoreChatSession() {
    var saved = loadChatSession();
    var st = getChatState();
    st.currentAgent = saved.currentAgent || 'general';
    st.currentChatId = saved.currentChatId || null;
    return st;
  }

  return {
    getChatState: getChatState,
    loadChatSession: loadChatSession,
    saveChatSession: saveChatSession,
    restoreChatSession: restoreChatSession
  };
});
