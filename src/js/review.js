document.addEventListener('DOMContentLoaded', async function() {
  await initCloudbase();
  loadReviewCards();
  loadReviewStats();
  
  document.getElementById('generate-cards-btn').addEventListener('click', generateCards);
});

async function loadReviewCards() {
  try {
    const result = await getData('review_cards', { nextReview: { $lte: new Date() } });
    const cards = result.data;
    
    document.getElementById('due-count').textContent = cards.length;
    document.getElementById('queue-count').textContent = cards.length;
    
    if (cards.length === 0) {
      document.getElementById('review-queue').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-calendar-check-o"></i>
          <div class="empty-title">暂无复习任务</div>
          <div class="empty-desc">学习知识条目后会生成复习卡片</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('review-queue').innerHTML = cards.map(card => `
      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${card.question}</h3>
            <p style="color: #6b7280; font-size: 14px;">${card.category || '未分类'}</p>
          </div>
          <span class="badge ${getMasteryBadgeClass(card.mastery)}">${getMasteryLabel(card.mastery)}</span>
        </div>
        
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary" onclick="startReview('${card._id}')">开始复习</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载复习卡片失败:', error);
  }
}

function getMasteryBadgeClass(mastery) {
  if (mastery >= 0.8) return 'badge-success';
  if (mastery >= 0.5) return 'badge-warning';
  return 'badge-danger';
}

function getMasteryLabel(mastery) {
  if (mastery >= 0.8) return '已掌握';
  if (mastery >= 0.5) return '学习中';
  return '待复习';
}

async function loadReviewStats() {
  try {
    const total = await getData('review_cards');
    const mastered = await getData('review_cards', { mastery: { $gte: 0.8 } });
    const risk = await getData('review_cards', { mastery: { $lt: 0.3 } });
    
    document.getElementById('mastered-count').textContent = mastered.data.length;
    document.getElementById('risk-count').textContent = risk.data.length;
  } catch (error) {
    console.error('加载统计数据失败:', error);
  }
}

async function generateCards() {
  showToast('正在生成复习卡片...', 'info');
  
  try {
    await addData('review_cards', {
      question: 'SM-2算法是什么？',
      answer: 'SM-2算法是一个用于间隔重复学习的算法，由波兰科学家SuperMemo开发。它根据用户对卡片的评分来决定下次复习的时间间隔。',
      category: '学习方法',
      mastery: 0.3,
      nextReview: new Date(),
      createdAt: new Date()
    });
    
    await addData('review_cards', {
      question: '什么是主动回忆？',
      answer: '主动回忆是一种学习技巧，指在不看答案的情况下，尝试从记忆中提取信息。研究表明，主动回忆比被动阅读更有效。',
      category: '学习方法',
      mastery: 0.5,
      nextReview: new Date(),
      createdAt: new Date()
    });
    
    showToast('复习卡片生成成功', 'success');
    loadReviewCards();
    loadReviewStats();
  } catch (error) {
    console.error('生成卡片失败:', error);
    showToast('生成卡片失败', 'error');
  }
}

async function startReview(id) {
  try {
    const result = await getData('review_cards', { _id: id });
    const card = result.data[0];
    
    if (!card) return;
    
    const score = prompt(`请评分（1-5分）：\n\n问题：${card.question}\n\n答案：${card.answer}`);
    
    if (score === null) return;
    
    const mastery = Math.min(1, card.mastery + (parseInt(score) - 3) * 0.1);
    
    await updateData('review_cards', id, {
      mastery,
      lastReviewed: new Date(),
      nextReview: calculateNextReview(card, parseInt(score))
    });
    
    showToast('复习完成', 'success');
    loadReviewCards();
    loadReviewStats();
  } catch (error) {
    console.error('复习失败:', error);
    showToast('复习失败', 'error');
  }
}

function calculateNextReview(card, score) {
  const now = new Date();
  if (score >= 4) {
    now.setDate(now.getDate() + 7);
  } else if (score >= 3) {
    now.setDate(now.getDate() + 3);
  } else {
    now.setDate(now.getDate() + 1);
  }
  return now;
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