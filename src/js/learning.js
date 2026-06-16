/**
 * StudyMind 学习计划页面 (pages/plan.html)
 * 使用 window.DB 数据服务层，所有 DB 调用通过 try/catch 包裹
 * SPIN 框架通过 common.js 调用 initLearningPage() 进行初始化
 */

/* ================================================================
   状态变量
   ================================================================ */
let planFilter = 'all';
let currentDetailGoalId = null;
/** 缓存的目标+任务数据，用于排序和进度计算 */
let goalsCache = [];

/* ================================================================
   入口函数 — 由 common.js/SPIN 框架调用
   ================================================================ */
async function initLearningPage() {
  console.log('Initializing learning page (DB-backed)...');
  try {
    await initCloudbase();
  } catch (e) {
    console.error('CloudBase 初始化失败:', e);
  }

  // 加载统计数据（非阻塞）
  _loadPlanStats();

  // 加载主数据 & 渲染
  await _loadGoals(planFilter);

  // 加载暖身/续接数据（非阻塞）
  _loadWarmupData();
  _loadResumeData();

  // 覆盖 plan.html 内联脚本中仅操作 mockData 的关键函数，
  // 使其指向 DB 版本（内联脚本 eval 晚于本文件，需在 init 中重新赋值）
  _patchGlobalFunctions();

  // 绑定遮罩关闭
  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('show');
    }
  });
}

// 全局暴露
window.initLearningPage = initLearningPage;

/* ================================================================
   数据加载
   ================================================================ */

/** 加载目标卡片列表 */
async function _loadGoals(filter) {
  try {
    const status = (filter && filter !== 'all') ? filter : undefined;
    const result = await DB.getGoals(status);

    if (!result.success) {
      console.error('加载目标失败:', result.error);
      _showGoalsError();
      return;
    }

    const goals = result.data || [];

    // 批量获取所有目标的任务以计算进度
    await _attachTasksProgress(goals);

    // 缓存用于排序
    goalsCache = goals;
    _updateGoalStats(goals);
    _renderGoalCards(filter);
  } catch (error) {
    console.error('加载目标失败:', error);
    _showGoalsError();
  }
}

/** 为每个目标附加进度数据 */
async function _attachTasksProgress(goals) {
  if (!goals.length) return;
  try {
    const goalIds = goals.map(g => g._id);
    // 并行查询所有任务
    const taskPromises = goalIds.map(gid =>
      DB._exec(DB._collection('tasks').where({ goalId: gid }).get())
    );
    const taskResults = await Promise.all(taskPromises);

    goals.forEach((goal, i) => {
      const tasks = (taskResults[i].success ? taskResults[i].data : []) || [];
      goal._totalTasks = tasks.length;
      goal._completedTasks = tasks.filter(t => t.status === 'completed').length;
    });
  } catch (e) {
    console.error('附加任务进度失败:', e);
  }
}

/** 加载计划统计 */
async function _loadPlanStats() {
  try {
    const result = await DB.getPlanStats();
    if (result.success && result.data) {
      const el1 = document.getElementById('planActiveCount');
      const el2 = document.getElementById('planPausedCount');
      const el3 = document.getElementById('planDoneCount');
      if (el1) el1.textContent = result.data.active;
      if (el2) el2.textContent = result.data.paused;
      if (el3) el3.textContent = result.data.completed;
    }
  } catch (error) {
    console.error('加载计划统计失败:', error);
  }
}

/** 更新统计数据 */
function _updateGoalStats(goals) {
  const el1 = document.getElementById('planActiveCount');
  const el2 = document.getElementById('planPausedCount');
  const el3 = document.getElementById('planDoneCount');
  if (el1) el1.textContent = goals.filter(g => g.status === 'active').length;
  if (el2) el2.textContent = goals.filter(g => g.status === 'paused').length;
  if (el3) el3.textContent = goals.filter(g => g.status === 'completed').length;
}

/** 加载暖身数据 */
async function _loadWarmupData() {
  try {
    // 昨日回顾
    const reviewResult = await DB.getYesterdayReview();
    if (reviewResult.success && reviewResult.data && reviewResult.data.length > 0) {
      const yesterdayText = document.getElementById('planYesterdayText');
      if (yesterdayText) {
        const item = reviewResult.data[reviewResult.data.length - 1];
        yesterdayText.textContent = item.cardId ? '已复习卡片' : '昨日完成学习任务';
      }
    }

    // 快问快答（异步，不阻塞）
    try {
      const quizResult = await DB.getQuiz();
      const quizQ = document.getElementById('planQuizQuestion');
      if (quizQ && quizResult.success) {
        quizQ.textContent = typeof quizResult.content === 'string'
          ? quizResult.content.substring(0, 80)
          : '今天学习了什么新知识？';
      }
    } catch (_) { /* quiz 失败不影响页面 */ }
  } catch (error) {
    console.error('加载暖身数据失败:', error);
  }
}

