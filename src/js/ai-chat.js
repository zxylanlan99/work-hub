/**
 * StudyMind AI 对话模块
 * 对应 DB 服务层 AI对话模块 (8 逻辑接口 + 5 关联接口)
 * 版本: v2.0 | 日期: 2026-06-16
 */

/* ================================================================
   状态管理
   ================================================================ */

const chatState = {
  currentChatId: null,
  currentPage: 1,
  pageSize: 20,
  selectedKnowledgeIds: []
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

function formatTime(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDate(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 渲染 Markdown 内容（AI 回复使用）
 * 配置 marked.js 以支持安全的 Markdown 渲染
 */
function renderMarkdown(content) {
  if (!content) return '';
  if (typeof window.marked !== 'function') {
    // marked.js 未加载时降级为纯文本
    return escapeHtml(content);
  }
  try {
    // 配置 marked 选项
    window.marked.setOptions({
      breaks: true,        // 换行符转换为 <br>
      gfm: true,            // GitHub 风味 Markdown
      headerIds: false,    // 禁用标题 ID（防 XSS）
      mangle: false        // 禁用标题 mangle（防 XSS）
    });
    return window.marked.parse(content);
  } catch (e) {
    console.error('Markdown 渲染失败:', e);
    return escapeHtml(content);
  }
}

/* ================================================================
   主入口 - initAIChatPage
   ================================================================ */

async function initAIChatPage() {
  try {
    if (window.DB && window.DB.init) {
      await window.DB.init();
    } else {
      await initCloudbase();
    }
    await loadModelOptions();
    await loadChats();
    bindEvents();
  } catch (error) {
    console.error('AI对话页面初始化失败:', error);
    showToast('页面初始化失败，请刷新重试', 'error');
  }
}

function bindEvents() {
  const newBtn = document.getElementById('new-chat-btn');
  const sendBtn = document.getElementById('send-btn');
  const msgInput = document.getElementById('message-input');
  const knowledgeBtn = document.getElementById('select-knowledge-btn');

  if (newBtn) newBtn.addEventListener('click', createNewChat);
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);
  if (msgInput) msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
  if (knowledgeBtn) knowledgeBtn.addEventListener('click', toggleKnowledgeSelector);

  _renderKnowledgeSelector();
}

/* ================================================================
   资料引用选择器 — AI-012-KB
   ================================================================ */

async function toggleKnowledgeSelector() {
  const panel = document.getElementById('knowledge-selector-panel');
  if (!panel) return;

  if (panel.style.display === 'none' || !panel.style.display) {
    await _loadKnowledgeItemsForSelector();
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}

async function _loadKnowledgeItemsForSelector() {
  const panel = document.getElementById('knowledge-selector-panel');
  if (!panel) return;

  panel.innerHTML = '<div style="padding:8px;color:#6b7280;font-size:13px;">加载资料中…</div>';

  try {
    const result = window.DB
      ? await window.DB._exec(window.DB._collection('knowledge_items').where({ isDeleted: false }).limit(50).get())
      : { success: true, data: [] };
    const items = result.data || [];

    if (items.length === 0) {
      panel.innerHTML = '<div style="padding:8px;color:#9ca3af;font-size:13px;">暂无可用资料</div>';
      return;
    }

    panel.innerHTML = items.map(item => {
      const isSelected = chatState.selectedKnowledgeIds.indexOf(item._id) !== -1;
      return `<label style="display:flex;align-items:flex-start;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;${isSelected ? 'background:#e0e7ff;' : ''}">
        <input type="checkbox" value="${item._id}" ${isSelected ? 'checked' : ''} onchange="_toggleKnowledgeItem('${item._id}', this.checked)" style="margin-top:2px;">
        <div style="font-size:13px;">
          <div style="font-weight:500;">${escapeHtml(item.title || '未命名')}</div>
          <div style="color:#9ca3af;font-size:11px;">${escapeHtml((item.summary || '').substring(0, 60))}</div>
        </div>
      </label>`;
    }).join('');
  } catch (error) {
    console.error('加载资料失败:', error);
    panel.innerHTML = '<div style="padding:8px;color:#ef4444;font-size:13px;">加载资料失败</div>';
  }
}

function _toggleKnowledgeItem(itemId, checked) {
  const idx = chatState.selectedKnowledgeIds.indexOf(itemId);
  if (checked && idx === -1) {
    chatState.selectedKnowledgeIds.push(itemId);
  } else if (!checked && idx !== -1) {
    chatState.selectedKnowledgeIds.splice(idx, 1);
  }
  _renderKnowledgeSelector();
}

function _renderKnowledgeSelector() {
  const badge = document.getElementById('knowledge-selected-count');
  if (badge) {
    const count = chatState.selectedKnowledgeIds.length;
    badge.textContent = count > 0 ? String(count) : '';
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

/* ================================================================
   模型选择 — CONST-001
   ================================================================ */

async function loadModelOptions() {
  const select = document.getElementById('model-select');
  if (!select) return;

  try {
    const models = window.DB ? window.DB.getAvailableModels() : [];
    if (models.length > 0) {
      select.innerHTML = models.map(m =>
        `<option value="${m.id}">${m.name}</option>`
      ).join('');
    }
  } catch (error) {
    console.error('加载模型列表失败:', error);
  }
}

/* ================================================================
   对话列表 — DB-R-024
   ================================================================ */

async function loadChats() {
  const list = document.getElementById('chat-list');
  if (!list) return;

  try {
    const result = window.DB
      ? await window.DB.getChats(chatState.currentPage, chatState.pageSize)
      : { success: true, data: [] };
    const chats = result.data || [];

    if (chats.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comments"></i>
          <div class="empty-title">暂无对话</div>
          <div class="empty-desc">点击右上角按钮开始新对话</div>
        </div>`;
      return;
    }

    list.innerHTML = chats.map(chat => {
      const isActive = chatState.currentChatId === chat._id;
      const firstMessage = chat.firstMessage || chat.lastMessage || chat.title || '';
      const displayTitle = truncateText(firstMessage, 30) || '未命名对话';
      return `
        <div style="padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom: 8px; ${isActive ? 'background: #e0e7ff;' : ''}"
             onclick="selectChat('${chat._id}', '${escapeHtml(displayTitle)}')"
             id="chat-${chat._id}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 500; margin-bottom: 4px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(displayTitle)}</div>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteChatConfirm('${chat._id}')" title="删除对话" style="color: #ef4444; flex-shrink: 0; margin-left: 4px;">🗑</button>
          </div>
          <div style="font-size: 12px; color: #6b7280;">${escapeHtml((chat.lastMessage || '暂无消息').substring(0, 30))}</div>
          <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${formatDate(chat.updatedAt || chat.createdAt)}</div>
        </div>`;
    }).join('');
  } catch (error) {
    console.error('加载对话失败:', error);
    list.innerHTML = `<div class="empty-state"><div class="empty-title">加载失败</div><div class="empty-desc">${error.message || '请检查网络连接'}</div></div>`;
  }
}

/* ================================================================
   创建对话 — DB-W-007
   ================================================================ */

async function createNewChat() {
  try {
    const result = window.DB
      ? await window.DB.createChat({ title: '新对话' })
      : { success: true, data: { id: 'local-' + Date.now() } };

    if (result.success) {
      const chatId = result.data ? result.data.id || result.data._id : null;
      if (chatId) {
        chatState.currentChatId = chatId;
        document.getElementById('chat-messages').innerHTML = '';
        document.querySelectorAll('[id^="chat-"]').forEach(el => el.style.background = 'transparent');
      }
      showToast('新对话已创建', 'success');
      loadChats();
    } else {
      showToast('创建失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('创建对话失败:', error);
    showToast('创建对话失败', 'error');
  }
}

/* ================================================================
   选择对话 & 加载消息 — DB-R-025
   ================================================================ */

async function selectChat(id, title) {
  chatState.currentChatId = id;
  document.querySelectorAll('[id^="chat-"]').forEach(el => el.style.background = 'transparent');
  const el = document.getElementById(`chat-${id}`);
  if (el) el.style.background = '#e0e7ff';

  await loadMessages(id);
}

async function loadMessages(chatId) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  try {
    const result = window.DB
      ? await window.DB.getMessages(chatId)
      : { success: true, data: [] };
    const messages = (result.data || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comment-dots"></i>
          <div class="empty-title">开始对话</div>
          <div class="empty-desc">输入消息开始与AI聊天</div>
        </div>`;
      return;
    }

    container.innerHTML = messages.map(msg => {
      const isUser = msg.role === 'user';
      const msgContent = isUser ? escapeHtml(msg.content) : renderMarkdown(msg.content);
      return `
        <div style="display: flex; margin-bottom: 16px; ${isUser ? 'justify-content: flex-end' : ''}">
          <div style="max-width: 70%;">
            <div style="background: ${isUser ? '#6366f1' : '#f3f4f6'};
                        color: ${isUser ? 'white' : '#1f2937'};
                        padding: 12px 16px;
                        border-radius: ${isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
                        word-break: break-word;">
              ${msgContent}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px; display: flex; align-items: center; gap: 8px; ${isUser ? 'justify-content: flex-end' : ''}">
              <span>${isUser ? '我' : 'AI'} · ${formatTime(msg.createdAt)}</span>
              ${!isUser ? `<span style="cursor:pointer; color: ${msg.isStarred ? '#f59e0b' : '#9ca3af'};" onclick="toggleStarMessage('${msg._id}', ${msg.isStarred})" title="${msg.isStarred ? '取消收藏' : '收藏'}">⭐</span>` : ''}
              ${!isUser ? `<span style="cursor:pointer; color: #9ca3af;" onclick="messageToKnowledge('${msg._id}')" title="转为知识">📝</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');

    container.scrollTop = container.scrollHeight;
  } catch (error) {
    console.error('加载消息失败:', error);
    container.innerHTML = `<div class="empty-state"><div class="empty-title">加载失败</div></div>`;
  }
}

/* ================================================================
   发送消息 & 获取 AI 回复 — AI-012
   ================================================================ */

async function sendMessage() {
  const input = document.getElementById('message-input');
  const content = input ? input.value.trim() : '';
  if (!content) return;

  if (!chatState.currentChatId) {
    showToast('请先创建或选择一个对话', 'warning');
    return;
  }

  if (input) input.value = '';

  // 构建引用资料提示标签
  const knowledgeTags = chatState.selectedKnowledgeIds.length > 0
    ? `<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">已引用 ${chatState.selectedKnowledgeIds.length} 条资料</div>`
    : '';

  // 先显示用户消息
  const container = document.getElementById('chat-messages');
  if (container) {
    container.innerHTML += `
      <div style="display: flex; margin-bottom: 16px; justify-content: flex-end;">
        <div style="max-width: 70%;">
          ${knowledgeTags}
          <div style="background: #6366f1; color: white; padding: 12px 16px; border-radius: 16px 16px 4px 16px; word-break: break-word;">
            ${escapeHtml(content)}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px; text-align: right;">我 · 刚刚</div>
        </div>
      </div>
      <div id="typing-indicator" style="display: flex; margin-bottom: 16px;">
        <div style="background: #f3f4f6; color: #6b7280; padding: 12px 16px; border-radius: 16px 16px 16px 4px;">
          <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>`;
    container.scrollTop = container.scrollHeight;
  }

  try {
    const modelSelect = document.getElementById('model-select');
    const model = modelSelect ? modelSelect.value : 'mimo';

    const hasKnowledge = chatState.selectedKnowledgeIds && chatState.selectedKnowledgeIds.length > 0;
    const result = window.DB
      ? (hasKnowledge
          ? await window.DB.sendMessageWithKnowledge(chatState.currentChatId, content, chatState.selectedKnowledgeIds, model)
          : await window.DB.sendMessageAndReply(chatState.currentChatId, content, model))
      : { success: true, data: { reply: '这是一个模拟的AI回复。实际部署后将连接真实AI服务。' } };

    // 发送后清空已选资料
    chatState.selectedKnowledgeIds = [];
    _renderKnowledgeSelector();

    // 移除typing indicator
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();

    // 显示AI回复
    if (result.success && result.data && result.data.reply) {
      if (container) {
        const aiContent = renderMarkdown(result.data.reply);
        container.innerHTML += `
          <div style="display: flex; margin-bottom: 16px;">
            <div style="max-width: 70%;">
              <div style="background: #f3f4f6; color: #1f2937; padding: 12px 16px; border-radius: 16px 16px 16px 4px; word-break: break-word;">
                ${aiContent}
              </div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">AI · 刚刚</div>
            </div>
          </div>`;
      }
    } else {
      showToast('AI 回复失败: ' + (result.error || '未知错误'), 'error');
    }

    // 刷新对话列表更新最后消息
    loadChats();
  } catch (error) {
    console.error('发送消息失败:', error);
    const typing = document.getElementById('typing-indicator');
    if (typing) typing.remove();
    showToast('发送失败: ' + error.message, 'error');
  }
}

/* ================================================================
   删除对话 — DB-D-007
   ================================================================ */

async function deleteChatConfirm(chatId) {
  if (!confirm('确定要删除这个对话及其所有消息吗？此操作不可恢复。')) return;

  try {
    const result = window.DB
      ? await window.DB.deleteChat(chatId)
      : { success: true };
    if (result.success) {
      showToast('对话已删除', 'success');
      if (chatState.currentChatId === chatId) {
        chatState.currentChatId = null;
        document.getElementById('chat-messages').innerHTML = '';
      }
      loadChats();
    } else {
      showToast('删除失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('删除对话失败:', error);
    showToast('删除失败', 'error');
  }
}

/* ================================================================
   更新对话标题 — DB-U-025
   ================================================================ */

async function renameChat(chatId) {
  const title = prompt('请输入新标题');
  if (!title || !title.trim()) return;

  try {
    const result = window.DB
      ? await window.DB.updateChat(chatId, { title: title.trim() })
      : { success: true };
    if (result.success) {
      showToast('标题已更新', 'success');
      loadChats();
    } else {
      showToast('更新失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('更新对话失败:', error);
    showToast('更新失败', 'error');
  }
}

/* ================================================================
   收藏/取消收藏消息 — DB-U-026 / DB-U-027
   ================================================================ */

async function toggleStarMessage(messageId, isStarred) {
  try {
    const result = window.DB
      ? (isStarred ? await window.DB.unstarMessage(messageId) : await window.DB.starMessage(messageId))
      : { success: true };
    if (result.success) {
      showToast(isStarred ? '已取消收藏' : '已收藏', 'success');
      if (chatState.currentChatId) loadMessages(chatState.currentChatId);
    } else {
      showToast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('收藏操作失败:', error);
    showToast('操作失败', 'error');
  }
}

/* ================================================================
   消息转知识 — DB-W-008
   ================================================================ */

async function messageToKnowledge(messageId) {
  try {
    const result = window.DB
      ? await window.DB.messageToKnowledge(messageId)
      : { success: true };
    if (result.success) {
      showToast('已转为知识条目', 'success');
    } else {
      showToast('转换失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('消息转知识失败:', error);
    showToast('转换失败', 'error');
  }
}

/* ================================================================
   对比模式 — AI-013 / DB-U-028 / DB-W-009
   ================================================================ */

async function startCompareMode() {
  const content = prompt('请输入要对比的问题:');
  if (!content || !content.trim()) return;

  if (!chatState.currentChatId) {
    showToast('请先创建或选择一个对话', 'warning');
    return;
  }

  showToast('正在对比多个模型...', 'info');

  try {
    if (!window.DB) {
      showToast('数据库服务未初始化', 'error');
      return;
    }
    const models = ['mimo', 'deepseek'];
    const result = await window.DB.aiCompare(models, content.trim());

    if (result.success && result.data) {
      const replies = result.data.map((r, i) => ({
        model: models[i] || 'unknown',
        content: r.content || r
      }));

      // 显示对比结果
      const container = document.getElementById('chat-messages');
      if (container) {
        container.innerHTML += `
          <div style="margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: #f9fafb;">
            <div style="font-weight: 600; margin-bottom: 12px;">🔍 双模型对比</div>
            ${replies.map((r, i) => `
              <div style="margin-bottom: 12px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb;">
                <div style="font-weight: 600; color: #6366f1; margin-bottom: 6px;">${r.model}</div>
                <div style="color: #374151; white-space: pre-wrap;">${escapeHtml(r.content)}</div>
                <button class="btn btn-sm btn-primary" style="margin-top: 8px;" onclick="adoptCompareAnswer('${r.model}', '${escapeHtml(r.content)}')">采纳此回答</button>
              </div>
            `).join('')}
          </div>`;
        container.scrollTop = container.scrollHeight;
      }
    }
  } catch (error) {
    console.error('对比模式失败:', error);
    showToast('对比失败: ' + error.message, 'error');
  }
}

async function adoptCompareAnswer(model, content) {
  try {
    const result = window.DB
      ? await window.DB.mergeCompareAnswers(chatState.currentChatId, `[${model}] ${content}`)
      : { success: true };
    if (result.success) {
      showToast('已采纳回答', 'success');
      if (chatState.currentChatId) loadMessages(chatState.currentChatId);
    }
  } catch (error) {
    console.error('采纳失败:', error);
    showToast('采纳失败', 'error');
  }
}

/* ================================================================
   DOMContentLoaded 自动启动
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('chat-list') || document.getElementById('chat-messages')) {
    initAIChatPage();
  }
});

/* ================================================================
   暴露全局函数
   ================================================================ */

window.initAIChatPage = initAIChatPage;
window.selectChat = selectChat;
window.createNewChat = createNewChat;
window.sendMessage = sendMessage;
window.deleteChatConfirm = deleteChatConfirm;
window.renameChat = renameChat;
window.toggleStarMessage = toggleStarMessage;
window.messageToKnowledge = messageToKnowledge;
window.startCompareMode = startCompareMode;
window.adoptCompareAnswer = adoptCompareAnswer;
window.toggleKnowledgeSelector = toggleKnowledgeSelector;
window._toggleKnowledgeItem = _toggleKnowledgeItem;

/* 兼容旧 plan.html 中 callAI 函数 */
if (typeof window.callAI === 'undefined') {
  window.callAI = async function (message, model) {
    const result = await (window.DB ? window.DB._aiProxy({
      action: 'chat',
      messages: [{ role: 'user', content: message }],
      model: model || 'mimo'
    }) : { success: true, content: '模拟回复' });
    return result.content || '抱歉，无法获取回复';
  };
}
