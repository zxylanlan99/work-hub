/**
 * StudyMind 资讯模块
 * 对应 DB 服务层 news 模块 (13 逻辑接口)
 * 版本: v2.0 | 日期: 2026-06-16
 */

/* ================================================================
   状态管理
   ================================================================ */

/* 【修复】const 不挂载到 window，内联脚本无法访问，改用 var */
var newsState = {
  mainTab: 'recommend',       // 'recommend' | 'history' | 'stats'
  recSubTab: 'all',           // 'all' | 'high' | 'mid' | 'low' | 'ignored'
  historySubTab: 'imported',  // 'imported' | 'ignored' | 'trash'
  batchMode: false,
  selectedIds: new Set(),
  currentPreviewId: null,
  currentImportId: null,
  currentItems: [],           // 缓存当前渲染的 items，供全选/批量操作使用
  currentTab: 'recommend',
  currentPage: 1,
  pageSize: 20
};

/* ================================================================
   辅助函数
   ================================================================ */

function showToast(message, type = 'info') {
  if (window.utils && window.utils.toast) {
    window.utils.toast(message, type);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;z-index:9999;animation:slideIn 0.3s;';
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  toast.style.background = colors[type] || colors.info;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatShortDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/* ================================================================
   主入口 - initNewsPage
   ================================================================ */

async function initNewsPage() {
  try {
    if (window.DB && window.DB.init) {
      await window.DB.init();
    } else {
      await initCloudbase();
    }
    await loadNewsStats();
    await loadNewsList();
    bindEvents();
  } catch (error) {
    console.error('资讯页面初始化失败:', error);
    showToast('页面初始化失败，请刷新重试', 'error');
  }
}

function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', switchTab);
  });

  const addBtn = document.getElementById('add-news-btn');
  if (addBtn) addBtn.addEventListener('click', addManualNews);

  const refreshBtn = document.getElementById('refresh-news-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadNewsList());

  const crawlBtn = document.getElementById('crawl-news-btn');
  if (crawlBtn) crawlBtn.addEventListener('click', startDailyCrawl);
}

/* ================================================================
   资讯统计 — AGG-014
   ================================================================ */

async function loadNewsStats() {
  try {
    const result = window.DB
      ? await window.DB.getNewsOverviewStats()
      : { success: true, data: { unread: 0, total: 0, imported: 0 } };

    if (result.success && result.data) {
      const unreadEl = document.getElementById('unread-count');
      const readEl = document.getElementById('read-count');
      const importedEl = document.getElementById('imported-count');
      if (unreadEl) unreadEl.textContent = result.data.unread || 0;
      if (readEl) readEl.textContent = (result.data.total || 0) - (result.data.unread || 0);
      if (importedEl) importedEl.textContent = result.data.imported || 0;
    }
  } catch (error) {
    console.error('加载资讯统计失败:', error);
  }
}

/* ================================================================
   加载资讯列表 — DB-R-027 / DB-R-028
   ================================================================ */