/** 加载续接数据 */
async function _loadResumeData() {
  try {
    const result = await DB.getLastBreakpoint();
    if (result.success && result.data) {
      const goals = result.data.goals || [];
      const lastGoal = goals.length > 0 ? goals[0] : null;

      const titleEl = document.getElementById('planResumeTitle');
      const subEl = document.getElementById('planResumeSub');

      if (lastGoal) {
        if (titleEl) titleEl.textContent = '继续上次学习：' + (lastGoal.title || '学习目标');
        if (subEl) subEl.textContent = '上次更新于 ' + _formatDate(lastGoal.updatedAt || lastGoal.createdAt);
      }
    }
  } catch (error) {
    console.error('加载续接数据失败:', error);
  }
}

/** 显示加载错误 */
function _showGoalsError() {
  const grid = document.getElementById('planGoalsGrid');
  const empty = document.getElementById('planEmptyState');
  if (grid) grid.innerHTML = '';
  if (empty) {
    empty.style.display = 'flex';
    const title = empty.querySelector('.empty-title');
    const desc = empty.querySelector('.empty-desc');
    if (title) title.textContent = '加载失败';
    if (desc) desc.textContent = '请检查网络连接后刷新重试';
  }
}

/* ================================================================
   渲染
   ================================================================ */

