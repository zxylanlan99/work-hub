document.addEventListener('DOMContentLoaded', async function() {
  await initCloudbase();
  loadDocs();
  loadScraps();
  
  document.getElementById('create-doc-btn').addEventListener('click', createDoc);
  document.getElementById('add-scrap-btn').addEventListener('click', addScrap);
  
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', switchTab);
  });
});

async function loadDocs(status = 'draft') {
  try {
    const result = await getData('output_docs', { status });
    const docs = result.data;
    
    if (docs.length === 0) {
      document.getElementById('doc-list').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-file-text"></i>
          <div class="empty-title">暂无文档</div>
          <div class="empty-desc">点击右上角按钮创建新文档</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('doc-list').innerHTML = docs.map(doc => `
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 600;">${doc.title}</h3>
            <span class="badge ${doc.status === 'draft' ? 'badge-warning' : 'badge-success'}">${doc.status === 'draft' ? '草稿' : '已发布'}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="editDoc('${doc._id}')">编辑</button>
            ${doc.status === 'draft' ? `<button class="btn btn-primary" onclick="publishDoc('${doc._id}')">发布</button>` : ''}
            <button class="btn btn-danger" onclick="deleteDoc('${doc._id}')">删除</button>
          </div>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">${doc.content.substring(0, 80)}${doc.content.length > 80 ? '...' : ''}</p>
        <div style="font-size: 12px; color: #9ca3af;">
          更新于 ${formatDate(doc.updatedAt || doc.createdAt)}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载文档失败:', error);
  }
}

async function loadScraps() {
  try {
    const result = await getData('scraps');
    const scraps = result.data.sort((a, b) => b.createdAt - a.createdAt);
    
    if (scraps.length === 0) {
      document.getElementById('scrap-list').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-lightbulb"></i>
          <div class="empty-title">暂无灵感碎片</div>
          <div class="empty-desc">记录您的突发奇想</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('scrap-list').innerHTML = scraps.map(scrap => `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 8px; position: relative;">
        <p style="color: #374151;">${scrap.content}</p>
        <div style="font-size: 12px; color: #9ca3af; margin-top: 8px;">
          ${formatDate(scrap.createdAt)}
          <button style="float: right; background: none; border: none; color: #ef4444; cursor: pointer;" 
                  onclick="deleteScrap('${scrap._id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载碎片失败:', error);
  }
}

function formatDate(date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function switchTab(e) {
  document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  
  loadDocs(e.target.dataset.tab);
}

async function createDoc() {
  const title = prompt('请输入文档标题');
  if (!title) return;
  
  try {
    await addData('output_docs', {
      title,
      content: '',
      status: 'draft',
      createdAt: new Date()
    });
    
    showToast('文档创建成功', 'success');
    loadDocs();
  } catch (error) {
    console.error('创建文档失败:', error);
    showToast('创建文档失败', 'error');
  }
}

async function publishDoc(id) {
  try {
    await updateData('output_docs', id, {
      status: 'published',
      updatedAt: new Date()
    });
    
    showToast('文档已发布', 'success');
    loadDocs('draft');
  } catch (error) {
    console.error('发布文档失败:', error);
    showToast('发布文档失败', 'error');
  }
}

async function deleteDoc(id) {
  if (!confirm('确定要删除这个文档吗？')) return;
  
  try {
    await deleteData('output_docs', id);
    showToast('文档已删除', 'success');
    loadDocs();
  } catch (error) {
    console.error('删除文档失败:', error);
    showToast('删除文档失败', 'error');
  }
}

async function addScrap() {
  const content = prompt('请输入灵感碎片内容');
  if (!content) return;
  
  try {
    await addData('scraps', {
      content,
      createdAt: new Date()
    });
    
    showToast('灵感碎片已保存', 'success');
    loadScraps();
  } catch (error) {
    console.error('保存碎片失败:', error);
    showToast('保存碎片失败', 'error');
  }
}

async function deleteScrap(id) {
  try {
    await deleteData('scraps', id);
    showToast('碎片已删除', 'success');
    loadScraps();
  } catch (error) {
    console.error('删除碎片失败:', error);
    showToast('删除碎片失败', 'error');
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