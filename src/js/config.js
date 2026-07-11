/**
 * StudyMind 全局配置
 * - 增加统一模型配置 AI_MODEL（硬约束：所有 LLM 调用统一使用 Hy3）
 * - 增加 RAG / 聊天持久化相关配置
 * 版本: v1.1 | 日期: 2026-07-08
 */

const CONFIG = {
  cloudbase: {
    env: 'studymind-d7g06nv0de98a1f1b',
    region: 'ap-shanghai'
  },
  // 知识库后端 (Python FastAPI + ChromaDB + all-MiniLM-L6-v2)
  kbBackend: {
    baseURL: 'http://localhost:8765',
    // 搜索默认参数
    searchTopK: 10,
    minSimilarity: 0.3
  },
  // 资讯爬虫后端 (CloudBase Python 云函数 news-crawler，仅标准库，含 SSRF 防护 + filter_news_items)
  // 部署后由部署脚本/人工填入线上 HTTP 访问地址；为空时回退到 kbBackend（本地开发）。
  // 【E2E 联调约定】本地开发/QA 联调时，让爬虫打到本地 FastAPI 的 action 分发器 /api/news，二选一：
  //   1)（推荐）运行时注入 window.__STUDYMINDCONFIG__ = { crawlerBackend: { baseURL: 'http://localhost:8765/api/news' } }；
  //   2) 或直接把下方 baseURL 改为 'http://localhost:8765/api/news'。
  // 说明：前端 _crawlerBackendURL() 会对"指向本地 FastAPI 的地址"自动追加 /api/news，
  // 因此 baseURL 写成 'http://localhost:8765' 也会被补全为 'http://localhost:8765/api/news'。
  crawlerBackend: {
    baseURL: 'https://studymind-d7g06nv0de98a1f1b.service.tcloudbase.com/news-crawler'
  },
  // 统一模型（硬约束）：所有 AI 调用默认走 Hy3
  ai: {
    model: 'Hy3'
  },
  // RAG 开关：覆盖 shouldUseRAG 的 agent 白名单（可选）
  rag: {
    // 例：{ 'general': true } 可让通用助手也走 KB 检索
    forceAgents: null
  },
  // 聊天会话持久化 key
  chatPersistenceKeys: {
    agent: 'studymind.chat.agent',
    current: 'studymind.chat.current'
  }
};

/**
 * 全局统一模型标识。所有 callAI / _aiProxy 的缺省模型。
 * 同时挂到 window，便于页面与双导出模块在浏览器环境读取。
 * @type {string}
 */
const AI_MODEL = (CONFIG.ai && CONFIG.ai.model) || 'Hy3';

/* 同时暴露到 window 与 CommonJS（便于浏览器页面与 Node 单测复用） */
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
  window.AI_MODEL = AI_MODEL;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG: CONFIG, AI_MODEL: AI_MODEL };
}