/** 渲染目标卡片网格 */
function _renderGoalCards(filter) {
  const grid = document.getElementById('planGoalsGrid');
  const empty = document.getElementById('planEmptyState');
  if (!grid || !empty) return;

  const goals = filter === 'all'
    ? goalsCache
    : goalsCache.filter(g => g.status === filter);

  if (goals.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    const title = empty.querySelector('.empty-title');
    const desc = empty.querySelector('.empty-desc');
    if (title) title.textContent = '还没有学习目标';
    if (desc) desc.textContent = '创建你的第一个学习目标，开始系统化学习吧';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = goals.map(g => _goalCardHTML(g)).join('');
}

/** 单个目标卡片 HTML */
function _goalCardHTML(goal) {
  const status = goal.status || 'active';
  const stateClass = status === 'active' ? 'active-state'
    : (status === 'paused' ? 'paused-state' : 'completed-state');

  let badgeHtml;
  if (status === 'active') badgeHtml = '<span class="badge badge-active">🟢 进行中</span>';
  else if (status === 'paused') badgeHtml = '<span class="badge badge-paused">⏸️ 暂停中</span>';
  else badgeHtml = '<span class="badge badge-completed">✅ 已完成</span>';

  const totalTasks = goal._totalTasks || 0;
  const completedTasks = goal._completedTasks || 0;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const progressColor = status === 'completed' ? 'success'
    : (status === 'paused' ? 'warning' : 'primary');

  let metaHtml;
  if (status === 'completed') {
    metaHtml = `<span>✅ 已完成</span><span>📋 ${completedTasks}/${totalTasks} 任务</span>`;
  } else {
    metaHtml = `<span>📅 截止 ${_formatDate(goal.deadline)}</span><span>📋 ${completedTasks}/${totalTasks} 任务</span>`;
    if (goal.weeklyHours) metaHtml += `<span>⏱️ ${goal.weeklyHours}</span>`;
  }

  const tagsHtml = goal.domain
    ? `<span class="tag">🏷️ ${goal.domain}</span>`
    : '';

  let footerRight = '';
  if (status === 'completed') {
    footerRight = `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_handleGoalSummary('${goal._id}')">📋 总结</button>`;
  } else if (status === 'paused') {
    footerRight = `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_handleResumeGoal('${goal._id}')">▶ 恢复</button>`;
  } else {
    footerRight = `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_handlePauseGoal('${goal._id}')">⏸ 暂停</button>`;
  }
  footerRight += `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_handleDeleteGoal('${goal._id}')" style="color:var(--danger)">🗑</button>`;

  return `<div class="goal-card ${stateClass}" onclick="_openPlanDetail('${goal._id}')">
    <div class="goal-header">
      <div class="goal-title">${_escapeHTML(goal.title || '未命名目标')}</div>
      ${badgeHtml}
    </div>
    <div class="goal-desc">${_escapeHTML(goal.description || '暂无描述')}</div>
    <div class="progress-bar-wrap">
      <div class="progress-label"><span>总体进度</span><span style="color:var(--${progressColor});font-weight:600;">${progress}%</span></div>
      <div class="progress-bar"><div class="progress-fill ${progressColor}" style="width:${progress}%"></div></div>
    </div>
    <div class="goal-meta">${metaHtml}</div>
    <div class="goal-footer">
      <div style="display:flex;gap:6px;">${tagsHtml}</div>
      <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">${footerRight}</div>
    </div>
  </div>`;
}

/** 渲染目标详情视图 */
async function _renderDetailView(goalId) {
  try {
    const result = await DB.getGoalDetail(goalId);
    if (!result.success || !result.data) {
      toast('目标不存在或加载失败', 'error');
      return;
    }

    const goal = result.data;
    currentDetailGoalId = goalId;

    // 切换视图
    const listView = document.getElementById('planListView');
    const detailView = document.getElementById('planDetailView');
    if (listView) listView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';

    // 更新顶栏
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = '🎯 ' + (goal.title || '学习目标');
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight) {
      topbarRight.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="openDiagModal()">🤖 AI诊断</button>';
    }

    // 填充详情
    const dt = document.getElementById('detailTitle');
    const dd = document.getElementById('detailDesc');
    const dp = document.getElementById('detailProgress');
    const dpf = document.getElementById('detailProgressFill');
    const dts = document.getElementById('detailTaskSummary');
    if (dt) dt.textContent = goal.title || '未命名目标';
    if (dd) dd.textContent = goal.description || '暂无描述';

    const tasks = goal.tasks || [];
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    if (dp) dp.textContent = progress + '%';
    if (dpf) dpf.style.width = progress + '%';
    if (dts) dts.textContent = completed + ' / ' + total + ' 任务完成';

    // 状态徽章
    const badge = document.getElementById('detailStatusBadge');
    if (badge) {
      const status = goal.status || 'active';
      if (status === 'active') {
        badge.className = 'badge badge-active';
        badge.textContent = '🟢 进行中';
      } else if (status === 'paused') {
        badge.className = 'badge badge-paused';
        badge.textContent = '⏸️ 暂停中';
      } else {
        badge.className = 'badge badge-completed';
        badge.textContent = '✅ 已完成';
      }
    }

    // 元数据
    const metaEl = document.getElementById('detailMeta');
    if (metaEl) {
      metaEl.innerHTML =
        `<div class="detail-meta-item">📅 <strong>创建</strong> ${_formatDate(goal.createdAt)}</div>` +
        `<div class="detail-meta-item">🏁 <strong>截止</strong> ${_formatDate(goal.deadline)}</div>` +
        `<div class="detail-meta-item">📋 <strong>任务</strong> 已完成 ${completed}/${total}</div>`;
    }

    // 渲染里程碑
    _renderMilestones(goal.milestones || [], tasks, goal._id || goalId);

    // 滚动到顶部
    if (detailView) detailView.scrollIntoView();
  } catch (error) {
    console.error('加载目标详情失败:', error);
    toast('加载目标详情失败', 'error');
  }
}

