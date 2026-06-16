/**
 * StudyMind 知识库页面
 * 对应 DB 服务层 knowledge 模块 (25 逻辑接口)
 * 版本: v2.0 | 日期: 2026-06-16
 */

/* ================================================================
   状态管理
   ================================================================ */

const knowledgeState = {
  currentCategoryId: null,     // null = 全部分类
  currentPage: 1,
  pageSize: 20,
  currentView: 'active',      // 'active' | 'trash' | 'search' | 'expired' | 'recommended'
  searchKeyword: '',
  editingItemId: null,
  categories: [],
  totalItems: 0
};

/* ================================================================
   SPIN 加载动画
   ================================================================ */

function showSpin(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="spin-loading"><div class="spin"></div><p>加载中...</p></div>`;
}

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

function formatDate(date) {
  if (window.utils && window.utils.formatDate) return window.utils.formatDate(date);
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ================================================================
   主入口
   ================================================================ */

async function initKnowledgePage() {
  try {
    if (window.DB && window.DB.init) {
      await window.DB.init();
    } else {
      await initCloudbase();
    }
    await loadCategories();
    await loadKnowledgeItems();
    bindEvents();
  } catch (error) {
    console.error('知识库页面初始化失败:', error);
    showToast('页面初始化失败，请刷新重试', 'error');
  }
}

function bindEvents() {
  const searchBtn = document.getElementById('search-btn');
  const searchInput = document.getElementById('search-input');
  const createBtn = document.getElementById('create-item-btn');

  if (searchBtn) searchBtn.addEventListener('click', searchItems);
  if (searchInput) searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchItems(); });
  if (createBtn) createBtn.addEventListener('click', openCreateModal);

  // 关闭弹窗
  const modal = document.getElementById('item-modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal || e.target.classList.contains('modal-close')) closeModal();
    });
  }
}

/* ================================================================
   分类树
   ================================================================ */

async function loadCategories() {
  const tree = document.getElementById('category-tree');
  if (!tree) return;
  showSpin('category-tree');

  try {
    const result = window.DB ? await window.DB.getCategories() : { success: true, data: [] };
    const categories = result.data || [];
    knowledgeState.categories = categories;

    if (categories.length === 0) {
      tree.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-folder"></i>
          <div class="empty-title">暂无分类</div>
          <div class="empty-desc">创建知识条目时可以创建分类</div>
        </div>`;
      return;
    }

    renderCategoryTree(categories);
  } catch (error) {
    console.error('加载分类失败:', error);
    tree.innerHTML = `<div class="empty-state"><div class="empty-title">分类加载失败</div></div>`;
  }
}

function renderCategoryTree(categories) {
  const tree = document.getElementById('category-tree');
  if (!tree) return;

  // 构建树结构
  const parentCategories = categories.filter(c => !c.parentId);
  const childMap = {};
  categories.forEach(c => {
    if (c.parentId) {
      if (!childMap[c.parentId]) childMap[c.parentId] = [];
      childMap[c.parentId].push(c);
    }
  });

  const renderNode = (cat, level = 0) => {
    const children = childMap[cat._id] || [];
    const isActive = knowledgeState.currentCategoryId === cat._id;
    const paddingLeft = 12 + level * 20;
    return `
      <div class="category-node ${isActive ? 'active' : ''}" data-cat-id="${cat._id}" style="padding: 8px 12px 8px ${paddingLeft}px; border-radius: 8px; cursor: pointer; margin-bottom: 2px; display: flex; align-items: center; justify-content: space-between; transition: background 0.2s; ${isActive ? 'background: #e0e7ff; color: #4f46e5;' : ''}">
        <span style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
          <i class="fas ${children.length > 0 ? 'fa-folder-open' : 'fa-folder'}" style="font-size: 14px;"></i>
          <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(cat.name)}</span>
        </span>
        <span style="font-size: 11px; color: #9ca3af; flex-shrink: 0; margin-left: 8px;">${cat.count || 0}</span>
      </div>
      ${children.map(child => renderNode(child, level + 1)).join('')}`;
  };

  tree.innerHTML = `
    <div class="category-node ${knowledgeState.currentCategoryId === null ? 'active' : ''}" data-cat-id="" style="padding: 8px 12px; border-radius: 8px; cursor: pointer; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; ${knowledgeState.currentCategoryId === null ? 'background: #e0e7ff; color: #4f46e5;' : ''}">
      <i class="fas fa-layer-group" style="font-size: 14px;"></i>
      <span>全部</span>
    </div>
    ${parentCategories.map(cat => renderNode(cat)).join('')}`;

  // 绑定分类点击
  tree.querySelectorAll('.category-node').forEach(node => {
    node.addEventListener('click', () => {
      const catId = node.dataset.catId || null;
      filterByCategory(catId);
    });
    node.addEventListener('mouseenter', function() { if (!this.classList.contains('active')) this.style.background = '#f3f4f6'; });
    node.addEventListener('mouseleave', function() { if (!this.classList.contains('active')) this.style.background = ''; });
  });
}