async function loadNewsList() {
  const list = document.getElementById('news-list');
  if (!list) return;

  // 显示加载状态
  list.innerHTML = `<div class="spin-loading" style="text-align:center;padding:40px;"><div class="spin"></div><p>加载中...</p></div>`;

  try {
    let result;
    const tab = newsState.currentTab;

    if (tab === 'history') {
      // DB-R-028: 资讯历史
      result = window.DB ? await window.DB.getNewsHistory() : { success: true, data: [] };
    } else {
      // DB-R-027: 推荐资讯 (未读列表)
      result = window.DB ? await window.DB.getRecommendedNews() : { success: true, data: [] };
    }

    const news = result.data || [];

    if (news.length === 0) {
      const emptyMessages = {
        recommend: { icon: 'fa-newspaper', title: '暂无资讯', desc: 'AI会根据您的学习内容推荐相关资讯' },
        history: { icon: 'fa-clock', title: '暂无历史', desc: '已入库的资讯会出现在这里' }
      };
      const msg = emptyMessages[tab] || emptyMessages.recommend;
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas ${msg.icon}"></i>
          <div class="empty-title">${msg.title}</div>
          <div class="empty-desc">${msg.desc}</div>
        </div>`;
      return;
    }

    list.innerHTML = news.map(item => {
      const isRead = item.hasRead;
      const isSaved = item.isSaved;
      const isIgnored = item.ignored;

      let badgeHtml = '';
      if (!isRead && !isIgnored) badgeHtml = '<span class="badge badge-danger" style="font-size:11px;">未读</span>';
      if (isSaved) badgeHtml += '<span class="badge badge-success" style="font-size:11px; margin-left:4px;">已入库</span>';
      if (isIgnored) badgeHtml += '<span class="badge badge-secondary" style="font-size:11px; margin-left:4px;">已忽略</span>';

      let actionsHtml = '';
      if (tab === 'recommend') {
        actionsHtml = `
          <button class="btn btn-secondary btn-sm" onclick="toggleNewsRead('${item._id}', ${isRead})">${isRead ? '标记未读' : '标记已读'}</button>
          <button class="btn btn-primary btn-sm" onclick="importSingleNews('${item._id}')">入库</button>
          <button class="btn btn-secondary btn-sm" onclick="ignoreSingleNews('${item._id}')">忽略</button>`;
      } else {
        actionsHtml = `
          <button class="btn btn-secondary btn-sm" onclick="restoreSingleNews('${item._id}')">恢复</button>
          <button class="btn btn-danger btn-sm" onclick="permanentDeleteNews('${item._id}')">永久删除</button>`;
      }

      return `
        <div class="news-card" style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; transition: box-shadow 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <h3 style="font-size: 16px; font-weight: 600; margin: 0; word-break: break-word;">${escapeHtml(item.title)}</h3>
                ${badgeHtml}
              </div>
              <p style="color: #6b7280; font-size: 14px; margin: 4px 0; line-height: 1.5;">${escapeHtml((item.summary || item.content || '暂无摘要').substring(0, 150))}${(item.summary || item.content || '').length > 150 ? '...' : ''}</p>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-size: 12px; color: #9ca3af;">
              <span>${escapeHtml(item.source || item.sourceName || '未知来源')}</span>
              <span style="margin-left: 8px;">${formatDate(item.createdAt)}</span>
              ${item.tags && item.tags.length > 0 ? `<span style="margin-left: 8px;">🏷️ ${item.tags.map(t => escapeHtml(t)).join(', ')}</span>` : ''}
            </div>
            <div style="display: flex; gap: 6px;">
              ${actionsHtml}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (error) {
    console.error('加载资讯列表失败:', error);
    list.innerHTML = `<div class="empty-state"><div class="empty-title">加载失败</div><div class="empty-desc">${error.message || '请检查网络连接'}</div></div>`;
    showToast('加载资讯失败', 'error');
  }
}

/* ================================================================
   切换标签
   ================================================================ */

function switchTab(e) {
  document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  newsState.currentTab = e.target.dataset.tab || 'recommend';
  loadNewsList();
}

/* ================================================================
   标记已读/未读 — DB.markNewsRead (无编号)
   ================================================================ */

async function toggleNewsRead(newsId, isRead) {
  try {
    const result = window.DB
      ? (isRead
        ? await window.DB._exec(window.DB._collection('news_items').doc(newsId).update({ hasRead: false, updatedAt: new Date() }))
        : await window.DB.markNewsRead(newsId))
      : { success: true };
    if (result.success) {
      showToast(isRead ? '已标记为未读' : '已标记为已读', 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('更新状态失败:', error);
    showToast('操作失败', 'error');
  }
}

/* ================================================================
   入库资讯 — DB-U-029
   ================================================================ */

async function importSingleNews(newsId) {
  try {
    showToast('正在入库...', 'info');
    const result = window.DB
      ? await window.DB.importNewsToKnowledge(newsId)
      : { success: true };
    if (result.success) {
      showToast('已入库到知识库', 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('入库失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('入库失败:', error);
    showToast('入库失败', 'error');
  }
}

/* ================================================================
   忽略资讯 — DB-U-030
   ================================================================ */

async function ignoreSingleNews(newsId) {
  try {
    const result = window.DB
      ? await window.DB.ignoreNews(newsId)
      : { success: true };
    if (result.success) {
      showToast('已忽略', 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('忽略失败:', error);
    showToast('操作失败', 'error');
  }
}

/* ================================================================
   恢复资讯 — DB-U-034
   ================================================================ */

async function restoreSingleNews(newsId) {
  try {
    const result = window.DB
      ? await window.DB.restoreNews(newsId)
      : { success: true };
    if (result.success) {
      showToast('已恢复', 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('恢复失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('恢复失败:', error);
    showToast('恢复失败', 'error');
  }
}

/* ================================================================
   永久删除资讯 — DB-D-008
   ================================================================ */

async function permanentDeleteNews(newsId) {
  if (!confirm('确定要永久删除这条资讯吗？此操作不可恢复！')) return;

  try {
    const result = window.DB
      ? await window.DB.permanentDeleteNews(newsId)
      : { success: true };
    if (result.success) {
      showToast('已永久删除', 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('删除失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('永久删除失败:', error);
    showToast('删除失败', 'error');
  }
}

/* ================================================================
   手动录入资讯 — DB-W-010
   ================================================================ */

async function addManualNews() {
  const title = prompt('请输入资讯标题:');
  if (!title || !title.trim()) return;

  const url = prompt('请输入资讯链接 (可选):') || '';
  const content = prompt('请输入资讯内容 (可选):') || '';

  try {
    const result = window.DB
      ? await window.DB.addManualNews({ title: title.trim(), sourceUrl: url.trim(), content: content.trim() })
      : { success: true };
    if (result.success) {
      showToast('资讯已录入', 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('录入失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('录入资讯失败:', error);
    showToast('录入失败', 'error');
  }
}

/**
 * AI-023: 每日抓取真实 RSS 资讯并 AI 评分入库
 */
async function startDailyCrawl() {
  try {
    showToast('正在从 RSS 源抓取最新资讯…', 'info');
    const result = window.DB
      ? await window.DB.dailyCrawlAndScore()
      : { success: true, data: { crawled: 0, saved: 0 } };

    if (result.success) {
      const data = result.data || { crawled: 0, saved: 0 };
      showToast(`抓取完成：${data.crawled || 0} 条资讯，入库 ${data.saved || 0} 条`, 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('抓取失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('每日资讯抓取失败:', error);
    showToast('抓取失败', 'error');
  }
}

/* ================================================================
   批量操作

   批量入库 — DB-U-031
   批量忽略 — DB-U-032
   批量暂缓 — DB-U-033
   ================================================================ */

async function batchImportNews(newsIds) {
  if (!newsIds || newsIds.length === 0) {
    showToast('请选择要入库的资讯', 'warning');
    return;
  }
  try {
    showToast(`正在批量入库 ${newsIds.length} 条资讯...`, 'info');
    const result = window.DB
      ? await window.DB.batchImportNews(newsIds)
      : { success: true };
    if (result.success) {
      showToast(`已入库 ${newsIds.length} 条资讯`, 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('批量入库失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量入库失败:', error);
    showToast('操作失败', 'error');
  }
}

async function batchIgnoreNews(newsIds) {
  if (!newsIds || newsIds.length === 0) {
    showToast('请选择要忽略的资讯', 'warning');
    return;
  }
  try {
    const result = window.DB
      ? await window.DB.batchIgnoreNews(newsIds)
      : { success: true };
    if (result.success) {
      showToast(`已忽略 ${newsIds.length} 条资讯`, 'success');
      loadNewsStats();
      loadNewsList();
    } else {
      showToast('批量忽略失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量忽略失败:', error);
    showToast('操作失败', 'error');
  }
}

async function batchDelayNews(newsIds, delayDays = 7) {
  if (!newsIds || newsIds.length === 0) {
    showToast('请选择要暂缓的资讯', 'warning');
    return;
  }
  try {
    const delayedUntil = new Date();
    delayedUntil.setDate(delayedUntil.getDate() + delayDays);
    const result = window.DB
      ? await window.DB.batchDelayNews(newsIds, delayedUntil)
      : { success: true };
    if (result.success) {
      showToast(`已暂缓 ${newsIds.length} 条资讯`, 'success');
      loadNewsList();
    } else {
      showToast('批量暂缓失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量暂缓失败:', error);
    showToast('操作失败', 'error');
  }
}

/* ================================================================
   AI 入库建议 — AI-014
   ================================================================ */

async function getImportSuggestions(newsId) {
  try {
    showToast('正在生成入库建议...', 'info');
    const result = window.DB
      ? await window.DB.aiImportSuggestions(newsId)
      : { success: true, content: '建议将该资讯入库为知识条目' };
    if (result.success) {
      showToast(result.content || '建议已生成', 'success');
    } else {
      showToast('获取建议失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('获取入库建议失败:', error);
    showToast('获取建议失败', 'error');
  }
}

/* ================================================================
   聚合统计查询

   AGG-015: 资讯统计详情
   AGG-016: 转化统计
   AGG-017: 趋势数据
   AGG-018: 来源排行
   AGG-019: 热门标签
   ================================================================ */

async function loadNewsStatsDetail() {
  try {
    const result = window.DB
      ? await window.DB.getNewsStatsDetail()
      : { success: true, data: {} };
    if (result.success) {
      showToast(`统计详情已加载: ${(result.data.news || []).length} 条资讯`, 'info');
    }
  } catch (error) {
    console.error('加载统计详情失败:', error);
  }
}

async function loadConversionStats() {
  try {
    const result = window.DB
      ? await window.DB.getConversionStats()
      : { success: true, data: {} };
    if (result.success) {
      showToast(`转化统计已加载`, 'info');
    }
  } catch (error) {
    console.error('加载转化统计失败:', error);
  }
}

async function loadTrendData() {
  try {
    const result = window.DB
      ? await window.DB.getNewsTrendData()
      : { success: true, data: [] };
    if (result.success) {
      showToast(`趋势数据已加载: ${(result.data || []).length} 条`, 'info');
    }
  } catch (error) {
    console.error('加载趋势数据失败:', error);
  }
}

async function loadSourceRanking() {
  try {
    const result = window.DB
      ? await window.DB.getNewsSourceRanking()
      : { success: true, data: {} };
    if (result.success) {
      const ranking = result.data || {};
      const entries = Object.entries(ranking).sort((a, b) => b[1] - a[1]);
      const topStr = entries.slice(0, 3).map(([k, v]) => `${k}(${v})`).join(', ');
      showToast(`来源排行: ${topStr || '暂无数据'}`, 'info');
    }
  } catch (error) {
    console.error('加载来源排行失败:', error);
  }
}

async function loadHotTags() {
  try {
    const result = window.DB
      ? await window.DB.getNewsHotTags()
      : { success: true, data: {} };
    if (result.success) {
      const tags = result.data || {};
      const entries = Object.entries(tags).sort((a, b) => b[1] - a[1]);
      const topStr = entries.slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ');
      showToast(`热门标签: ${topStr || '暂无'}`, 'info');
    }
  } catch (error) {
    console.error('加载热门标签失败:', error);
  }
}

/* ================================================================
   DOMContentLoaded 自动启动 (兼容旧 DOMContentLoaded 模式)
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('news-list')) {
    initNewsPage();
  }
});

/* ================================================================
   暴露全局函数
   ================================================================ */

window.initNewsPage = initNewsPage;
window.switchTab = switchTab;
window.toggleNewsRead = toggleNewsRead;
window.importSingleNews = importSingleNews;
window.ignoreSingleNews = ignoreSingleNews;
window.restoreSingleNews = restoreSingleNews;
window.permanentDeleteNews = permanentDeleteNews;
window.addManualNews = addManualNews;
window.batchImportNews = batchImportNews;
window.batchIgnoreNews = batchIgnoreNews;
window.batchDelayNews = batchDelayNews;
window.getImportSuggestions = getImportSuggestions;
window.loadNewsStatsDetail = loadNewsStatsDetail;
window.loadConversionStats = loadConversionStats;
window.loadTrendData = loadTrendData;
window.loadSourceRanking = loadSourceRanking;
window.loadHotTags = loadHotTags;

/* 兼容旧代码: plan.html 中可能调用 markAsRead / importToKnowledge */
window.markAsRead = toggleNewsRead;
window.importToKnowledge = importSingleNews;