/** 渲染里程碑与任务列表 */
function _renderMilestones(milestones, tasks, goalId) {
  const container = document.getElementById('milestonesContainer');
  if (!container) return;

  if (milestones.length === 0) {
    container.innerHTML = '<div style="padding:16px;color:var(--gray-400);text-align:center;">暂无里程碑，点击上方按钮添加</div>';
    return;
  }

  container.innerHTML = milestones.map(m => {
    const iconClass = m.status === 'completed' ? 'done' : (m.status === 'active' ? 'active' : 'pending');
    const iconEmoji = m.status === 'completed' ? '✅' : (m.status === 'active' ? '🔵' : '⏳');
    const pColor = m.status === 'completed' ? 'success' : 'primary';
    const mTasks = tasks.filter(t => t.milestoneId === m._id);
    const mCompleted = mTasks.filter(t => t.status === 'completed').length;
    const mTotal = mTasks.length;
    const mProgress = mTotal > 0 ? Math.round((mCompleted / mTotal) * 100) : 0;
    const hasTasks = mTasks.length > 0;
    const toggleClass = hasTasks ? 'open' : '';

    const tasksHtml = hasTasks
      ? mTasks.map(t => {
          const checkClass = t.status === 'completed' ? 'done' : (t.status === 'in_progress' ? 'in-progress' : '');
          const checkContent = t.status === 'completed' ? '✓' : (t.status === 'in_progress' ? '●' : '');
          const titleClass = t.status === 'completed' ? 'done-text' : '';
          const priorityClass = t.priority === 'high' ? 'priority-high'
            : (t.priority === 'mid' || t.priority === 'medium' ? 'priority-mid' : 'priority-low');
          const metaHtml = t.deadline
            ? `<span class="task-tag ${t.status !== 'completed' && new Date(t.deadline) < new Date() ? 'overdue' : ''}">📅 ${_formatDate(t.deadline)}</span>`
            : '';
          return `<div class="task-item">
            <div class="task-check ${checkClass}" onclick="event.stopPropagation();_handleTaskComplete('${t._id}', '${goalId}', this)">${checkContent}</div>
            <div class="task-priority ${priorityClass}"></div>
            <div class="task-body">
              <div class="task-title ${titleClass}">${_escapeHTML(t.title || '未命名任务')}</div>
              <div class="task-meta">${metaHtml}</div>
            </div>
            <div class="task-actions">
              <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_handleDeleteTask('${t._id}', '${goalId}')">🗑</button>
            </div>
          </div>`;
        }).join('')
      : '<div style="padding:8px 0;color:var(--gray-400);font-size:12.5px;">暂无任务</div>';

    return `<div class="milestone-item">
      <div class="milestone-header" onclick="_toggleMilestone(this)">
        <span class="milestone-toggle ${toggleClass}">▶</span>
        <div class="milestone-icon ${iconClass}">${iconEmoji}</div>
        <div class="milestone-info">
          <div class="milestone-name">${_escapeHTML(m.title || '未命名里程碑')}</div>
          <div class="milestone-sub">${m.status === 'completed' ? '已完成' : (m.status === 'active' ? '进行中 · ' + mCompleted + '/' + mTotal + ' 任务完成' : '待开始 · ' + mTotal + ' 个任务')}</div>
        </div>
        <div class="milestone-progress">
          <div style="color:var(--${pColor});font-weight:600;">${mProgress}%</div>
          <div class="mini-progress"><div class="mini-fill ${pColor === 'success' ? 'success' : ''}" style="width:${mProgress}%"></div></div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_handleDeleteMilestone('${m._id}', '${goalId}')" style="margin-left:8px;color:var(--danger);">🗑</button>
      </div>
      <div class="tasks-list">${tasksHtml}</div>
    </div>`;
  }).join('');
}

/* ================================================================
   目标 CRUD (DB-backed)
   ================================================================ */

