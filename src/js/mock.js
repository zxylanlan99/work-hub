/**
 * StudyMind Mock Data (Minimal Stub)
 * 提供空的 mockData 结构，防止页面内联脚本因引用 mockData 而崩溃
 * 各页面应逐步迁移到使用 window.DB 真实接口
 * 版本: v2.0 | 日期: 2026-06-21
 */
window.mockData = {
  home: {
    heatmap: [],
    weeklyStats: { studyHours: 0, taskCompleted: 0, reviewCount: 0, streak: 0 },
    todayTasks: [],
    reviewDue: 0,
    newsUnread: 0
  },
  aiChat: {
    conversations: [],
    messages: [],
    models: [],
    usage: { monthlyCost: 0, monthlyBudget: 20 }
  },
  review: {
    currentQueue: [],
    relatedCards: [],
    riskCards: [],
    history: [],
    heatmapData: [],
    masteryTrend: [],
    overview: { total: 0, due: 0, mastered: 0, risk: 0 },
    stats: { weakTopics: [], masteryDist: [] }
  },
  output: {
    docs: [],
    scraps: [],
    stats: { docCount: 0, scrapCount: 0, publishedCount: 0 },
    materials: []
  },
  news: {
    items: [],
    imported: [],
    ignored: [],
    stats: { total: 0, todayProcessed: 0, todayPending: 0, todayImported: 0, todayIgnored: 0, unread: 0, imported: 0 }
  },
  knowledge: {
    items: [],
    aiItems: [],
    trashItems: [],
    categories: []
  }
};
