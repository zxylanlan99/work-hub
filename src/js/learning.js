document.addEventListener('DOMContentLoaded', async function() {
  await initCloudbase();
  
  loadGoals();
  
  document.getElementById('create-goal-btn').addEventListener('click', openCreateModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  document.getElementById('save-goal-btn').addEventListener('click', saveGoal);
  
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', filterGoals);
  });
});

async function loadGoals(filter = 'all') {
  try {
    let query = {};
    if (filter !== 'all') {
      query.status = filter;
    }
    
    const result = await getData('goals', query);
    const goals = result.data;
    
    if (goals.length === 0) {
      document.getElementById('goals-list').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-target"></i>
          <div class="empty-title">暂无学习目标</div>
          <div class="empty-desc">点击右上角按钮创建你的第一个学习目标</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('goals-list').innerHTML = goals.map(goal => `
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${goal.title}</h3>
            <p style="color: #6b7280; font-size: 14px;">${goal.description || '暂无描述'}</p>
          </div>
          <span class="badge ${getStatusBadgeClass(goal.status)}">${getStatusLabel(goal.status)}</span>
        </div>
        
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <div style="flex: 1;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">完成进度</div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${calculateProgress(goal)}%;"></div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #6b7280; margin-top: 4px;">
              ${calculateProgress(goal)}%
            </div>
          </div>
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 14px; color: #6b7280;">
            <i class="fas fa-calendar"></i> ${formatDate(goal.deadline)}
          </div>
          <div style="display: flex; gap: 8px;">
            ${goal.status === 'active' ? `
              <button class="btn btn-secondary" onclick="pauseGoal('${goal._id}')">
                <i class="fas fa-pause"></i> 暂停
              </button>
            ` : ''}
            ${goal.status === 'paused' ? `
              <button class="btn btn-primary" onclick="resumeGoal('${goal._id}')">
                <i class="fas fa-play"></i> 恢复
              </button>
            ` : ''}
            <button class="btn btn-danger" onclick="deleteGoal('${goal._id}')">
              <i class="fas fa-trash"></i> 删除
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载目标失败:', error);
    showToast('加载目标失败', 'error');
  }
}

function getStatusBadgeClass(status) {
  const classes = {
    active: 'badge-success',
    completed: 'badge-primary',
    paused: 'badge-warning'
  };
  return classes[status] || 'badge-info';
}

function getStatusLabel(status) {
  const labels = {
    active: '进行中',
    completed: '已完成',
    paused: '已暂停'
  };
  return labels[status] || status;
}

function calculateProgress(goal) {
  return Math.floor(Math.random() * 100);
}

function formatDate(date) {
  if (!date) return '未设置截止日期';
  const d = new Date(date);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function filterGoals(e) {
  document.querySelectorAll('[data-filter]').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  
  loadGoals(e.target.dataset.filter);
}

function openCreateModal() {
  document.getElementById('goal-modal').style.display = 'flex';
  document.getElementById('modal-title').textContent = '新建学习目标';
  document.getElementById('goal-title').value = '';
  document.getElementById('goal-description').value = '';
  document.getElementById('goal-deadline').value = '';
}

function closeModal() {
  document.getElementById('goal-modal').style.display = 'none';
}

async function saveGoal() {
  const title = document.getElementById('goal-title').value.trim();
  const description = document.getElementById('goal-description').value.trim();
  const deadline = document.getElementById('goal-deadline').value;
  
  if (!title) {
    showToast('请输入目标名称', 'error');
    return;
  }
  
  try {
    await addData('goals', {
      title,
      description,
      deadline: deadline ? new Date(deadline) : null,
      status: 'active',
      createdAt: new Date()
    });
    
    showToast('目标创建成功', 'success');
    closeModal();
    loadGoals();
  } catch (error) {
    console.error('创建目标失败:', error);
    showToast('创建目标失败', 'error');
  }
}

async function pauseGoal(id) {
  try {
    await updateData('goals', id, {
      status: 'paused',
      updatedAt: new Date()
    });
    showToast('目标已暂停', 'info');
    loadGoals();
  } catch (error) {
    console.error('暂停目标失败:', error);
    showToast('暂停目标失败', 'error');
  }
}

async function resumeGoal(id) {
  try {
    await updateData('goals', id, {
      status: 'active',
      updatedAt: new Date()
    });
    showToast('目标已恢复', 'success');
    loadGoals();
  } catch (error) {
    console.error('恢复目标失败:', error);
    showToast('恢复目标失败', 'error');
  }
}

async function deleteGoal(id) {
  if (!confirm('确定要删除这个目标吗？')) return;
  
  try {
    await deleteData('goals', id);
    showToast('目标已删除', 'success');
    loadGoals();
  } catch (error) {
    console.error('删除目标失败:', error);
    showToast('删除目标失败', 'error');
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