function filterByCategory(categoryId) {
  knowledgeState.currentCategoryId = categoryId;
  knowledgeState.currentPage = 1;
  knowledgeState.currentView = 'active';
  knowledgeState.searchKeyword = '';
  renderCategoryTree(knowledgeState.categories);
  if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
  loadKnowledgeItems();
}

/* ================================================================
   知识条目列表
   ================================================================ */

async function loadKnowledgeItems() {
  const list = document.getElementById('knowledge-list');
  if (!list) return;
  showSpin('knowledge-list');

  try {
    let result;

    switch (knowledgeState.currentView) {
      case 'trash':
        result = window.DB ? await window.DB.getTrashItems() : { success: true, data: [] };
        break;
      case 'search':
        result = window.DB
          ? await window.DB.searchKnowledge(knowledgeState.searchKeyword, knowledgeState.currentPage, knowledgeState.pageSize)
          : { success: true, data: [], total: 0 };
        break;
      case 'expired':
        result = window.DB ? await window.DB.getExpiredItems() : { success: true, data: [] };
        break;
      case 'recommended':
        result = window.DB ? await window.DB.getAIRecommendedItems() : { success: true, data: [] };
        break;
      default:
        result = window.DB
          ? await window.DB.getKnowledgeItems(knowledgeState.currentCategoryId, knowledgeState.currentPage, knowledgeState.pageSize)
          : { success: true, data: [], total: 0 };
    }

    const items = result.data || [];
    const total = result.total != null ? result.total : items.length;
    knowledgeState.totalItems = total;

    if (items.length === 0) {
      const emptyMessages = {
        trash: { icon: 'fa-trash-alt', title: '回收站为空', desc: '删除的知识条目会出现在这里' },
        search: { icon: 'fa-search', title: '未找到相关内容', desc: '请尝试其他关键词' },
        expired: { icon: 'fa-clock', title: '无过期条目', desc: '所有知识条目都在活跃期' },
        recommended: { icon: 'fa-star', title: '暂无推荐', desc: 'AI 会根据学习内容推荐知识条目' },
        active: { icon: 'fa-file-alt', title: '暂无知识条目', desc: '点击右上角按钮创建知识条目' }
      };
      const msg = emptyMessages[knowledgeState.currentView] || emptyMessages.active;
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas ${msg.icon}"></i>
          <div class="empty-title">${msg.title}</div>
          <div class="empty-desc">${msg.desc}</div>
        </div>`;
      return;
    }

    renderKnowledgeList(items, total, knowledgeState.currentPage);
  } catch (error) {
    console.error('加载知识条目失败:', error);
    list.innerHTML = `<div class="empty-state"><div class="empty-title">加载失败</div><div class="empty-desc">${error.message || '请检查网络连接'}</div></div>`;
    showToast('加载知识条目失败', 'error');
  }
}

function renderKnowledgeList(items, total, page) {
  const list = document.getElementById('knowledge-list');
  if (!list) return;

  const isTrash = knowledgeState.currentView === 'trash';

  const totalPages = Math.ceil(total / knowledgeState.pageSize);

  const itemsHtml = items.map(item => `
    <div class="knowledge-card" style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; transition: box-shadow 0.2s;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <div style="flex: 1; min-width: 0;">
          <h3 style="font-size: 16px; font-weight: 600; margin: 0 0 4px 0; word-break: break-word;">${escapeHtml(item.title)}</h3>
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
            ${item.categoryId ? `<span class="badge badge-primary" style="font-size: 11px;">${escapeHtml(item.categoryId)}</span>` : ''}
            ${(item.tags || []).map(t => `<span class="badge" style="font-size: 11px; background: #f3f4f6; color: #6b7280;">${escapeHtml(t)}</span>`).join('')}
            ${item.status === 'archived' ? `<span class="badge" style="font-size: 11px; background: #fef3c7; color: #92400e;">已归档</span>` : ''}
            ${item.status === 'delayed' ? `<span class="badge" style="font-size: 11px; background: #ede9fe; color: #7c3aed;">已暂缓</span>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 6px; flex-shrink: 0; margin-left: 12px;">
          ${isTrash ? `
            <button class="btn btn-sm btn-secondary" onclick="restoreKnowledgeItem('${item._id}')" title="恢复">恢复</button>
            <button class="btn btn-sm btn-danger" onclick="permanentDeleteKnowledgeItem('${item._id}')" title="永久删除">彻底删除</button>
          ` : `
            <button class="btn btn-sm btn-secondary" onclick="openEditModal('${item._id}')" title="编辑">编辑</button>
            <button class="btn btn-sm btn-secondary" onclick="archiveKnowledgeItem('${item._id}')" title="归档">归档</button>
            <button class="btn btn-sm btn-danger" onclick="softDeleteKnowledgeItem('${item._id}')" title="删除">删除</button>
          `}
        </div>
      </div>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; line-height: 1.5; word-break: break-word;">${escapeHtml((item.content || '').substring(0, 120))}${(item.content || '').length > 120 ? '...' : ''}</p>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #9ca3af;">
        <span>创建于 ${formatDate(item.createdAt)}${item.updatedAt && item.updatedAt !== item.createdAt ? ' · 更新于 ' + formatDate(item.updatedAt) : ''}</span>
        ${item.reviewCards && item.reviewCards.length > 0 ? `<span><i class="fas fa-clone"></i> ${item.reviewCards.length} 张卡片</span>` : ''}
      </div>
    </div>`).join('');

  const paginationHtml = totalPages > 1 ? `
    <div class="pagination" style="display: flex; justify-content: center; align-items: center; gap: 8px; padding: 16px 0;">
      <button class="btn btn-sm btn-secondary" onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>上一页</button>
      <span style="font-size: 13px; color: #6b7280;">第 ${page} / ${totalPages} 页（共 ${total} 条）</span>
      <button class="btn btn-sm btn-secondary" onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>下一页</button>
    </div>` : '';

  list.innerHTML = itemsHtml + paginationHtml;
}

function goToPage(page) {
  if (page < 1) return;
  const totalPages = Math.ceil(knowledgeState.totalItems / knowledgeState.pageSize);
  if (page > totalPages) return;
  knowledgeState.currentPage = page;
  loadKnowledgeItems();
}

/* ================================================================
   创建 / 编辑弹窗
   ================================================================ */

function openCreateModal() {
  knowledgeState.editingItemId = null;
  const modal = document.getElementById('item-modal');
  const modalTitle = document.getElementById('modal-title');
  if (modal) modal.style.display = 'flex';
  if (modalTitle) modalTitle.textContent = '新建知识条目';

  const titleEl = document.getElementById('item-title');
  const contentEl = document.getElementById('item-content');
  const categoryEl = document.getElementById('item-category');
  if (titleEl) titleEl.value = '';
  if (contentEl) contentEl.value = '';
  if (categoryEl) categoryEl.value = '';

  // 加载分类到下拉框
  loadCategoryOptions();
}

async function openEditModal(itemId) {
  try {
    showToast('加载条目详情...', 'info');

    const result = window.DB
      ? await window.DB.getKnowledgeItemDetail(itemId)
      : { success: false, error: 'DB 不可用' };

    if (!result.success || !result.data) {
      showToast('加载条目失败', 'error');
      return;
    }

    const item = result.data;
    knowledgeState.editingItemId = itemId;

    const modal = document.getElementById('item-modal');
    const modalTitle = document.getElementById('modal-title');
    if (modal) modal.style.display = 'flex';
    if (modalTitle) modalTitle.textContent = '编辑知识条目';

    const titleEl = document.getElementById('item-title');
    const contentEl = document.getElementById('item-content');
    const categoryEl = document.getElementById('item-category');
    if (titleEl) titleEl.value = item.title || '';
    if (contentEl) contentEl.value = item.content || '';
    if (categoryEl) categoryEl.value = item.categoryId || '';

    loadCategoryOptions();
  } catch (error) {
    console.error('加载条目详情失败:', error);
    showToast('加载条目失败: ' + error.message, 'error');
  }
}

function loadCategoryOptions() {
  const select = document.getElementById('item-category');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">无分类</option>';
  knowledgeState.categories.forEach(cat => {
    select.innerHTML += `<option value="${cat._id}">${escapeHtml(cat.name)}</option>`;
  });
  select.value = currentValue;
}

function closeModal() {
  const modal = document.getElementById('item-modal');
  if (modal) modal.style.display = 'none';
  knowledgeState.editingItemId = null;
}

async function saveItem() {
  const titleEl = document.getElementById('item-title');
  const contentEl = document.getElementById('item-content');
  const categoryEl = document.getElementById('item-category');

  const title = (titleEl && titleEl.value || '').trim();
  const content = (contentEl && contentEl.value || '').trim();
  const categoryId = (categoryEl && categoryEl.value || '').trim();

  if (!title) {
    showToast('请输入标题', 'warning');
    return;
  }

  try {
    const data = { title, content, categoryId };

    if (knowledgeState.editingItemId) {
      const result = window.DB
        ? await window.DB.updateKnowledgeItem(knowledgeState.editingItemId, data)
        : { success: false, error: 'DB 不可用' };
      if (!result.success) {
        showToast('更新失败: ' + (result.error || '未知错误'), 'error');
        return;
      }
      showToast('知识条目更新成功', 'success');
    } else {
      const result = window.DB
        ? await window.DB.createKnowledgeItem(data)
        : { success: false, error: 'DB 不可用' };
      if (!result.success) {
        showToast('创建失败: ' + (result.error || '未知错误'), 'error');
        return;
      }
      showToast('知识条目创建成功', 'success');
    }

    closeModal();
    loadCategories();
    loadKnowledgeItems();
  } catch (error) {
    console.error('保存知识条目失败:', error);
    showToast('保存失败: ' + error.message, 'error');
  }
}

/* ================================================================
   搜索
   ================================================================ */

async function searchItems() {
  const input = document.getElementById('search-input');
  const keyword = (input && input.value || '').trim();

  if (!keyword) {
    knowledgeState.currentView = 'active';
    knowledgeState.searchKeyword = '';
    knowledgeState.currentPage = 1;
    loadKnowledgeItems();
    return;
  }

  knowledgeState.currentView = 'search';
  knowledgeState.searchKeyword = keyword;
  knowledgeState.currentPage = 1;
  knowledgeState.currentCategoryId = null;
  renderCategoryTree(knowledgeState.categories);
  loadKnowledgeItems();
}

/* ================================================================
   删除操作
   ================================================================ */

async function softDeleteKnowledgeItem(itemId) {
  if (!confirm('确定要删除这个知识条目吗？删除后可到回收站找回。')) return;

  try {
    const result = window.DB
      ? await window.DB.softDeleteKnowledgeItem(itemId)
      : { success: false, error: 'DB 不可用' };
    if (!result.success) {
      showToast('删除失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    showToast('已移至回收站', 'success');
    loadCategories();
    loadKnowledgeItems();
  } catch (error) {
    console.error('软删除失败:', error);
    showToast('删除失败: ' + error.message, 'error');
  }
}

async function permanentDeleteKnowledgeItem(itemId) {
  if (!confirm('确定要彻底删除这个知识条目吗？此操作不可恢复！')) return;

  try {
    const result = window.DB
      ? await window.DB.permanentDeleteKnowledgeItem(itemId)
      : { success: false, error: 'DB 不可用' };
    if (!result.success) {
      showToast('删除失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    showToast('已彻底删除', 'success');
    loadKnowledgeItems();
  } catch (error) {
    console.error('永久删除失败:', error);
    showToast('删除失败: ' + error.message, 'error');
  }
}

/* ================================================================
   回收站
   ================================================================ */

async function viewTrash() {
  knowledgeState.currentView = 'trash';
  knowledgeState.currentPage = 1;
  knowledgeState.currentCategoryId = null;
  knowledgeState.searchKeyword = '';
  renderCategoryTree(knowledgeState.categories);
  if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
  loadKnowledgeItems();
}

async function restoreKnowledgeItem(itemId) {
  try {
    const result = window.DB
      ? await window.DB.restoreKnowledgeItem(itemId)
      : { success: false, error: 'DB 不可用' };
    if (!result.success) {
      showToast('恢复失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    showToast('已恢复', 'success');
    loadCategories();
    loadKnowledgeItems();
  } catch (error) {
    console.error('恢复失败:', error);
    showToast('恢复失败: ' + error.message, 'error');
  }
}

async function emptyTrashItems() {
  if (!confirm('确定要清空回收站吗？所有条目将被永久删除，此操作不可恢复！')) return;

  try {
    const result = window.DB
      ? await window.DB.emptyTrash()
      : { success: false, error: 'DB 不可用' };
    if (!result.success) {
      showToast('清空失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    showToast('回收站已清空', 'success');
    loadKnowledgeItems();
  } catch (error) {
    console.error('清空回收站失败:', error);
    showToast('清空失败: ' + error.message, 'error');
  }
}

/* ================================================================
   归档 & 暂缓
   ================================================================ */

async function archiveKnowledgeItem(itemId) {
  try {
    const result = window.DB
      ? await window.DB.archiveKnowledge(itemId)
      : { success: false, error: 'DB 不可用' };
    if (!result.success) {
      showToast('归档失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    showToast('已归档', 'success');
    loadKnowledgeItems();
  } catch (error) {
    console.error('归档失败:', error);
    showToast('归档失败: ' + error.message, 'error');
  }
}

async function delayKnowledgeItem(itemId, delayDays = 7) {
  try {
    const result = window.DB
      ? await window.DB.delayKnowledge(itemId, delayDays)
      : { success: false, error: 'DB 不可用' };
    if (!result.success) {
      showToast('暂缓失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    showToast(`已暂缓 ${delayDays} 天`, 'success');
    loadKnowledgeItems();
  } catch (error) {
    console.error('暂缓失败:', error);
    showToast('暂缓失败: ' + error.message, 'error');
  }
}

/* ================================================================
   AI 推荐 & 过期 & 统计 & 体检
   ================================================================ */

async function viewRecommended() {
  knowledgeState.currentView = 'recommended';
  knowledgeState.currentPage = 1;
  knowledgeState.currentCategoryId = null;
  knowledgeState.searchKeyword = '';
  renderCategoryTree(knowledgeState.categories);
  if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
  loadKnowledgeItems();
}

async function viewExpired() {
  knowledgeState.currentView = 'expired';
  knowledgeState.currentPage = 1;
  knowledgeState.currentCategoryId = null;
  knowledgeState.searchKeyword = '';
  renderCategoryTree(knowledgeState.categories);
  if (document.getElementById('search-input')) document.getElementById('search-input').value = '';
  loadKnowledgeItems();
}

async function loadKnowledgeStats() {
  try {
    const result = window.DB
      ? await window.DB.getKnowledgeStats()
      : { success: false, error: 'DB 不可用' };
    if (result.success && result.data) {
      showToast(`知识条目: ${result.data.itemCount} 条 · 分类: ${result.data.categoryCount} 个`, 'info');
    }
  } catch (error) {
    console.error('加载统计失败:', error);
  }
}

async function loadKnowledgeHealth() {
  try {
    const result = window.DB
      ? await window.DB.getKnowledgeHealth()
      : { success: false, error: 'DB 不可用' };
    if (result.success && result.data) {
      const items = result.data.items || [];
      const categories = result.data.categories || [];
      const cards = result.data.cards || [];
      const itemsWithoutCategory = items.filter(i => !i.categoryId).length;
      const itemsWithoutCard = items.filter(i => !cards.some(c => c.knowledgeId === i._id)).length;
      showToast(`健康度: 无分类 ${itemsWithoutCategory} 项 · 无卡片 ${itemsWithoutCard} 项 · 共 ${items.length} 条目`, 'info');
    }
  } catch (error) {
    console.error('加载健康度失败:', error);
  }
}

async function aiProcessOrphanedItems() {
  try {
    showToast('AI 正在处理孤岛知识...', 'info');
    const result = window.DB
      ? await window.DB.aiProcessOrphaned()
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast('孤岛知识处理完成: ' + (result.content || ''), 'success');
    } else {
      showToast('处理失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('AI 处理失败:', error);
    showToast('AI 处理失败: ' + error.message, 'error');
  }
}

async function aiGenerateHealthReport() {
  try {
    showToast('正在生成健康度报告...', 'info');
    const result = window.DB
      ? await window.DB.aiHealthReport()
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast('健康度报告: ' + (result.content || ''), 'success');
    } else {
      showToast('生成失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('生成报告失败:', error);
    showToast('生成失败: ' + error.message, 'error');
  }
}

async function aiGenerateCardsForItem(itemId) {
  try {
    showToast('正在生成复习卡片...', 'info');
    const result = window.DB
      ? await window.DB.aiGenerateReviewCards(itemId)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast('复习卡片已生成: ' + (result.content || ''), 'success');
    } else {
      showToast('生成失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('生成卡片失败:', error);
    showToast('生成失败: ' + error.message, 'error');
  }
}

/* ================================================================
   加入学习计划
   ================================================================ */

async function addItemToStudyPlan(itemId) {
  try {
    const detailResult = window.DB
      ? await window.DB.getKnowledgeItemDetail(itemId)
      : { success: false, error: 'DB 不可用' };
    if (!detailResult.success || !detailResult.data) {
      showToast('获取条目信息失败', 'error');
      return;
    }

    const item = detailResult.data;
    const result = window.DB
      ? await window.DB.addToStudyPlan({ title: `学习: ${item.title}`, description: item.summary || item.content.substring(0, 200), taskTitle: item.title })
      : { success: false, error: 'DB 不可用' };

    if (result.success) {
      showToast('已加入学习计划', 'success');
    } else {
      showToast('加入失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('加入学习计划失败:', error);
    showToast('加入失败: ' + error.message, 'error');
  }
}

/* ================================================================
   导出 Markdown
   ================================================================ */

async function exportItemMarkdown(itemId) {
  try {
    const result = window.DB
      ? await window.DB.exportKnowledgeMarkdown(itemId)
      : { success: false, error: 'DB 不可用' };
    if (!result.success || !result.data) {
      showToast('导出失败: ' + (result.error || '未知错误'), 'error');
      return;
    }

    const blob = new Blob([result.data], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-${itemId}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('导出成功', 'success');
  } catch (error) {
    console.error('导出失败:', error);
    showToast('导出失败: ' + error.message, 'error');
  }
}

/* ================================================================
   链接知识
   ================================================================ */

async function linkKnowledgeItems(itemId, relatedIds) {
  try {
    const result = window.DB
      ? await window.DB.linkKnowledge(itemId, relatedIds)
      : { success: false, error: 'DB 不可用' };
    if (!result.success) {
      showToast('关联失败: ' + (result.error || '未知错误'), 'error');
      return;
    }
    showToast('关联成功', 'success');
  } catch (error) {
    console.error('关联失败:', error);
    showToast('关联失败: ' + error.message, 'error');
  }
}

/* ================================================================
   批量操作 (暴露为全局函数供 HTML onclick 使用)
   ================================================================ */

async function batchMoveCategoryItems(itemIds, categoryId) {
  if (!itemIds || itemIds.length === 0) return;
  try {
    const result = window.DB
      ? await window.DB.batchMoveCategory(itemIds, categoryId)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast(`已批量移动 ${itemIds.length} 个条目`, 'success');
      loadCategories();
      loadKnowledgeItems();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量移动失败:', error);
    showToast('操作失败: ' + error.message, 'error');
  }
}

async function batchRestoreKnowledgeItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  try {
    const result = window.DB
      ? await window.DB.batchRestoreItems(itemIds)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast(`已批量恢复 ${itemIds.length} 个条目`, 'success');
      loadKnowledgeItems();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量恢复失败:', error);
    showToast('操作失败: ' + error.message, 'error');
  }
}

async function batchSoftDeleteKnowledgeItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  if (!confirm(`确定要删除 ${itemIds.length} 个条目吗？`)) return;
  try {
    const result = window.DB
      ? await window.DB.batchSoftDeleteItems(itemIds)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast(`已批量删除 ${itemIds.length} 个条目`, 'success');
      loadCategories();
      loadKnowledgeItems();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量删除失败:', error);
    showToast('操作失败: ' + error.message, 'error');
  }
}

async function batchImportKnowledgeItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  try {
    const result = window.DB
      ? await window.DB.batchImportItems(itemIds)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast(`已批量入库 ${itemIds.length} 个条目`, 'success');
      loadKnowledgeItems();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量入库失败:', error);
    showToast('操作失败: ' + error.message, 'error');
  }
}

async function batchIgnoreKnowledgeItems(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  try {
    const result = window.DB
      ? await window.DB.batchIgnoreItems(itemIds)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast(`已批量忽略 ${itemIds.length} 个条目`, 'success');
      loadKnowledgeItems();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('批量忽略失败:', error);
    showToast('操作失败: ' + error.message, 'error');
  }
}

async function mergeKnowledgeItems(sourceIds, targetData) {
  if (!sourceIds || sourceIds.length < 2) {
    showToast('请至少选择 2 个条目进行合并', 'warning');
    return;
  }
  if (!targetData || !targetData.title) {
    showToast('请输入合并后的标题', 'warning');
    return;
  }
  try {
    const result = window.DB
      ? await window.DB.mergeKnowledgeItems(sourceIds, targetData)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast('合并成功', 'success');
      loadKnowledgeItems();
    } else {
      showToast('合并失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('合并失败:', error);
    showToast('合并失败: ' + error.message, 'error');
  }
}

/* ================================================================
   分类操作 (CRUD)
   ================================================================ */

async function createNewCategory(name, parentId) {
  if (!name || !name.trim()) {
    showToast('请输入分类名称', 'warning');
    return;
  }
  try {
    const result = window.DB
      ? await window.DB.createCategory({ name: name.trim(), parentId: parentId || '' })
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast('分类创建成功', 'success');
      loadCategories();
    } else {
      showToast('创建失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('创建分类失败:', error);
    showToast('创建失败: ' + error.message, 'error');
  }
}

async function updateCategoryName(categoryId, name) {
  if (!name || !name.trim()) {
    showToast('请输入分类名称', 'warning');
    return;
  }
  try {
    const result = window.DB
      ? await window.DB.updateCategory(categoryId, { name: name.trim() })
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast('分类已更新', 'success');
      loadCategories();
    } else {
      showToast('更新失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('更新分类失败:', error);
    showToast('更新失败: ' + error.message, 'error');
  }
}

async function moveCategoryTo(categoryId, parentId) {
  try {
    const result = window.DB
      ? await window.DB.moveCategory(categoryId, parentId || '')
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      showToast('分类已移动', 'success');
      loadCategories();
    } else {
      showToast('移动失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('移动分类失败:', error);
    showToast('移动失败: ' + error.message, 'error');
  }
}

async function deleteCategoryTree(categoryId) {
  if (!confirm('确定要删除这个分类吗？其下的知识条目将被移至"未分类"。')) return;
  try {
    const result = window.DB
      ? await window.DB.deleteCategory(categoryId)
      : { success: false, error: 'DB 不可用' };
    if (result.success) {
      if (knowledgeState.currentCategoryId === categoryId) {
        knowledgeState.currentCategoryId = null;
      }
      showToast('分类已删除', 'success');
      loadCategories();
      loadKnowledgeItems();
    } else {
      showToast('删除失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('删除分类失败:', error);
    showToast('删除失败: ' + error.message, 'error');
  }
}

/* ================================================================
   工具函数
   ================================================================ */

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ================================================================
   DOMContentLoaded 自动启动
   ================================================================ */

document.addEventListener('DOMContentLoaded', function() {
  // 如果页面包含知识库相关元素则自动初始化
  if (document.getElementById('category-tree') || document.getElementById('knowledge-list')) {
    initKnowledgePage();
  }
});

/* ================================================================
   暴露全部函数为全局 (供 HTML onclick 调用)
   ================================================================ */

window.initKnowledgePage = initKnowledgePage;
window.saveItem = saveItem;
window.closeModal = closeModal;
window.openCreateModal = openCreateModal;
window.openEditModal = openEditModal;
window.filterByCategory = filterByCategory;
window.searchItems = searchItems;
window.goToPage = goToPage;
window.softDeleteKnowledgeItem = softDeleteKnowledgeItem;
window.permanentDeleteKnowledgeItem = permanentDeleteKnowledgeItem;
window.restoreKnowledgeItem = restoreKnowledgeItem;
window.viewTrash = viewTrash;
window.emptyTrashItems = emptyTrashItems;
window.archiveKnowledgeItem = archiveKnowledgeItem;
window.delayKnowledgeItem = delayKnowledgeItem;
window.viewRecommended = viewRecommended;
window.viewExpired = viewExpired;
window.loadKnowledgeStats = loadKnowledgeStats;
window.loadKnowledgeHealth = loadKnowledgeHealth;
window.aiProcessOrphanedItems = aiProcessOrphanedItems;
window.aiGenerateHealthReport = aiGenerateHealthReport;
window.aiGenerateCardsForItem = aiGenerateCardsForItem;
window.addItemToStudyPlan = addItemToStudyPlan;
window.exportItemMarkdown = exportItemMarkdown;
window.linkKnowledgeItems = linkKnowledgeItems;
window.batchMoveCategoryItems = batchMoveCategoryItems;
window.batchRestoreKnowledgeItems = batchRestoreKnowledgeItems;
window.batchSoftDeleteKnowledgeItems = batchSoftDeleteKnowledgeItems;
window.batchImportKnowledgeItems = batchImportKnowledgeItems;
window.batchIgnoreKnowledgeItems = batchIgnoreKnowledgeItems;
window.mergeKnowledgeItems = mergeKnowledgeItems;
window.createNewCategory = createNewCategory;
window.updateCategoryName = updateCategoryName;
window.moveCategoryTo = moveCategoryTo;
window.deleteCategoryTree = deleteCategoryTree;
