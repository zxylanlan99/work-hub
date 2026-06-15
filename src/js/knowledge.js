document.addEventListener('DOMContentLoaded', async function() {
  await initCloudbase();
  loadCategories();
  loadKnowledgeItems();
  
  document.getElementById('create-item-btn').addEventListener('click', openCreateModal);
  document.getElementById('search-btn').addEventListener('click', searchItems);
});

async function loadCategories() {
  try {
    const result = await getData('categories');
    const categories = result.data;
    
    if (categories.length === 0) {
      document.getElementById('category-tree').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-folder"></i>
          <div class="empty-title">暂无分类</div>
          <div class="empty-desc">创建知识条目时可以创建分类</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('category-tree').innerHTML = categories.map(cat => `
      <div style="padding: 8px 12px; border-radius: 8px; cursor: pointer; margin-bottom: 4px;"
           onclick="filterByCategory('${cat._id}')">
        <i class="fas fa-folder" style="margin-right: 8px;"></i>
        ${cat.name}
        <span style="float: right; font-size: 12px; color: #6b7280;">${cat.count || 0}</span>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载分类失败:', error);
  }
}

async function loadKnowledgeItems() {
  try {
    const result = await getData('knowledge_items');
    const items = result.data;
    
    if (items.length === 0) {
      document.getElementById('knowledge-list').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-file-text"></i>
          <div class="empty-title">暂无知识条目</div>
          <div class="empty-desc">点击右上角按钮创建知识条目</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('knowledge-list').innerHTML = items.map(item => `
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 600;">${item.title}</h3>
            ${item.category ? `<span class="badge badge-primary">${item.category}</span>` : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="editItem('${item._id}')">编辑</button>
            <button class="btn btn-danger" onclick="deleteItem('${item._id}')">删除</button>
          </div>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}</p>
        <div style="font-size: 12px; color: #9ca3af;">
          创建于 ${formatDate(item.createdAt)}
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载知识条目失败:', error);
  }
}

function formatDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function openCreateModal() {
  document.getElementById('item-modal').style.display = 'flex';
  document.getElementById('modal-title').textContent = '新建知识条目';
  document.getElementById('item-title').value = '';
  document.getElementById('item-content').value = '';
  document.getElementById('item-category').value = '';
}

function searchItems() {
  const keyword = document.getElementById('search-input').value.trim();
  showToast(`搜索: ${keyword}`, 'info');
}

async function saveItem() {
  const title = document.getElementById('item-title').value.trim();
  const content = document.getElementById('item-content').value.trim();
  const category = document.getElementById('item-category').value.trim();
  
  if (!title) {
    showToast('请输入标题', 'error');
    return;
  }
  
  try {
    await addData('knowledge_items', {
      title,
      content,
      category,
      createdAt: new Date()
    });
    
    showToast('知识条目创建成功', 'success');
    closeModal();
    loadKnowledgeItems();
    
    if (category) {
      await addOrUpdateCategory(category);
      loadCategories();
    }
  } catch (error) {
    console.error('创建知识条目失败:', error);
    showToast('创建知识条目失败', 'error');
  }
}

async function addOrUpdateCategory(name) {
  try {
    const result = await getData('categories', { name });
    if (result.data.length > 0) {
      const cat = result.data[0];
      await updateData('categories', cat._id, { count: (cat.count || 0) + 1 });
    } else {
      await addData('categories', { name, count: 1 });
    }
  } catch (error) {
    console.error('更新分类失败:', error);
  }
}

async function deleteItem(id) {
  if (!confirm('确定要删除这个知识条目吗？')) return;
  
  try {
    await deleteData('knowledge_items', id);
    showToast('知识条目已删除', 'success');
    loadKnowledgeItems();
  } catch (error) {
    console.error('删除知识条目失败:', error);
    showToast('删除知识条目失败', 'error');
  }
}

function closeModal() {
  document.getElementById('item-modal').style.display = 'none';
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