/**
 * StudyMind 复习计划页面
 * 基于 window.DB 数据服务层实现间隔重复复习系统
 * 版本: v2.0 | 日期: 2026-06-16
 */

/* global initCloudbase, StudyMind, utils */

/* ================================================================
   一、辅助函数
   ================================================================ */

/** 安全显示 toast */
function showToast(message, type = 'info') {
  if (window.utils && window.utils.toast) {
    window.utils.toast(message, type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info');
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/** 掌握度 → 徽章样式类 */
function getMasteryBadgeClass(mastery) {
  if (mastery >= 0.8) return 'badge-success';
  if (mastery >= 0.5) return 'badge-warning';
  return 'badge-danger';
}

/** 掌握度 → 中文标签 */
function getMasteryLabel(mastery) {
  if (mastery >= 0.8) return '已掌握';
  if (mastery >= 0.5) return '学习中';
  return '待复习';
}

/** 获取当前页面容器 */
function getPageContainer() {
  return document.getElementById('page-container') || document.body;
}

/* ================================================================
   二、数据加载
   ================================================================ */

/** 加载复习队列 (DB-R-007) */
async function loadReviewQueue() {
  try {
    const result = await window.DB.getReviewQueue();
    const cards = result.success ? result.data : [];

    const dueCountEl = document.getElementById('due-count');
    const queueCountEl = document.getElementById('queue-count');
    if (dueCountEl) dueCountEl.textContent = cards.length;
    if (queueCountEl) queueCountEl.textContent = cards.length;

    const queueEl = document.getElementById('review-queue');
    if (!queueEl) return;

    // 兼容加载失败
    if (!result.success) {
      queueEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <div class="empty-title">加载失败</div>
          <div class="empty-desc">${result.error || '请检查网络连接后重试'}</div>
        </div>
      `;
      return;
    }

    // 空状态
    if (cards.length === 0) {
      queueEl.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-calendar-check"></i>
          <div class="empty-title">暂无复习任务</div>
          <div class="empty-desc">学习知识条目后会生成复习卡片</div>
        </div>
      `;
      return;
    }

    // 渲染卡片列表
    queueEl.innerHTML = cards.map(card => `
      <div class="review-card-item" data-card-id="${card._id}" style="border:1px solid #e5e7eb; border-radius:12px; padding:20px; margin-bottom:12px; background:#fff;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <div style="flex:1; min-width:0;">
            <h3 style="font-size:16px; font-weight:600; margin-bottom:4px; word-break:break-word;">${escapeHtml(card.question)}</h3>
            <p style="color:#6b7280; font-size:13px;">${escapeHtml(card.category || '未分类')}</p>
          </div>
          <span class="badge ${getMasteryBadgeClass(card.mastery)}" style="flex-shrink:0; margin-left:12px;">${getMasteryLabel(card.mastery)}</span>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="startReview('${card._id}')">开始复习</button>
          <button class="btn btn-outline" style="font-size:12px;" onclick="viewCardHistory('${card._id}')">📊 历史</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载复习卡片失败:', error);
    showToast('加载复习卡片失败', 'error');
  }
}

/** 加载统计面板 (AGG-007 + DB-R-005 + DB-R-006) */
async function loadReviewStats() {
  try {
    // 并行加载统计
    const [statsResult, overdueResult, riskResult] = await Promise.all([
      window.DB.getReviewStats(),
      window.DB.getOverdueCards(),
      window.DB.getRiskCards()
    ]);

    if (statsResult.success) {
      const { mastered, risk } = statsResult.data;
      const masteredEl = document.getElementById('mastered-count');
      const riskEl = document.getElementById('risk-count');
      if (masteredEl) masteredEl.textContent = mastered;
      if (riskEl) riskEl.textContent = risk;
    }

    if (overdueResult.success) {
      const overdueEl = document.getElementById('overdue-count');
      if (overdueEl) overdueEl.textContent = overdueResult.data.length;
    }
  } catch (error) {
    console.error('加载统计数据失败:', error);
  }
}

/* ================================================================
   三、复习流程 (SM-2 算法由 DB.submitReviewScore 内部驱动)
   ================================================================ */

/** 开始复习某张卡片 */
async function startReview(cardId) {
  try {
    // 标记为复习中 (DB-U-008)
    await window.DB.startReviewCard(cardId);

    // 获取卡片详情 (DB-R-008)
    const result = await window.DB.getReviewCardDetail(cardId);
    if (!result.success || !result.data || result.data.length === 0) {
      showToast('卡片不存在', 'error');
      return;
    }

    const card = Array.isArray(result.data) ? result.data[0] : result.data;
    showReviewModal(card);
  } catch (error) {
    console.error('开始复习失败:', error);
    showToast('开始复习失败', 'error');
  }
}

/** 打开复习弹窗 */
function showReviewModal(card) {
  // 移除已有弹窗
  const existing = document.getElementById('review-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'review-modal';
  overlay.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <div class="modal-title">📖 复习卡片</div>
        <span class="modal-close" onclick="closeReviewModal()">&times;</span>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:16px;">
          <h3 style="font-size:14px; color:#6b7280; margin-bottom:8px;">问题</h3>
          <p style="font-size:16px; font-weight:600; line-height:1.6;">${escapeHtml(card.question)}</p>
        </div>
        <div id="review-answer-area" style="display:none; border-top:1px solid #e5e7eb; padding-top:16px;">
          <h3 style="font-size:14px; color:#6b7280; margin-bottom:8px;">答案</h3>
          <p style="font-size:15px; line-height:1.6; color:#374151;">${escapeHtml(card.answer)}</p>
          <div style="margin-top:16px;">
            <p style="font-weight:600; margin-bottom:10px; font-size:14px;">请为本次回忆打分：</p>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              <button class="btn" style="background:#fee2e2; color:#dc2626; flex:1; min-width:80px;" onclick="submitRating('${card._id}', 1)">1<br><small>完全忘记</small></button>
              <button class="btn" style="background:#fef3c7; color:#d97706; flex:1; min-width:80px;" onclick="submitRating('${card._id}', 2)">2<br><small>记得一点</small></button>
              <button class="btn" style="background:#fef3c7; color:#d97706; flex:1; min-width:80px;" onclick="submitRating('${card._id}', 3)">3<br><small>勉强记得</small></button>
              <button class="btn" style="background:#dcfce7; color:#16a34a; flex:1; min-width:80px;" onclick="submitRating('${card._id}', 4)">4<br><small>记得不错</small></button>
              <button class="btn" style="background:#dcfce7; color:#16a34a; flex:1; min-width:80px;" onclick="submitRating('${card._id}', 5)">5<br><small>完全掌握</small></button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="reveal-answer-btn" onclick="revealAnswer()">🔍 显示答案</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // 点击遮罩关闭
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeReviewModal();
  });
}

/** 显示答案区域 */
function revealAnswer() {
  const answerArea = document.getElementById('review-answer-area');
  const revealBtn = document.getElementById('reveal-answer-btn');
  if (answerArea) answerArea.style.display = 'block';
  if (revealBtn) revealBtn.style.display = 'none';
}

/** 关闭复习弹窗 */
function closeReviewModal() {
  const overlay = document.getElementById('review-modal');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }
  document.body.style.overflow = '';
}

/** 提交评分 (DB-U-007: SM-2 算法 + 自动写历史) */
async function submitRating(cardId, quality) {
  try {
    const result = await window.DB.submitReviewScore(cardId, quality);
    if (result.success) {
      const { mastery, interval } = result.data;
      showToast(
        `复习完成！掌握度 ${Math.round(mastery * 100)}%，下次复习 ${interval} 天后`,
        'success'
      );
    } else {
      showToast(result.error || '评分失败', 'error');
    }
  } catch (error) {
    console.error('提交评分失败:', error);
    showToast('评分失败', 'error');
  }

  closeReviewModal();
  loadReviewQueue();
  loadReviewStats();
}

/* ================================================================
   四、卡片操作
   ================================================================ */

/** 查看卡片复习历史 (DB-R-009) */
async function viewCardHistory(cardId) {
  try {
    const result = await window.DB.getMasteryHistory(cardId);
    if (!result.success || !result.data || result.data.length === 0) {
      showToast('暂无复习历史', 'info');
      return;
    }

    const history = result.data;
    const items = history.slice(0, 10).map(h => {
      const date = new Date(h.reviewedAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      return `<li style="margin-bottom:6px; font-size:13px;">${dateStr} — 评分 ${h.quality}/5，掌握度 ${Math.round((h.mastery || 0) * 100)}%</li>`;
    }).join('');

    StudyMind.modal.create({
      title: '📊 复习历史',
      content: `<ul style="list-style:none; padding:0; max-height:300px; overflow-y:auto;">${items || '<li style="color:#9ca3af;">暂无记录</li>'}</ul>`,
      size: 'sm',
      buttons: [{ text: '关闭', type: 'secondary', action: 'close' }]
    });
  } catch (error) {
    console.error('加载历史失败:', error);
    showToast('加载历史失败', 'error');
  }
}

/** 生成示例卡片 (DB.createReviewCard) */
async function generateCards() {
  showToast('正在生成复习卡片...', 'info');

  try {
    await window.DB.createReviewCard({
      question: 'SM-2算法是什么？',
      answer: 'SM-2算法是一个用于间隔重复学习的算法，由波兰科学家SuperMemo开发。它根据用户对卡片的评分来决定下次复习的时间间隔。',
      category: '学习方法'
    });

    await window.DB.createReviewCard({
      question: '什么是主动回忆？',
      answer: '主动回忆是一种学习技巧，指在不看答案的情况下，尝试从记忆中提取信息。研究表明，主动回忆比被动阅读更有效。',
      category: '学习方法'
    });

    showToast('复习卡片生成成功', 'success');
    loadReviewQueue();
    loadReviewStats();
  } catch (error) {
    console.error('生成卡片失败:', error);
    showToast('生成卡片失败', 'error');
  }
}

/**
 * AI-020: 生成复习练习题
 * 默认使用当前队列中的卡片，生成选择题、填空题、问答题
 */
async function generateReviewExercises() {
  try {
    showToast('AI 正在生成练习题…', 'info');
    const queueResult = await window.DB.getReviewQueue();
    const cards = queueResult.success ? queueResult.data : [];
    const cardIds = cards.slice(0, 10).map(c => c._id);

    const result = await window.DB.generateReviewExercises({
      cardIds: cardIds,
      questionTypeRatio: { choice: 0.5, fill: 0.3, qa: 0.2 },
      difficulty: 'mixed',
      count: 5
    });

    if (!result.success || !result.data || !result.data.exercises) {
      showToast(result.error || '生成练习题失败', 'error');
      return;
    }

    _showExercisesModal(result.data.exercises);
  } catch (error) {
    console.error('生成练习题失败:', error);
    showToast('生成练习题失败', 'error');
  }
}

/** 显示练习题弹窗 */
function _showExercisesModal(exercises) {
  const existing = document.getElementById('review-exercises-modal');
  if (existing) existing.remove();

  let html = '<div style="max-height:420px;overflow:auto;">';
  exercises.forEach((ex, i) => {
    html += '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px;">';
    html += '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">第 ' + (i + 1) + ' 题 · ' + _typeLabel(ex.type) + ' · 难度 ' + (ex.difficulty || 'medium') + '</div>';
    html += '<div style="font-weight:600;margin-bottom:8px;">' + escapeHtml(ex.question) + '</div>';
    if (ex.options && ex.options.length > 0) {
      html += '<ul style="margin:0 0 8px 0;padding-left:18px;font-size:13px;">';
      ex.options.forEach(opt => {
        html += '<li>' + escapeHtml(opt.key + '. ' + opt.text) + '</li>';
      });
      html += '</ul>';
    }
    html += '<div style="font-size:13px;color:#16a34a;">答案：' + escapeHtml(ex.answer) + '</div>';
    if (ex.explanation) {
      html += '<div style="font-size:12px;color:#6b7280;margin-top:6px;">解析：' + escapeHtml(ex.explanation) + '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'review-exercises-modal';
  overlay.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title">AI 生成的复习练习题</div>
        <span class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('show')">&times;</span>
      </div>
      <div class="modal-body">${html}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').classList.remove('show')">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function _typeLabel(type) {
  const map = { choice: '选择题', fill: '填空题', qa: '问答题' };
  return map[type] || type;
}

/* ================================================================
   五、工具与入口
   ================================================================ */

/** 简单 HTML 转义 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * initReviewPage — 全局入口函数
 * 由框架 StudyMind.nav.loadPage 在动态加载 review 页面后调用
 * 对应 common.js 中 pageInfo.review.init = 'initReviewPage'
 */
async function initReviewPage() {
  // 1. 初始化 CloudBase（idempotent，已初始化则直接返回）
  await initCloudbase().catch(err => console.error('CloudBase init failed:', err));

  // 2. SPIN 加载：在队列区域显示骨架屏
  const queueEl = document.getElementById('review-queue');
  if (queueEl) {
    queueEl.innerHTML = `
      <div class="loading-spin" style="display:flex; align-items:center; justify-content:center; padding:40px; flex-direction:column; gap:12px;">
        <div class="spinner" style="width:36px; height:36px; border:3px solid #e5e7eb; border-top-color:#6366f1; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
        <span style="color:#6b7280; font-size:14px;">加载复习数据…</span>
      </div>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
  }

  // 3. 并行加载队列与统计
  await Promise.all([
    loadReviewQueue(),
    loadReviewStats()
  ]);

  // 4. 绑定事件
  const generateBtn = document.getElementById('generate-cards-btn');
  if (generateBtn) {
    // 移除旧事件避免重复绑定
    generateBtn.removeEventListener('click', generateCards);
    generateBtn.addEventListener('click', generateCards);
  }

  const exercisesBtn = document.getElementById('generate-exercises-btn');
  if (exercisesBtn) {
    exercisesBtn.removeEventListener('click', generateReviewExercises);
    exercisesBtn.addEventListener('click', generateReviewExercises);
  }

  // 5. ESC 键关闭复习弹窗
  document.addEventListener('keydown', function handleEsc(e) {
    if (e.key === 'Escape') closeReviewModal();
  });
}

// 挂载到 window 供框架调用
window.initReviewPage = initReviewPage;
