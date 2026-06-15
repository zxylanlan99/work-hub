document.addEventListener('DOMContentLoaded', async function() {
  await initCloudbase();
  loadNewsStats();
  loadNewsList();
  
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', switchTab);
  });
});

async function loadNewsStats() {
  try {
    const unread = await getData('news_items', { hasRead: false });
    const read = await getData('news_items', { hasRead: true });
    const imported = await getData('news_items', { imported: true });
    
    document.getElementById('unread-count').textContent = unread.data.length;
    document.getElementById('read-count').textContent = read.data.length;
    document.getElementById('imported-count').textContent = imported.data.length;
  } catch (error) {
    console.error('加载统计失败:', error);
  }
}

async function loadNewsList(tab = 'recommend') {
  try {
    let query = {};
    if (tab === 'unread') {
      query.hasRead = false;
    }
    
    const result = await getData('news_items', query);
    const news = result.data;
    
    if (news.length === 0) {
      document.getElementById('news-list').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-newspaper"></i>
          <div class="empty-title">暂无资讯</div>
          <div class="empty-desc">AI会根据您的学习内容推荐相关资讯</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('news-list').innerHTML = news.map(item => `
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div style="flex: 1;">
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${item.title}</h3>
            <p style="color: #6b7280; font-size: 14px;">${item.summary || '暂无摘要'}</p>
          </div>
          ${!item.hasRead ? '<span class="badge badge-danger">未读</span>' : ''}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 12px; color: #9ca3af;">
            ${item.source || '未知来源'} · ${formatDate(item.createdAt)}
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="markAsRead('${item._id}')">${item.hasRead ? '标记未读' : '标记已读'}</button>
            <button class="btn btn-primary" onclick="importToKnowledge('${item._id}')">入库</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载资讯失败:', error);
  }
}

function formatDate(date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function switchTab(e) {
  document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  
  loadNewsList(e.target.dataset.tab);
}

async function markAsRead(id) {
  try {
    const result = await getData('news_items', { _id: id });
    const item = result.data[0];
    
    await updateData('news_items', id, { hasRead: !item.hasRead });
    
    showToast(item.hasRead ? '已标记为未读' : '已标记为已读', 'success');
    loadNewsStats();
    loadNewsList();
  } catch (error) {
    console.error('更新状态失败:', error);
    showToast('操作失败', 'error');
  }
}

async function importToKnowledge(id) {
  try {
    const result = await getData('news_items', { _id: id });
    const item = result.data[0];
    
    await addData('knowledge_items', {
      title: item.title,
      content: item.content || item.summary || '',
      category: '资讯导入',
      createdAt: new Date()
    });
    
    await updateData('news_items', id, { imported: true });
    
    showToast('已入库到知识库', 'success');
    loadNewsStats();
    loadNewsList();
  } catch (error) {
    console.error('入库失败:', error);
    showToast('入库失败', 'error');
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}