/** 创建目标 (支持手动模式与 AI 方案确认两种入口) */
async function _handleCreateGoal() {
  // 优先取 AI 生成确认页（step 3）的标题，否则取 step 1 的标题
  const genTitleEl = document.getElementById('genGoalTitle');
  const titleEl = document.getElementById('goalTitleInput');

  let title = genTitleEl ? genTitleEl.value.trim() : '';
  if (!title && titleEl) title = titleEl.value.trim();

  if (!title) {
    toast('请输入目标名称', 'error');
    return;
  }

  const descEl = document.getElementById('goalDescription');
  const deadlineEl = document.getElementById('goalDeadline');
  const weeklyEl = document.getElementById('goalWeeklyHours');
  const domainEl = document.getElementById('genGoalDomain');
  const topicEl = document.getElementById('genGoalTopic');

  try {
    const result = await DB.createGoal({
      title,
      description: descEl ? descEl.value.trim() : '',
      domain: domainEl ? domainEl.value : '',
      deadline: deadlineEl && deadlineEl.value ? new Date(deadlineEl.value) : null,
      weeklyHours: weeklyEl ? weeklyEl.value : '',
      currentLevel: topicEl ? topicEl.value : ''
    });

    if (result.success) {
      toast('目标创建成功', 'success');

      // 重置向导状态
      _resetCreateWizard();

      _closePlanModal('createGoalModal');
      await _loadGoals(planFilter);
    } else {
      toast('创建失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('创建目标失败:', error);
    toast('创建目标失败', 'error');
  }
}

/** 重置创建目标向导 */
function _resetCreateWizard() {
  const step1 = document.getElementById('createStep1');
  const step2 = document.getElementById('createStep2');
  const step3 = document.getElementById('createStep3');
  if (step1) step1.style.display = 'block';
  if (step2) step2.style.display = 'none';
  if (step3) step3.style.display = 'none';

  const nextBtn = document.getElementById('createNextBtn');
  const manualBtn = document.getElementById('createManualBtn');
  const confirmBtn = document.getElementById('createConfirmBtn');
  const prevBtn = document.getElementById('createPrevBtn');
  if (nextBtn) nextBtn.style.display = 'inline-flex';
  if (manualBtn) manualBtn.style.display = 'inline-flex';
  if (confirmBtn) confirmBtn.style.display = 'none';
  if (prevBtn) prevBtn.style.display = 'none';

  window.createStep = 1;
  const steps = document.getElementById('createSteps');
  if (steps) {
    steps.querySelectorAll('.step').forEach((s, i) => {
      s.classList.toggle('active', i === 0);
      s.classList.toggle('done', false);
    });
  }
}

/** 更新目标 */
async function _handleUpdateGoal(goalId, data) {
  try {
    const result = await DB.updateGoal(goalId, data);
    if (result.success) {
      toast('目标已更新', 'success');
      await _loadGoals(planFilter);
      if (currentDetailGoalId === goalId) {
        await _renderDetailView(goalId);
      }
    } else {
      toast('更新失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('更新目标失败:', error);
    toast('更新目标失败', 'error');
  }
}

/** 删除目标 */
async function _handleDeleteGoal(goalId) {
  if (!confirm('确定要删除这个目标及其所有里程碑与任务吗？此操作不可撤销。')) return;

  try {
    const result = await DB.deleteGoal(goalId);
    if (result.success) {
      toast('目标已删除', 'success');
      await _loadGoals(planFilter);
      // 如果当前正在查看该目标的详情，返回列表
      if (currentDetailGoalId === goalId) {
        _closePlanDetail();
      }
    } else {
      toast('删除失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('删除目标失败:', error);
    toast('删除目标失败', 'error');
  }
}

/** 暂停目标 */
async function _handlePauseGoal(goalId) {
  try {
    const result = await DB.pauseGoal(goalId);
    if (result.success) {
      toast('目标已暂停', 'info');
      await _loadGoals(planFilter);
    } else {
      toast('暂停失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('暂停目标失败:', error);
    toast('暂停目标失败', 'error');
  }
}

/** 恢复目标 */
async function _handleResumeGoal(goalId) {
  try {
    const result = await DB.resumeGoal(goalId);
    if (result.success) {
      toast('目标已恢复', 'success');
      await _loadGoals(planFilter);
    } else {
      toast('恢复失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('恢复目标失败:', error);
    toast('恢复目标失败', 'error');
  }
}

/** AI 学习总结 */
async function _handleGoalSummary(goalId) {
  try {
    toast('正在生成学习总结…', 'info');
    const result = await DB.aiGoalSummary(goalId);
    if (result.success) {
      toast('学习总结已生成', 'success');
    } else {
      toast('生成总结失败', 'error');
    }
  } catch (error) {
    console.error('生成学习总结失败:', error);
    toast('生成学习总结失败', 'error');
  }
}

/* ================================================================
   任务 CRUD (DB-backed)
   ================================================================ */

/** 创建任务 */
async function _handleCreateTask() {
  if (!currentDetailGoalId) {
    toast('请先选择目标', 'warning');
    return;
  }

  const nameEl = document.getElementById('taskName');
  const milestoneEl = document.getElementById('taskMilestone');
  const deadlineEl = document.getElementById('taskDeadline');
  const durationEl = document.getElementById('taskDuration');
  const priorityEl = document.getElementById('taskPriority');
  const descEl = document.getElementById('taskDesc');
  const aiTypeEl = document.getElementById('taskAiType');

  const title = nameEl ? nameEl.value.trim() : '';
  if (!title) {
    toast('请输入任务名称', 'warning');
    return;
  }

  // 解析耗时
  let estimatedHours = 0;
  if (durationEl) {
    const val = durationEl.value;
    if (val.includes('30')) estimatedHours = 0.5;
    else if (val.includes('45')) estimatedHours = 0.75;
    else if (val.includes('60')) estimatedHours = 1;
    else if (val.includes('90')) estimatedHours = 1.5;
    else if (val.includes('120')) estimatedHours = 2;
  }

  try {
    const result = await DB.createTask({
      goalId: currentDetailGoalId,
      milestoneId: milestoneEl ? milestoneEl.value : '',
      title,
      description: descEl ? descEl.value.trim() : '',
      deadline: deadlineEl && deadlineEl.value ? new Date(deadlineEl.value) : null,
      estimatedHours,
      priority: priorityEl ? priorityEl.value : 'medium',
      aiType: aiTypeEl ? aiTypeEl.value : ''
    });

    if (result.success) {
      toast('任务创建成功', 'success');
      _closePlanModal('addTaskModal');
      await _renderDetailView(currentDetailGoalId);
    } else {
      toast('创建任务失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('创建任务失败:', error);
    toast('创建任务失败', 'error');
  }
}

/** 切换任务完成状态 */
async function _handleTaskComplete(taskId, goalId, el) {
  try {
    const result = await DB.completeTask(taskId);
    if (result.success) {
      toast('任务完成！', 'success');
      await _renderDetailView(goalId);
      await _loadGoals(planFilter);
    } else {
      toast('操作失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('完成任务失败:', error);
    toast('完成任务失败', 'error');
  }
}

/** 删除任务 */
async function _handleDeleteTask(taskId, goalId) {
  if (!confirm('确定要删除此任务吗？')) return;
  try {
    // 使用 update 标记删除或直接 remove
    // 由于没有专用的 deleteTask，使用 CloudBase 直接操作
    await DB._exec(DB._collection('tasks').doc(taskId).remove());
    toast('任务已删除', 'success');
    await _renderDetailView(goalId);
    await _loadGoals(planFilter);
  } catch (error) {
    console.error('删除任务失败:', error);
    toast('删除任务失败', 'error');
  }
}

/* ================================================================
   里程碑 CRUD
   ================================================================ */

/** 删除里程碑 */
async function _handleDeleteMilestone(milestoneId, goalId) {
  if (!confirm('确定要删除此里程碑及其所有任务吗？')) return;
  try {
    const result = await DB.deleteMilestone(milestoneId);
    if (result.success) {
      toast('里程碑已删除', 'success');
      await _renderDetailView(goalId);
      await _loadGoals(planFilter);
    } else {
      toast('删除失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('删除里程碑失败:', error);
    toast('删除里程碑失败', 'error');
  }
}

/* ================================================================
   AI 操作
   ================================================================ */

/** AI 辅助创建目标 */
async function _handleAICreateGoal() {
  const descEl = document.getElementById('goalDescription');
  const description = descEl ? descEl.value.trim() : '';
  if (!description) {
    toast('请描述你想学习的内容', 'warning');
    return;
  }

  try {
    toast('AI 正在分析你的学习目标…', 'info');
    const result = await DB.aiCreateGoal(description);
    if (result.success) {
      // 填充 AI 生成结果到步骤 3
      const content = typeof result.content === 'string' ? result.content : '已生成学习目标方案';
      const genTitle = document.getElementById('genGoalTitle');
      if (genTitle) genTitle.value = content.substring(0, 50);

      toast('AI 方案已生成', 'success');
    } else {
      toast('AI 生成失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('AI 创建目标失败:', error);
    toast('AI 创建目标失败', 'error');
  }
}

/** AI 诊断 */
async function _handleAIDiagnoseGoal() {
  if (!currentDetailGoalId) {
    toast('请先打开一个目标', 'warning');
    return;
  }

  try {
    toast('AI 正在分析进度…', 'info');
    const result = await DB.aiDiagnoseGoal(currentDetailGoalId);
    if (result.success) {
      toast('诊断报告已生成', 'success');
      openDiagModal();
    } else {
      toast('AI 诊断失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('AI 诊断失败:', error);
    toast('AI 诊断失败', 'error');
  }
}

/* ================================================================
   弹性排期
   ================================================================ */

async function _handleReschedule() {
  if (!currentDetailGoalId) {
    toast('请先打开一个目标', 'warning');
    return;
  }

  try {
    const result = await DB.rescheduleGoal(currentDetailGoalId, { taskUpdates: [] });
    if (result.success) {
      toast('排期已更新', 'success');
      _closePlanModal('rescheduleModal');
      await _renderDetailView(currentDetailGoalId);
    } else {
      toast('排期失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('排期失败:', error);
    toast('排期失败', 'error');
  }
}

/* ================================================================
   UI 辅助函数
   ================================================================ */

/** 切换子标签筛选 */
function _switchPlanSubTab(el, filter) {
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  planFilter = filter;
  _renderGoalCards(filter);
}

/** 排序目标 */
function _sortPlanGoals(type) {
  if (type === 'progress') {
    goalsCache.sort((a, b) => {
      const pa = a._totalTasks > 0 ? a._completedTasks / a._totalTasks : 0;
      const pb = b._totalTasks > 0 ? b._completedTasks / b._totalTasks : 0;
      return pb - pa;
    });
  } else if (type === 'created') {
    goalsCache.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } else {
    // recent: 按状态排序 (active > paused > completed)
    const statusOrder = { active: 0, paused: 1, completed: 2 };
    goalsCache.sort((a, b) => {
      const diff = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      if (diff !== 0) return diff;
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });
  }
  _renderGoalCards(planFilter);
}

/** 打开目标详情 */
function _openPlanDetail(goalId) {
  _renderDetailView(goalId);
}

/** 关闭目标详情 */
function _closePlanDetail() {
  const listView = document.getElementById('planListView');
  const detailView = document.getElementById('planDetailView');
  if (listView) listView.style.display = 'block';
  if (detailView) detailView.style.display = 'none';
  currentDetailGoalId = null;

  // 恢复顶栏
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = '📋 学习计划';
  const topbarRight = document.querySelector('.topbar-right');
  if (topbarRight) {
    topbarRight.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="openDiagModal()">🤖 AI诊断</button>' +
      '<button class="btn btn-primary btn-sm" id="planCreateBtn" onclick="openCreateModal()">+ 新建目标</button>';
  }
}

/** 折叠/展开里程碑 */
function _toggleMilestone(el) {
  const toggle = el.querySelector('.milestone-toggle');
  const list = el.nextElementSibling;
  if (toggle) toggle.classList.toggle('open');
  if (list) list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

/** 弹窗控制 */
function _openCreateModal() {
  const modal = document.getElementById('createGoalModal');
  if (modal) modal.classList.add('show');
}

function _closePlanModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('show');
}

function _openRescheduleModal() {
  const modal = document.getElementById('rescheduleModal');
  if (modal) modal.classList.add('show');
}

function _openDiagModal() {
  const modal = document.getElementById('diagModal');
  if (modal) modal.classList.add('show');
}

function _openAddTaskModal() {
  const modal = document.getElementById('addTaskModal');
  if (modal) modal.classList.add('show');
}

/* ================================================================
   覆盖 plan.html 内联脚本中 mockData 相关函数
   在 initLearningPage 中调用，通过 window 赋值覆盖
   ================================================================ */
function _patchGlobalFunctions() {
  // 覆盖渲染函数
  window.renderGoalCards = function (filter) {
    _renderGoalCards(filter);
  };

  // 覆盖页面入口（plan.html 内联脚本会调用 initPlanPage）
  window.initPlanPage = function () {
    // 由 initLearningPage 接管，此处为空
  };

  // 覆盖数据操作函数
  window._handleCreateGoal = _handleCreateGoal;
  window._handlePauseGoal = _handlePauseGoal;
  window._handleResumeGoal = _handleResumeGoal;
  window._handleDeleteGoal = _handleDeleteGoal;
  window._handleGoalSummary = _handleGoalSummary;
  window._handleCreateTask = _handleCreateTask;
  window._handleTaskComplete = _handleTaskComplete;
  window._handleDeleteTask = _handleDeleteTask;
  window._handleDeleteMilestone = _handleDeleteMilestone;
  window._handleAICreateGoal = _handleAICreateGoal;
  window._handleAIDiagnoseGoal = _handleAIDiagnoseGoal;
  window._handleReschedule = _handleReschedule;

  // 覆盖 UI 函数（部分与 plan.html 内联脚本名称冲突）
  window._openPlanDetail = _openPlanDetail;
  window._closePlanDetail = _closePlanDetail;
  window._toggleMilestone = _toggleMilestone;
  window._switchPlanSubTab = _switchPlanSubTab;
  window._sortPlanGoals = _sortPlanGoals;

  // 覆盖弹窗控制
  window.openCreateModal = _openCreateModal;
  window.closePlanModal = _closePlanModal;
  window.openRescheduleModal = _openRescheduleModal;
  window.openDiagModal = _openDiagModal;
  window.openAddTaskModal = _openAddTaskModal;

  // 子标签切换 — plan.html 中 onclick="switchPlanSubTab(this, 'all')" 需要
  window.switchPlanSubTab = _switchPlanSubTab;
  window.sortPlanGoals = _sortPlanGoals;

  // 详情打开/关闭
  window.openPlanDetail = _openPlanDetail;
  window.closePlanDetail = _closePlanDetail;
  window.toggleMilestone = _toggleMilestone;

  // 任务完成切换
  window.toggleTaskComplete = function (taskId, el) {
    if (currentDetailGoalId) {
      _handleTaskComplete(taskId, currentDetailGoalId, el);
    }
  };

  // 创建目标（从弹窗保存）
  window.confirmCreateGoal = function () {
    _handleCreateGoal();
  };

  // 确认排期
  window.confirmReschedule = function () {
    _handleReschedule();
  };

  // 确认添加任务
  window.confirmAddTask = function () {
    _handleCreateTask();
  };

  // 暖身答案显示
  window.showPlanWarmupAnswer = function () {
    const answer = document.getElementById('planQuizAnswer');
    if (answer) {
      answer.style.display = 'block';
      if (answer.nextElementSibling) answer.nextElementSibling.style.display = 'none';
    }
  };

  // AI 对话回复
  window.sendChatReply = function () {
    const input = document.getElementById('chatInput');
    if (!input || !input.value.trim()) return;
    const wrap = document.getElementById('aiChatWrap');
    if (wrap) {
      wrap.innerHTML += `<div class="chat-bubble user">
        <div class="chat-avatar user">👤</div>
        <div class="chat-content user">${_escapeHTML(input.value)}</div>
      </div>`;
    }
    input.value = '';
    if (wrap) {
      wrap.innerHTML += '<div class="chat-bubble"><div class="chat-avatar ai">🤖</div><div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>';
      setTimeout(() => {
        const typing = wrap.querySelector('.typing-indicator');
        if (typing) typing.parentElement.innerHTML = '<div class="chat-content ai">了解了。那么你的目标时间范围是多久？每周能投入多少小时？</div>';
      }, 2000);
    }
  };

  // 弹性排期选项选择
  window.selectRescheduleOption = function (el) {
    if (el && el.parentElement) {
      el.parentElement.querySelectorAll('.reschedule-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
    }
  };

  // 任务完成后续
  window.completeWith = function (type) {
    _closePlanModal('taskCompleteModal');
    if (type === 'note') {
      toast('已打开笔记编辑器', 'info');
    } else {
      toast('复习卡片已生成', 'success');
    }
    if (currentDetailGoalId) _renderDetailView(currentDetailGoalId);
  };

  // 新建目标向导
  window.createStep = 1;
  window.createNextStep = function () {
    window.createStep++;
    const steps = document.getElementById('createSteps');
    if (steps) {
      steps.querySelectorAll('.step').forEach((s, i) => {
        s.classList.toggle('active', i + 1 === window.createStep);
        s.classList.toggle('done', i + 1 < window.createStep);
      });
    }
    const prev = document.getElementById('createStep' + (window.createStep - 1));
    const next = document.getElementById('createStep' + window.createStep);
    if (prev) prev.style.display = 'none';
    if (next) next.style.display = 'block';

    if (window.createStep === 2) {
      const prevBtn = document.getElementById('createPrevBtn');
      const manualBtn = document.getElementById('createManualBtn');
      if (prevBtn) prevBtn.style.display = 'inline-flex';
      if (manualBtn) manualBtn.style.display = 'none';
    }
    if (window.createStep === 3) {
      const nextBtn = document.getElementById('createNextBtn');
      const confirmBtn = document.getElementById('createConfirmBtn');
      const prevBtn = document.getElementById('createPrevBtn');
      if (nextBtn) nextBtn.style.display = 'none';
      if (confirmBtn) confirmBtn.style.display = 'inline-flex';
      if (prevBtn) prevBtn.style.display = 'inline-flex';
      // AI 生成阶段：调用 AI 创建目标
      _handleAICreateGoal();
    }
  };

  window.createPrevStep = function () {
    const cur = document.getElementById('createStep' + window.createStep);
    if (cur) cur.style.display = 'none';
    window.createStep--;
    const prev = document.getElementById('createStep' + window.createStep);
    if (prev) prev.style.display = 'block';
    const steps = document.getElementById('createSteps');
    if (steps) {
      steps.querySelectorAll('.step').forEach((s, i) => {
        s.classList.toggle('active', i + 1 === window.createStep);
        s.classList.toggle('done', i + 1 < window.createStep);
      });
    }
    if (window.createStep === 1) {
      const prevBtn = document.getElementById('createPrevBtn');
      const manualBtn = document.getElementById('createManualBtn');
      if (prevBtn) prevBtn.style.display = 'none';
      if (manualBtn) manualBtn.style.display = 'inline-flex';
    }
    if (window.createStep !== 3) {
      const nextBtn = document.getElementById('createNextBtn');
      const confirmBtn = document.getElementById('createConfirmBtn');
      if (nextBtn) nextBtn.style.display = 'inline-flex';
      if (confirmBtn) confirmBtn.style.display = 'none';
    }
  };
}

/* ================================================================
   工具函数
   ================================================================ */

function _formatDate(date) {
  if (!date) return '未设置';
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '未设置';
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  } catch (_) {
    return '未设置';
  }
}

function _escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
