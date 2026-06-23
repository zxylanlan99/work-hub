/**
 * StudyMind 知识沉淀模块
 * 对应 DB 服务层 output 模块 (12 逻辑接口)
 * 版本: v2.0 | 日期: 2026-06-16
 */

/* ================================================================
   状态管理
   ================================================================ */

const outputState = {
  currentDocTab: 'draft',   // 'draft' | 'published'
  currentDocId: null,
  autoSaveTimer: null,
  autoSaveInterval: 30000   // 30秒自动保存
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
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ================================================================
   主入口 - initOutputPage
   ================================================================ */

async function initOutputPage() {
  try {
    if (window.DB && window.DB.init) {
      await window.DB.init();
    } else {
      await initCloudbase();
    }
    await loadDocs();
    await loadScraps();
    await loadOutputStats();
    bindEvents();
  } catch (error) {
    console.error('知识沉淀页面初始化失败:', error);
    showToast('页面初始化失败，请刷新重试', 'error');
  }
}

function bindEvents() {
  const createBtn = document.getElementById('create-doc-btn');
  const scrapBtn = document.getElementById('add-scrap-btn');

  if (createBtn) createBtn.addEventListener('click', createDoc);
  if (scrapBtn) scrapBtn.addEventListener('click', addScrap);

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', switchDocTab);
  });
}

/* ================================================================
   输出统计 — AGG-020
   ================================================================ */

async function loadOutputStats() {
  try {
    const result = window.DB
      ? await window.DB.getOutputStats()
      : { success: true, data: { draftCount: 0, publishedCount: 0, totalWords: 0, scrapCount: 0 } };
    if (result.success && result.data) {
      const docCountEl = document.getElementById('stat-drafts');
      const publishedCountEl = document.getElementById('stat-published');
      const totalWordsEl = document.getElementById('stat-words');
      const scrapCountEl = document.getElementById('scrap-count');
      if (docCountEl) docCountEl.textContent = result.data.draftCount || 0;
      if (publishedCountEl) publishedCountEl.textContent = result.data.publishedCount || 0;
      if (totalWordsEl) totalWordsEl.textContent = (result.data.totalWords || 0).toLocaleString();
      if (scrapCountEl) scrapCountEl.textContent = (result.data.scrapCount || 0) + '条';
    }
  } catch (error) {
    console.error('加载输出统计失败:', error);
  }
}

/* ================================================================
   文档列表 — DB-R-031
   ================================================================ */

async function loadDocs() {
  const list = document.getElementById('docGrid');
  if (!list) return;

  list.innerHTML = `<div class="spin-loading" style="text-align:center;padding:40px;"><div class="spin"></div><p>加载中...</p></div>`;

  try {
    const status = outputState.currentDocTab || 'draft';
    const result = window.DB
      ? await window.DB.getDocuments(status)
      : { success: true, data: [] };
    const docs = result.data || [];

    if (docs.length === 0) {
      const emptyMsg = status === 'published' 
        ? { icon: 'fa-check-circle', title: '暂无已发布文档', desc: '发布的文档会出现在这里' }
        : { icon: 'fa-file-alt', title: '暂无草稿', desc: '点击右上角按钮创建新文档' };
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas ${emptyMsg.icon}"></i>
          <div class="empty-title">${emptyMsg.title}</div>
          <div class="empty-desc">${emptyMsg.desc}</div>
        </div>`;
      return;
    }

    list.innerHTML = docs.map(doc => {
      const isDraft = doc.status === 'draft';
      return `
        <div class="doc-card" style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px; transition: box-shadow 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <h3 style="font-size: 16px; font-weight: 600; margin: 0; word-break: break-word;">${escapeHtml(doc.title)}</h3>
                <span class="badge ${isDraft ? 'badge-warning' : 'badge-success'}" style="font-size: 11px;">${isDraft ? '草稿' : '已发布'}</span>
                ${doc.type ? `<span class="badge badge-secondary" style="font-size: 11px;">${escapeHtml(doc.type)}</span>` : ''}
              </div>
              <p style="color: #6b7280; font-size: 14px; margin: 6px 0; line-height: 1.5;">
                ${escapeHtml((doc.content || '暂无内容').substring(0, 120))}${(doc.content || '').length > 120 ? '...' : ''}
              </p>
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0; margin-left: 12px;">
              <button class="btn btn-secondary btn-sm" onclick="openDocEditor('${doc._id}')">编辑</button>
              ${isDraft ? `<button class="btn btn-primary btn-sm" onclick="publishDoc('${doc._id}')">发布</button>` : ''}
              <button class="btn btn-danger btn-sm" onclick="deleteDocConfirm('${doc._id}')">删除</button>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #9ca3af;">
            <span>更新于 ${formatDate(doc.updatedAt || doc.createdAt)}</span>
            ${doc.wordCount ? `<span>${doc.wordCount} 字</span>` : ''}
            <div style="display: flex; gap: 4px;">
              ${!isDraft ? '' : `<button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="aiExpandDoc('${doc._id}')">🤖 扩写</button>`}
              ${!isDraft ? '' : `<button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="aiRefineDoc('${doc._id}')">✨ 润色</button>`}
              <button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="aiOutlineDoc('${doc._id}')">📋 大纲</button>
              <button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="aiReviewDoc('${doc._id}')">🔍 评审</button>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (error) {
    console.error('加载文档失败:', error);
    list.innerHTML = `<div class="empty-state"><div class="empty-title">加载失败</div><div class="empty-desc">${error.message || '请检查网络连接'}</div></div>`;
    showToast('加载文档失败', 'error');
  }
}

/* ================================================================
   标签切换
   ================================================================ */

function switchDocTab(e) {
  document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  outputState.currentDocTab = e.target.dataset.tab || 'draft';
  loadDocs();
}

/* ================================================================
   创建文档 — DB-W-011
   ================================================================ */

async function createDoc() {
  const types = [
    { value: 'note', label: '笔记' },
    { value: 'article', label: '文章' },
    { value: 'speech', label: '演讲' },
    { value: 'practice', label: '练习' },
    { value: 'tutorial', label: '教程' }
  ];
  
  const typeHtml = types.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  const modal = document.createElement('div');
  modal.id = 'create-doc-modal';
  modal.className = 'modal-overlay show';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML = `
    <div class="modal modal-md" style="width:90%;max-width:440px;background:#fff;border-radius:12px;overflow:hidden;">
      <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
        <div class="modal-title" style="font-size:18px;font-weight:600;">新建文档</div>
        <span class="modal-close" onclick="document.getElementById('create-doc-modal').remove()" style="cursor:pointer;font-size:24px;color:#9ca3af;">&times;</span>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div style="margin-bottom:16px;">
          <label style="display:block;margin-bottom:6px;font-weight:500;">标题</label>
          <input id="new-doc-title" type="text" placeholder="请输入文档标题（≤200字）" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:block;margin-bottom:6px;font-weight:500;">类型</label>
          <select id="new-doc-type" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;">
            ${typeHtml}
          </select>
        </div>
      </div>
      <div class="modal-footer" style="padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="document.getElementById('create-doc-modal').remove()">取消</button>
        <button class="btn btn-primary" onclick="submitCreateDoc()">创建</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function submitCreateDoc() {
  const titleEl = document.getElementById('new-doc-title');
  const typeEl = document.getElementById('new-doc-type');
  const title = titleEl.value.trim();
  
  if (!title) {
    showToast('请输入标题', 'warning');
    return;
  }
  if (title.length > 200) {
    showToast('标题不能超过200字', 'warning');
    return;
  }

  try {
    const result = window.DB
      ? await window.DB.createDocument({ title, type: typeEl.value || 'note', status: 'draft' })
      : { success: true };
    if (result.success) {
      showToast('文档创建成功', 'success');
      loadDocs();
      loadOutputStats();
    } else {
      showToast('创建失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('创建文档失败:', error);
    showToast('创建文档失败', 'error');
  }
  
  document.getElementById('create-doc-modal').remove();
}

/* ================================================================
   文档编辑器 — DB-R-032 + DB-U-035 (自动保存)
   ================================================================ */

async function openDocEditor(docId) {
  try {
    const result = window.DB
      ? await window.DB.getDocumentContent(docId)
      : { success: false, error: 'DB 不可用' };

    if (!result.success || !result.data) {
      showToast('加载文档失败', 'error');
      return;
    }

    const doc = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!doc) {
      showToast('文档不存在', 'error');
      return;
    }

    outputState.currentDocId = docId;

    // 创建或更新编辑弹窗
    let editor = document.getElementById('doc-editor-modal');
    if (!editor) {
      editor = document.createElement('div');
      editor.id = 'doc-editor-modal';
      editor.className = 'modal-overlay show';
      editor.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      editor.innerHTML = `
        <div class="modal modal-lg" style="width:90%;max-width:800px;max-height:90vh;display:flex;flex-direction:column;background:#fff;border-radius:12px;overflow:hidden;">
          <div class="modal-header" style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
            <div class="modal-title" style="font-size:18px;font-weight:600;">📝 编辑文档</div>
            <span class="modal-close" onclick="closeDocEditor()" style="cursor:pointer;font-size:24px;color:#9ca3af;">&times;</span>
          </div>
          <div class="modal-body" style="flex:1;padding:20px;overflow-y:auto;">
            <div style="margin-bottom:12px;">
              <input id="editor-title" type="text" placeholder="文档标题" style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:16px;font-weight:600;" value="${escapeHtml(doc.title || '')}">
            </div>
            <div style="margin-bottom:12px;">
              <textarea id="editor-content" placeholder="开始写作..." style="width:100%;min-height:300px;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;line-height:1.6;resize:vertical;font-family:inherit;">${escapeHtml(doc.content || '')}</textarea>
            </div>
            <div style="font-size:12px;color:#9ca3af;display:flex;justify-content:space-between;">
              <span id="save-status">已加载</span>
              <span id="word-count">${(doc.content || '').length} 字</span>
            </div>
          </div>
          <div class="modal-footer" style="padding:12px 20px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn btn-secondary" onclick="closeDocEditor()">关闭</button>
            <button class="btn btn-primary" onclick="manualSaveDoc()">💾 保存</button>
          </div>
        </div>`;
      document.body.appendChild(editor);

      // 遮罩点击关闭
      editor.addEventListener('click', function(e) {
        if (e.target === editor) closeDocEditor();
      });

      // 内容变更自动保存
      const contentEl = document.getElementById('editor-content');
      if (contentEl) {
        contentEl.addEventListener('input', () => {
          const wcEl = document.getElementById('word-count');
          if (wcEl) wcEl.textContent = (contentEl.value || '').length + ' 字';
          scheduleAutoSave();
        });
      }
    }

    editor.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error('打开文档编辑器失败:', error);
    showToast('打开文档失败', 'error');
  }
}

function scheduleAutoSave() {
  if (outputState.autoSaveTimer) clearTimeout(outputState.autoSaveTimer);
  outputState.autoSaveTimer = setTimeout(() => autoSaveDoc(), outputState.autoSaveInterval);
}

/** 自动保存文档 — DB-U-035 */
async function autoSaveDoc() {
  if (!outputState.currentDocId) return;

  const titleEl = document.getElementById('editor-title');
  const contentEl = document.getElementById('editor-content');
  const statusEl = document.getElementById('save-status');

  if (!contentEl) return;

  try {
    const data = { content: contentEl.value || '' };
    if (titleEl) data.title = titleEl.value || '';

    const result = window.DB
      ? await window.DB.saveDocument(outputState.currentDocId, data)
      : { success: true };

    if (statusEl) {
      statusEl.textContent = result.success ? `自动保存 ${new Date().toLocaleTimeString()}` : '保存失败';
      statusEl.style.color = result.success ? '#10b981' : '#ef4444';
    }
  } catch (error) {
    console.error('自动保存失败:', error);
    if (statusEl) {
      statusEl.textContent = '保存失败';
      statusEl.style.color = '#ef4444';
    }
  }
}

/** 手动保存文档 */
async function manualSaveDoc() {
  if (!outputState.currentDocId) return;

  const titleEl = document.getElementById('editor-title');
  const contentEl = document.getElementById('editor-content');
  const statusEl = document.getElementById('save-status');

  try {
    const data = { content: contentEl ? contentEl.value || '' : '' };
    if (titleEl) data.title = titleEl.value || '';

    const result = window.DB
      ? await window.DB.saveDocument(outputState.currentDocId, data)
      : { success: true };

    if (result.success) {
      if (statusEl) {
        statusEl.textContent = '已保存 ' + new Date().toLocaleTimeString();
        statusEl.style.color = '#10b981';
      }
      showToast('保存成功', 'success');
      loadDocs();
    } else {
      showToast('保存失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('保存失败:', error);
    showToast('保存失败', 'error');
  }
}

function closeDocEditor() {
  const editor = document.getElementById('doc-editor-modal');
  if (editor) {
    // 关闭前自动保存
    manualSaveDoc();
    editor.style.display = 'none';
  }
  document.body.style.overflow = '';
  outputState.currentDocId = null;
}

/* ================================================================
   发布文档 — DB-U-036
   ================================================================ */

async function publishDoc(docId) {
  try {
    const result = window.DB
      ? await window.DB.publishDocument(docId)
      : { success: true };
    if (result.success) {
      showToast('文档已发布', 'success');
      loadDocs();
      loadOutputStats();
    } else {
      showToast('发布失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('发布文档失败:', error);
    showToast('发布失败', 'error');
  }
}

/* ================================================================
   删除文档 — DB-D-009
   ================================================================ */

async function deleteDocConfirm(docId) {
  if (!confirm('确定要删除这个文档吗？此操作不可恢复！')) return;

  try {
    const result = window.DB
      ? await window.DB.deleteDocument(docId)
      : { success: true };
    if (result.success) {
      showToast('文档已删除', 'success');
      loadDocs();
      loadOutputStats();
    } else {
      showToast('删除失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('删除文档失败:', error);
    showToast('删除失败', 'error');
  }
}

/* ================================================================
   灵感碎片

   碎片列表 — DB-R-033
   创建碎片 — DB-W-012
   更新碎片 — DB-U-037
   删除碎片 — DB-D-010
   展开写作 — DB-W-013
   忽略碎片 — DB-U-038
   ================================================================ */

async function loadScraps() {
  const list = document.getElementById('scrapList');
  if (!list) return;

  try {
    const result = window.DB
      ? await window.DB.getScraps(20)
      : { success: true, data: [] };
    const scraps = result.data || [];

    if (scraps.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-lightbulb"></i>
          <div class="empty-title">暂无灵感碎片</div>
          <div class="empty-desc">记录您的突发奇想</div>
        </div>`;
      return;
    }

    list.innerHTML = scraps.map(scrap => {
      const isRaw = scrap.status === 'raw';
      const isConverted = scrap.status === 'converted';
      const isProcessing = scrap.status === 'processing';
      let statusBadge = '';
      if (isConverted) statusBadge = '<span class="badge badge-success" style="font-size:10px;">已转化</span>';
      if (isProcessing) statusBadge = '<span class="badge badge-secondary" style="font-size:10px;">处理中</span>';

      return `
        <div class="scrap-item" style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 10px; position: relative; ${isConverted || isProcessing ? 'opacity:0.6;' : ''}">
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <span style="color: #f59e0b; font-size: 16px;">💡</span>
            <div style="flex: 1; min-width: 0;">
              <p style="color: #374151; margin: 0 0 8px 0; white-space: pre-wrap; word-break: break-word;">${escapeHtml(scrap.content)}</p>
              <div style="font-size: 12px; color: #9ca3af; display: flex; justify-content: space-between; align-items: center;">
                <span>${formatDate(scrap.createdAt)} ${statusBadge}</span>
                <div style="display: flex; gap: 4px;">
                  ${isRaw ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;" onclick="expandScrapToDoc('${scrap._id}')">📄 展开</button>` : ''}
                  ${isRaw ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;color:#f59e0b;" onclick="ignoreScrapItem('${scrap._id}')">忽略</button>` : ''}
                  <button class="btn btn-ghost btn-sm" style="font-size:11px;color:#ef4444;" onclick="deleteScrapItem('${scrap._id}')">🗑</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (error) {
    console.error('加载碎片失败:', error);
    list.innerHTML = `<div class="empty-state"><div class="empty-title">加载失败</div></div>`;
  }
}

async function addScrap() {
  const content = prompt('请输入灵感碎片内容:');
  if (!content || !content.trim()) return;

  try {
    const result = window.DB
      ? await window.DB.createScrap(content.trim())
      : { success: true };
    if (result.success) {
      showToast('灵感碎片已保存', 'success');
      loadScraps();
      loadOutputStats();
    } else {
      showToast('保存失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('保存碎片失败:', error);
    showToast('保存失败', 'error');
  }
}

async function deleteScrapItem(scrapId) {
  try {
    const result = window.DB
      ? await window.DB.deleteScrap(scrapId)
      : { success: true };
    if (result.success) {
      showToast('碎片已删除', 'success');
      loadScraps();
      loadOutputStats();
    } else {
      showToast('删除失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('删除碎片失败:', error);
    showToast('删除失败', 'error');
  }
}

async function expandScrapToDoc(scrapId) {
  const title = prompt('请输入文档标题:');
  if (!title || !title.trim()) return;

  try {
    const result = window.DB
      ? await window.DB.expandScrapToDoc(scrapId, title.trim())
      : { success: true };
    if (result.success) {
      showToast('已展开为文档', 'success');
      loadDocs();
      loadScraps();
      loadOutputStats();
    } else {
      showToast('展开失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('展开写作失败:', error);
    showToast('展开失败', 'error');
  }
}

async function ignoreScrapItem(scrapId) {
  try {
    const result = window.DB
      ? await window.DB.ignoreScrap(scrapId)
      : { success: true };
    if (result.success) {
      showToast('已忽略', 'success');
      loadScraps();
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('忽略碎片失败:', error);
    showToast('操作失败', 'error');
  }
}

/* ================================================================
   AI 操作

   AI-015: 推荐素材
   AI-016: AI 扩写
   AI-017: AI 润色
   AI-018: AI 大纲
   AI-019: AI 评审
   ================================================================ */

async function aiRecommendMaterials(docId) {
  try {
    showToast('正在获取推荐素材...', 'info');
    const result = window.DB
      ? await window.DB.aiRecommendMaterials(docId)
      : { success: true, content: '推荐素材已生成' };
    if (result.success) {
      showToast(result.content || '素材已生成', 'success');
    } else {
      showToast('获取失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('推荐素材失败:', error);
    showToast('获取失败', 'error');
  }
}

async function aiExpandDoc(docId) {
  const section = prompt('请输入要扩写的段落主题 (可选):') || '';
  try {
    showToast('AI 正在扩写...', 'info');
    const result = window.DB
      ? await window.DB.aiExpand(docId, section)
      : { success: true, content: '内容已扩写' };
    if (result.success) {
      showToast(result.content || '扩写完成', 'success');
      loadDocs();
    } else {
      showToast('扩写失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('AI 扩写失败:', error);
    showToast('扩写失败', 'error');
  }
}

async function aiRefineDoc(docId) {
  const content = prompt('请输入要润色的文本:') || '';
  if (!content.trim()) return;

  try {
    showToast('AI 正在润色...', 'info');
    const result = window.DB
      ? await window.DB.aiRefine(docId, content.trim())
      : { success: true, content: '内容已润色' };
    if (result.success) {
      showToast(result.content || '润色完成', 'success');
    } else {
      showToast('润色失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('AI 润色失败:', error);
    showToast('润色失败', 'error');
  }
}

async function aiOutlineDoc(docId) {
  const topic = prompt('请输入大纲主题 (可选):') || '';
  try {
    showToast('AI 正在生成大纲...', 'info');
    const result = window.DB
      ? await window.DB.aiOutline(docId, topic)
      : { success: true, content: '大纲已生成' };
    if (result.success) {
      showToast(result.content || '大纲已生成', 'success');
    } else {
      showToast('生成失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('AI 大纲失败:', error);
    showToast('生成失败', 'error');
  }
}

async function aiReviewDoc(docId) {
  try {
    showToast('AI 正在评审...', 'info');
    const result = window.DB
      ? await window.DB.aiReview(docId)
      : { success: true, content: '评审完成' };
    if (result.success) {
      showToast(result.content || '评审完成', 'success');
    } else {
      showToast('评审失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('AI 评审失败:', error);
    showToast('评审失败', 'error');
  }
}

/* ================================================================
   DOMContentLoaded 自动启动
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('docGrid') || document.getElementById('scrapList')) {
    initOutputPage();
  }
});

/* ================================================================
   暴露全局函数
   ================================================================ */

window.initOutputPage = initOutputPage;
window.switchDocTab = switchDocTab;
window.createDoc = createDoc;
window.submitCreateDoc = submitCreateDoc;
window.openDocEditor = openDocEditor;
window.closeDocEditor = closeDocEditor;
window.manualSaveDoc = manualSaveDoc;
window.autoSaveDoc = autoSaveDoc;
window.publishDoc = publishDoc;
window.deleteDocConfirm = deleteDocConfirm;
window.addScrap = addScrap;
window.deleteScrapItem = deleteScrapItem;
window.expandScrapToDoc = expandScrapToDoc;
window.ignoreScrapItem = ignoreScrapItem;
window.aiRecommendMaterials = aiRecommendMaterials;
window.aiExpandDoc = aiExpandDoc;
window.aiRefineDoc = aiRefineDoc;
window.aiOutlineDoc = aiOutlineDoc;
window.aiReviewDoc = aiReviewDoc;

/* 兼容旧代码 */
window.editDoc = openDocEditor;
window.deleteDoc = deleteDocConfirm;
window.deleteScrap = deleteScrapItem;