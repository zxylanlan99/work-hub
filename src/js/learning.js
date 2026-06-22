/**
 * StudyMind 学习计划页面 (pages/plan.html)
 * 使用 window.DB 数据服务层，所有 DB 调用通过 try/catch 包裹
 * SPIN 框架通过 common.js 调用 initLearningPage() 进行初始化
 */

/* ================================================================
   状态变量 — 使用 var 确保 learning.js 和 plan.html 内联脚本共享同一变量
   ================================================================ */
var planFilter = 'all';
var currentDetailGoalId = null;
/** 缓存的目标+任务数据，用于排序和进度计算 */
var goalsCache = [];

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
      goal._totalTasks = tasks.filter(t => t.status !== 'skipped').length;
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

/** 加载暖身数据 — PRD 1C 暖身引擎 */
async function _loadWarmupData() {
  var yesterdayText = document.getElementById('planYesterdayText');
  var quizQ = document.getElementById('planQuizQuestion');
  var warmupBanner = document.getElementById('planWarmupBanner');

  try {
    // 1. 昨日回顾 — 先查复习记录，再查任务完成记录
    var hasYesterdayData = false;

    const reviewResult = await DB.getYesterdayReview();
    if (reviewResult.success && reviewResult.data && reviewResult.data.length > 0) {
      var item = reviewResult.data[reviewResult.data.length - 1];
      if (yesterdayText) {
        yesterdayText.textContent = item.summary || item.cardId ? '已复习 ' + reviewResult.data.length + ' 张卡片' : '昨日完成学习任务';
      }
      hasYesterdayData = true;
    }

    // 如果没有复习记录，查昨日完成的任务
    if (!hasYesterdayData) {
      try {
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        var todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        var taskRes = await DB._exec(
          DB._collection('tasks')
            .where({ status: 'completed' })
            .orderBy('completedAt', 'desc')
            .limit(10)
            .get()
        );

        if (taskRes.success && taskRes.data && taskRes.data.length > 0) {
          // 筛选昨日完成的任务
          var yesterdayTasks = taskRes.data.filter(function(t) {
            if (!t.completedAt && !t.updatedAt) return false;
            var d = new Date(t.completedAt || t.updatedAt);
            return d >= yesterday && d < todayStart;
          });

          if (yesterdayTasks.length > 0) {
            if (yesterdayText) {
              var titles = yesterdayTasks.slice(0, 2).map(function(t) { return t.title || '学习任务'; });
              yesterdayText.textContent = '昨日完成 ' + yesterdayTasks.length + ' 个任务：' + titles.join('、');
            }
            hasYesterdayData = true;
          }
        }
      } catch (e) {
        console.warn('查询昨日任务失败:', e);
      }
    }

    // 如果没有任何昨日数据，隐藏暖身卡
    if (!hasYesterdayData) {
      if (warmupBanner) warmupBanner.style.display = 'none';
      return;
    }

    // 2. 快问快答 — 调用 AI 生成
    try {
      const quizResult = await DB.getQuiz();
      if (quizQ && quizResult.success && quizResult.content) {
        quizQ.textContent = typeof quizResult.content === 'string'
          ? quizResult.content.substring(0, 100)
          : '今天学习了什么新知识？';
      } else if (quizQ) {
        // AI 不可用时，基于昨日任务生成通用问题
        quizQ.textContent = '能回忆起昨天学到的核心知识点吗？';
      }
    } catch (_) {
      if (quizQ) quizQ.textContent = '能回忆起昨天学到的核心知识点吗？';
    }

  } catch (error) {
    console.error('加载暖身数据失败:', error);
    // 出错时隐藏暖身卡，不显示"加载中..."
    if (warmupBanner) warmupBanner.style.display = 'none';
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
      const resumeCard = document.querySelector('.resume-card');

      if (lastGoal) {
        const goalId = lastGoal._id || lastGoal.id;
        if (titleEl) titleEl.textContent = '继续上次学习：' + (lastGoal.title || '学习目标');
        if (subEl) subEl.textContent = '上次更新于 ' + _formatDate(lastGoal.updatedAt || lastGoal.createdAt);
        // 续接卡 onclick 不再硬编码，由 _resumeLastGoal() 动态获取
        if (resumeCard) {
          resumeCard.style.display = '';
          resumeCard.setAttribute('onclick', '_resumeLastGoal()');
        }
      } else {
        // 没有活跃目标时，隐藏续接卡
        if (resumeCard) resumeCard.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('加载续接数据失败:', error);
  }
}

/** 续接上次学习 — 动态获取最后一个活跃目标并打开详情 */
async function _resumeLastGoal() {
  try {
    const result = await DB.getLastBreakpoint();
    if (result.success && result.data && result.data.goals && result.data.goals.length > 0) {
      const goal = result.data.goals[0];
      const goalId = goal._id || goal.id;
      if (goalId) {
        _openPlanDetail(goalId);
        return;
      }
    }
    toast('暂无学习断点，请先创建学习目标', 'info');
  } catch (e) {
    console.error('加载续接数据失败:', e);
    toast('加载失败，请重试', 'error');
  }
}
window._resumeLastGoal = _resumeLastGoal;

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
  // 「…」下拉菜单
  footerRight += `<div style="position:relative;display:inline-block;"><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();toggleGoalCardMenu(this, event)" style="color:var(--danger)">⋯</button><div class="goal-card-dropdown" style="display:none;position:absolute;top:100%;right:0;z-index:100;background:var(--white);border:1px solid var(--gray-200);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:120px;padding:4px 0;"><button class="dropdown-item" style="display:block;width:100%;padding:8px 14px;text-align:left;border:none;background:none;color:var(--danger);font-size:13px;cursor:pointer;" onclick="event.stopPropagation();openDeleteGoalModal('${goal._id}')">🗑 删除目标</button></div></div>`;

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
      var pauseBtnHtml = '';
      if (goal.status === 'active') {
        pauseBtnHtml = '<button class="btn btn-sm" style="background:var(--warning);color:#fff;" onclick="_handlePauseGoal(\'' + goalId + '\')">⏸️ 暂停</button>';
      } else if (goal.status === 'paused') {
        pauseBtnHtml = '<button class="btn btn-primary btn-sm" onclick="_handleResumeGoal(\'' + goalId + '\')">▶ 恢复</button>';
      }
      topbarRight.innerHTML = pauseBtnHtml + '<button class="btn btn-secondary btn-sm" onclick="openDiagModal()">🤖 AI诊断</button>';
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
    const total = tasks.filter(t => t.status !== 'skipped').length;
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
      // 从任务数据估算总耗时（如果有 timeEst 字段）
      const totalEst = tasks.reduce((sum, t) => sum + (parseInt(t.timeEst) || parseInt(t.estimatedTime) || 0), 0);
      const totalActual = tasks.reduce((sum, t) => sum + (parseInt(t.timeActual) || 0), 0);
      const timeText = totalActual > 0
        ? `已用 ${totalActual}h / 预计 ${totalEst || '?'}h`
        : (totalEst > 0 ? `预计 ${totalEst}h` : '—');

      // 连续学习天数：从任务完成时间推算（简化版，取最近有活动的不重复日期数）
      const taskDates = new Set();
      tasks.forEach(t => {
        if (t.completedAt) taskDates.add(t.completedAt.split('T')[0]);
        if (t.updatedAt) taskDates.add(t.updatedAt.split('T')[0]);
      });
      const streakDays = taskDates.size > 0 ? Math.min(taskDates.size, 99) : 0;
      const streakText = streakDays > 0 ? `${streakDays} 天` : '—';

      metaEl.innerHTML =
        `<div class="detail-meta-item">📅 <strong>创建</strong> ${_formatDate(goal.createdAt)}</div>` +
        `<div class="detail-meta-item">🏁 <strong>截止</strong> ${_formatDate(goal.deadline)}</div>` +
        `<div class="detail-meta-item">⏱️ <strong>总耗时</strong> ${timeText}</div>` +
        `<div class="detail-meta-item">🔥 <strong>连续学习</strong> ${streakText}</div>`;
    }

    // 渲染里程碑
    _renderMilestones(goal.milestones || [], tasks, goal._id || goalId);

    // 动态渲染 AI 耗时预测（基于真实任务数据）
    _renderTimeEstimate(tasks, goal.milestones || []);

    // 动态渲染难度曲线（基于里程碑/任务数据）
    _renderDifficultyChart(goal.milestones || [], tasks);

    // 异步加载 AI 诊断面板（不阻塞详情渲染）
    _loadAiDiagPanel(currentDetailGoalId);

    // 滚动到顶部
    if (detailView) detailView.scrollIntoView();
  } catch (error) {
    console.error('加载目标详情失败:', error);
    toast('加载目标详情失败', 'error');
  }
}

/**
 * 动态渲染 AI 耗时预测面板 — 基于真实任务数据计算
 * PRD 2C：基于内容量 × 用户历史速度 × 复杂度，输出 P70 置信区间
 */
function _renderTimeEstimate(tasks, milestones) {
  // 查找 AI 耗时预测面板的 body
  const panels = document.querySelectorAll('.detail-sidebar .panel');
  if (panels.length < 2) return;
  const estPanel = panels[1]; // 第二个 panel 是耗时预测
  const body = estPanel.querySelector('.panel-body');
  if (!body) return;

  // 筛选未完成任务，按里程碑分组
  const pendingTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'skipped');
  if (pendingTasks.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:16px;color:var(--gray-400);font-size:13px;">✅ 所有任务已完成</div>';
    return;
  }

  // 按里程碑分组计算预计耗时
  const msMap = new Map();
  milestones.forEach(m => msMap.set(m._id || m.id, m));

  const msTimeMap = new Map();
  pendingTasks.forEach(t => {
    const msId = t.milestoneId;
    if (!msTimeMap.has(msId)) msTimeMap.set(msId, []);
    msTimeMap.get(msId).push(t);
  });

  let html = '';
  let totalMin = 0;

  msTimeMap.forEach((msTasks, msId) => {
    const ms = msMap.get(msId);
    const msTitle = ms ? (ms.title || '未命名里程碑') : '未分组任务';
    // 预估时间：如果有 estimatedTime 用它，否则按优先级估算
    const msEstMin = msTasks.reduce((sum, t) => {
      const est = parseInt(t.timeEst || t.estimatedTime) || 0;
      if (est > 0) return sum + est;
      // 无预估时间时，按优先级粗估：high=90min, mid=60min, low=30min
      const p = t.priority || 'mid';
      return sum + (p === 'high' ? 90 : p === 'low' ? 30 : 60);
    }, 0);
    totalMin += msEstMin;

    // P70 置信区间：预估时间 ± 20%
    const low = Math.round(msEstMin * 0.8);
    const high = Math.round(msEstMin * 1.2);
    const timeText = msEstMin >= 60
      ? Math.floor(msEstMin / 60) + '-' + Math.ceil(high / 60) + 'h'
      : low + '-' + high + 'min';
    const confClass = msTasks.length > 3 ? 'conf-med' : 'conf-high';

    html += '<div class="estimate-p70-row">' +
      '<span>' + _escapeHTML(msTitle.substring(0, 12)) + '</span>' +
      '<div class="estimate-p70-right">' +
        '<span class="estimate-p70-time">' + timeText + '</span>' +
        '<span class="estimate-p70-conf ' + confClass + '">P70</span>' +
      '</div>' +
    '</div>';
  });

  // 总计
  const totalLow = Math.round(totalMin * 0.8);
  const totalHigh = Math.round(totalMin * 1.2);
  const totalText = totalMin >= 60
    ? '约 ' + Math.floor(totalMin / 60) + '-' + Math.ceil(totalHigh / 60) + 'h'
    : totalLow + '-' + totalHigh + 'min';

  html += '<div class="estimate-p70-row" style="border-top:1px solid var(--gray-200);margin-top:8px;padding-top:8px;font-weight:600;">' +
    '<span>总计剩余</span>' +
    '<div class="estimate-p70-right">' +
      '<span class="estimate-p70-time">' + totalText + '</span>' +
      '<span class="estimate-p70-conf conf-high">P70</span>' +
    '</div>' +
  '</div>';

  html += '<div class="estimate-p70-hint">💡 P70 = 70% 概率在该时间内完成，基于任务量和优先级估算</div>';
  body.innerHTML = html;
}

/**
 * 动态渲染难度曲线 — 基于里程碑/任务数据
 * PRD 2B：难度曲线是路径生成的产物，反映各里程碑的复杂度
 */
function _renderDifficultyChart(milestones, tasks) {
  const panels = document.querySelectorAll('.detail-sidebar .panel');
  if (panels.length < 3) return;
  const diffPanel = panels[2]; // 第三个 panel 是难度曲线
  const body = diffPanel.querySelector('.panel-body');
  if (!body) return;

  if (milestones.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:16px;color:var(--gray-400);font-size:13px;">暂无里程碑数据</div>';
    return;
  }

  // 计算每个里程碑的难度（基于任务数量、优先级、完成率）
  const diffData = milestones.map((m, i) => {
    const msId = m._id || m.id;
    const msTasks = tasks.filter(t => t.milestoneId === msId);
    const taskCount = msTasks.length;
    const highPriorityCount = msTasks.filter(t => t.priority === 'high').length;
    const completedCount = msTasks.filter(t => t.status === 'completed').length;
    const completionRate = taskCount > 0 ? completedCount / taskCount : 0;

    // 难度评分：任务数(40%) + 高优先级占比(30%) + 里程碑序号递增(30%)
    const taskScore = Math.min(taskCount / 6, 1) * 40;
    const priorityScore = taskCount > 0 ? (highPriorityCount / taskCount) * 30 : 15;
    const orderScore = (i + 1) / milestones.length * 30;
    const difficulty = Math.round(taskScore + priorityScore + orderScore);

    let level = 'easy';
    let color = '#10b981';
    if (difficulty >= 70) { level = 'hard'; color = '#ef4444'; }
    else if (difficulty >= 45) { level = 'medium'; color = '#f59e0b'; }

    return {
      label: 'M' + (i + 1),
      title: m.title || '未命名',
      difficulty: difficulty,
      level: level,
      color: color,
      taskCount: taskCount,
      completed: completedCount,
      isCompleted: m.status === 'completed',
      isActive: m.status === 'active'
    };
  });

  let html = '<div style="margin-bottom:8px;font-size:12px;color:var(--gray-500);">各里程碑难度分布（基于任务量、优先级、进度）</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:4px;height:100px;padding:0 4px;">';

  diffData.forEach(d => {
    const height = Math.max(d.difficulty, 15) + '%';
    const opacity = d.isCompleted ? '0.4' : '1';
    const border = d.isActive ? '2px solid var(--primary)' : 'none';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">' +
      '<span style="font-size:10px;color:var(--gray-500);">' + (d.isCompleted ? '✅' : d.difficulty) + '</span>' +
      '<div title="' + _escapeHTML(d.title) + '（' + d.taskCount + '任务' + (d.completed > 0 ? '，已完成' + d.completed : '') + '）" style="width:100%;max-width:32px;height:' + height + ';background:' + d.color + ';border-radius:4px 4px 0 0;opacity:' + opacity + ';border:' + border + ';cursor:pointer;transition:opacity 0.2s;" onmouseover="this.style.opacity=\'0.7\'" onmouseout="this.style.opacity=\'' + opacity + '\'"></div>' +
      '<span style="font-size:10px;color:var(--gray-400);">' + d.label + '</span>' +
    '</div>';
  });

  html += '</div>';
  html += '<div style="display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--gray-400);">' +
    '<span>🟢 简单 (&lt;45)</span><span>🟡 中等 (45-69)</span><span>🔴 困难 (≥70)</span>' +
  '</div>';
  html += '<div style="margin-top:6px;font-size:11px;color:var(--gray-400);line-height:1.5;">' +
    '💡 鼠标悬停查看详情，已完成里程碑显示为半透明' +
  '</div>';

  body.innerHTML = html;
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
    const mTotal = mTasks.filter(t => t.status !== 'skipped').length;
    const mProgress = mTotal > 0 ? Math.round((mCompleted / mTotal) * 100) : 0;
    const hasTasks = mTasks.length > 0;
    const toggleClass = hasTasks ? 'open' : '';

    const tasksHtml = hasTasks
      ? mTasks.map(t => {
          const tId = t._id || t.id;
          const tStatus = t.status || 'pending';
          const titleClass = tStatus === 'completed' ? 'done-text' : (tStatus === 'skipped' ? 'skipped-text' : '');
          const priorityClass = t.priority === 'high' ? 'priority-high'
            : (t.priority === 'mid' || t.priority === 'medium' ? 'priority-mid' : 'priority-low');
          let metaHtml = '';
          if (tStatus === 'skipped') {
            metaHtml += `<span class="task-tag" style="background:#fef3c7;color:#d97706;">🔖 待补学</span>`;
          }
          if (t.deadline) {
            metaHtml += `<span class="task-tag ${tStatus !== 'completed' && new Date(t.deadline) < new Date() ? 'overdue' : ''}">📅 ${_formatDate(t.deadline)}</span>`;
          }

          // 状态机操作按钮
          let actionBtnHtml = '';
          if (tStatus === 'pending') {
            actionBtnHtml = `<button class="btn btn-ghost btn-sm" style="font-size:12px;" onclick="event.stopPropagation();handleTaskAction('${tId}','start')" title="启动任务">▶ 启动</button>`;
          } else if (tStatus === 'in_progress') {
            actionBtnHtml = `<button class="btn btn-ghost btn-sm" style="font-size:12px;color:var(--success);" onclick="event.stopPropagation();handleTaskAction('${tId}','complete')" title="完成任务">✓ 完成</button>`;
          } else if (tStatus === 'completed') {
            actionBtnHtml = `<button class="btn btn-ghost btn-sm" style="font-size:12px;color:var(--primary);" onclick="event.stopPropagation();handleTaskAction('${tId}','restart')" title="再次启动">↻ 再次启动</button>`;
          }

          return `<div class="task-item">
            <div class="task-priority ${priorityClass}"></div>
            <div class="task-body" style="flex:1;">
              <div class="task-title ${titleClass}">${_escapeHTML(t.title || '未命名任务')}</div>
              <div class="task-meta">${metaHtml}</div>
            </div>
            <div class="task-actions" style="display:flex;align-items:center;gap:4px;">
              ${actionBtnHtml}
              <button class="btn btn-ghost btn-sm" style="font-size:12px;" onclick="event.stopPropagation();openTaskEditModal('${tId}')" title="编辑">✏️</button>
              <button class="btn btn-ghost btn-sm" style="font-size:12px;color:var(--danger);" onclick="event.stopPropagation();handleDeleteTask('${tId}')" title="删除">🗑</button>
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
  // 判断创建模式：手动模式（从第1步跳到第3步）vs AI 模式（经过 AI 拆解到第3步）
  const isManualMode = window.isManualCreateMode === true;

  // 第3步的标题字段（手动模式和 AI 模式都在这里）
  const genTitleEl = document.getElementById('genGoalTitle');
  const titleEl = document.getElementById('goalTitleInput');

  let title = '';
  if (isManualMode) {
    // 手动模式：genGoalTitle 已被 manualCreateToStep3 预填充
    title = genTitleEl ? genTitleEl.value.trim() : '';
    if (!title && titleEl) title = titleEl.value.trim();
  } else {
    // AI 模式：优先取 AI 生成的标题
    title = genTitleEl ? genTitleEl.value.trim() : '';
    if (!title && titleEl) title = titleEl.value.trim();
  }

  if (!title) {
    toast('请输入目标名称', 'error');
    return;
  }

  const descEl = document.getElementById('goalBackground');
  const deadlineEl = document.getElementById('goalDeadline');
  const weeklyEl = document.getElementById('goalWeeklyHours');
  const domainEl = document.getElementById('genGoalDomain');
  const topicEl = document.getElementById('genGoalTopic');

  try {
    // AI 搜索增强模式：使用 AI 生成的计划方案，经用户确认后入库
    if (!isManualMode && window._pendingAIGeneratedPlan && window._pendingAIGeneratedPlan.title) {
      const plan = window._pendingAIGeneratedPlan;
      plan.title = title;
      plan.description = descEl ? descEl.value.trim() : (plan.description || '');

      const result = await DB.confirmCreateGoalFromPlan(plan);
      if (result.success) {
        var goalId = result.data && result.data.goalId;
        toast('目标创建成功', 'success');
        _resetCreateWizard();
        _closePlanModal('createGoalModal');
        await _loadGoals(planFilter);
        if (goalId) await _renderDetailView(goalId);
        window._pendingAIGeneratedPlan = null;
        return;
      } else {
        toast('创建失败: ' + (result.error || '未知错误'), 'error');
        return;
      }
    }

    const result = await DB.createGoal({
      title,
      description: descEl ? descEl.value.trim() : ''
    });

    if (result.success) {
      var goalId = result.data && result.data._id ? result.data._id : (result.id || null);

      // 手动模式：创建里程碑和任务
      if (isManualMode && goalId && window._manualMilestones && window._manualMilestones.length > 0) {
        // 先同步一次输入框内容
        if (window._syncManualMilestones) window._syncManualMilestones();

        var msCount = 0;
        var taskCount = 0;
        for (var mIdx = 0; mIdx < window._manualMilestones.length; mIdx++) {
          var ms = window._manualMilestones[mIdx];
          if (!ms.title) continue; // 跳过空标题里程碑

          var msResult = await DB.createMilestone({
            goalId: goalId,
            title: ms.title,
            sort: mIdx
          });

          if (msResult.success) {
            var msId = msResult.data && msResult.data._id ? msResult.data._id : (msResult.id || null);
            msCount++;

            // 创建该里程碑下的任务
            if (ms.tasks && ms.tasks.length > 0 && msId) {
              for (var tIdx = 0; tIdx < ms.tasks.length; tIdx++) {
                var taskTitle = ms.tasks[tIdx];
                if (!taskTitle) continue; // 跳过空标题任务

                await DB.createTask({
                  goalId: goalId,
                  milestoneId: msId,
                  title: taskTitle,
                  sort: tIdx,
                  priority: 'mid',
                  estimatedTime: 0
                });
                taskCount++;
              }
            }
          }
        }
        toast('目标创建成功（' + msCount + ' 个里程碑，' + taskCount + ' 个任务）', 'success');
      } else {
        toast('目标创建成功', 'success');
      }

      // 重置向导状态
      _resetCreateWizard();

      _closePlanModal('createGoalModal');
      await _loadGoals(planFilter);

      // 手动模式：跳转到目标详情页
      if (isManualMode && goalId) {
        await _renderDetailView(goalId);
      }
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

  // 重置手动模式状态
  window.isManualCreateMode = false;
  window._manualMilestones = [];

  // 恢复 AI 预览显示，隐藏手动编辑器
  var aiPreview = document.querySelector('#createStep3 .gen-result');
  var manualEditor = document.getElementById('manualMilestoneEditor');
  if (aiPreview) aiPreview.style.display = '';
  if (manualEditor) manualEditor.style.display = 'none';

  // 清空第1步输入
  var titleInput = document.getElementById('goalTitleInput');
  var bgInput = document.getElementById('goalBackground');
  var dlInput = document.getElementById('goalDeadline');
  if (titleInput) titleInput.value = '';
  if (bgInput) bgInput.value = '';
  if (dlInput) dlInput.value = '';
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
  let estimatedTime = 0;
  if (durationEl) {
    const val = durationEl.value;
    if (val.includes('30')) estimatedTime = 0.5;
    else if (val.includes('45')) estimatedTime = 0.75;
    else if (val.includes('60')) estimatedTime = 1;
    else if (val.includes('90')) estimatedTime = 1.5;
    else if (val.includes('120')) estimatedTime = 2;
  }

  try {
    const result = await DB.createTask({
      goalId: currentDetailGoalId,
      milestoneId: milestoneEl ? milestoneEl.value : '',
      title,
      description: descEl ? descEl.value.trim() : '',
      deadline: deadlineEl && deadlineEl.value ? new Date(deadlineEl.value) : null,
      estimatedTime,
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

/** AI 辅助创建目标（搜索增强，仅生成方案，不入库） */
async function _handleAICreateGoal() {
  const descEl = document.getElementById('goalBackground');
  const description = descEl ? descEl.value.trim() : '';
  if (!description) {
    toast('请描述你想学习的内容', 'warning');
    return;
  }

  try {
    toast('AI 正在搜索资料并制定学习计划…', 'info');
    const result = await DB.aiCreateGoalWithSearch(description, { useWebSearch: true, topK: 5 });
    if (result.success && result.data) {
      window._pendingAIGeneratedPlan = result.data;

      // 填充 AI 生成结果到步骤 3
      const genTitle = document.getElementById('genGoalTitle');
      if (genTitle) genTitle.value = result.data.title || description.substring(0, 50);

      // 渲染 AI 方案预览
      _renderAIGeneratedPlanPreview(result.data);

      toast('AI 方案已生成，请确认后入库', 'success');
    } else {
      toast('AI 生成失败: ' + (result.error || '未知错误'), 'error');
      window._pendingAIGeneratedPlan = null;
    }
  } catch (error) {
    console.error('AI 创建目标失败:', error);
    toast('AI 创建目标失败', 'error');
    window._pendingAIGeneratedPlan = null;
  }
}

/** 渲染 AI 生成的学习计划预览 */
function _renderAIGeneratedPlanPreview(plan) {
  const aiPreview = document.querySelector('#createStep3 .gen-result');
  if (!aiPreview) return;

  const milestones = plan.milestones || [];
  let html = '<div style="max-height:320px;overflow:auto;">';
  html += '<h4 style="margin:0 0 8px 0;font-weight:600;">' + _escapeHTML(plan.title || '学习计划') + '</h4>';
  if (plan.description) {
    html += '<p style="color:#6b7280;font-size:13px;margin:0 0 12px 0;">' + _escapeHTML(plan.description) + '</p>';
  }

  if (milestones.length === 0) {
    html += '<p style="color:#9ca3af;font-size:13px;">AI 未返回详细里程碑</p>';
  } else {
    html += '<ol style="padding-left:18px;margin:0;">';
    milestones.forEach(function(ms) {
      html += '<li style="margin-bottom:8px;">' +
        '<div style="font-weight:600;font-size:14px;">' + _escapeHTML(ms.title || '未命名里程碑') + '</div>';
      const tasks = ms.tasks || [];
      if (tasks.length > 0) {
        html += '<ul style="margin:4px 0 0 0;padding-left:16px;font-size:13px;color:#4b5563;">';
        tasks.forEach(function(t) {
          const taskTitle = typeof t === 'string' ? t : t.title;
          html += '<li>' + _escapeHTML(taskTitle || '未命名任务') + '</li>';
        });
        html += '</ul>';
      }
      html += '</li>';
    });
    html += '</ol>';
  }

  if (plan.recommendedMaterials && plan.recommendedMaterials.length > 0) {
    html += '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #e5e7eb;">';
    html += '<div style="font-size:12px;color:#6b7280;margin-bottom:4px;">推荐参考资料</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    plan.recommendedMaterials.forEach(function(m) {
      html += '<span style="font-size:12px;background:#f3f4f6;padding:2px 8px;border-radius:12px;">' + _escapeHTML(m) + '</span>';
    });
    html += '</div></div>';
  }

  html += '</div>';
  aiPreview.innerHTML = html;
}

/** AI 诊断（单目标） */
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

/** AI 每周诊断报告 */
async function _handleWeeklyDiagnosis() {
  try {
    toast('AI 正在生成每周诊断报告…', 'info');
    const result = await DB.generateWeeklyDiagnosisReport();
    if (result.success && result.data) {
      _showWeeklyDiagnosisModal(result.data);
    } else {
      toast('诊断报告生成失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('每周诊断失败:', error);
    toast('每周诊断失败', 'error');
  }
}

/** 显示每周诊断报告弹窗（使用 modal-lg 720px） */
function _showWeeklyDiagnosisModal(report) {
  const existing = document.getElementById('weekly-diagnosis-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.id = 'weekly-diagnosis-modal';
  overlay.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <div class="modal-title">每周学习诊断报告</div>
        <span class="modal-close" onclick="this.closest('.modal-overlay').classList.remove('show')">&times;</span>
      </div>
      <div class="modal-body">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
          <div style="width:80px;height:80px;border-radius:50%;background:${(report.overallScore || 0) >= 80 ? '#dcfce7' : (report.overallScore || 0) >= 60 ? '#fef3c7' : '#fee2e2'};display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:${(report.overallScore || 0) >= 80 ? '#16a34a' : (report.overallScore || 0) >= 60 ? '#d97706' : '#dc2626'};">${report.overallScore || 0}</div>
          <div>
            <div style="font-size:18px;font-weight:600;">综合得分</div>
            <div style="color:#6b7280;font-size:13px;">任务完成率 ${Math.round((report.completionRate || 0) * 100)}%</div>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <h4 style="margin:0 0 8px 0;font-size:14px;color:#374151;">薄弱点</h4>
          ${(report.weakPoints || []).length === 0 ? '<div style="color:#9ca3af;font-size:13px;">暂无薄弱点，继续保持！</div>' : '<ul style="margin:0;padding-left:18px;font-size:13px;color:#4b5563;">' + (report.weakPoints || []).map(w => '<li>' + _escapeHTML(w) + '</li>').join('') + '</ul>'}
        </div>
        <div style="margin-bottom:16px;">
          <h4 style="margin:0 0 8px 0;font-size:14px;color:#374151;">改进建议</h4>
          ${(report.suggestions || []).length === 0 ? '<div style="color:#9ca3af;font-size:13px;">暂无建议</div>' : '<ol style="margin:0;padding-left:18px;font-size:13px;color:#4b5563;">' + (report.suggestions || []).map(s => '<li>' + _escapeHTML(s) + '</li>').join('') + '</ol>'}
        </div>
        <div>
          <h4 style="margin:0 0 8px 0;font-size:14px;color:#374151;">下周计划</h4>
          ${(report.nextWeekPlan || []).length === 0 ? '<div style="color:#9ca3af;font-size:13px;">暂无计划</div>' : '<ol style="margin:0;padding-left:18px;font-size:13px;color:#4b5563;">' + (report.nextWeekPlan || []).map(p => '<li>' + _escapeHTML(p) + '</li>').join('') + '</ol>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').classList.remove('show')">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

/* ================================================================
   弹性排期
   ================================================================ */

async function _handleReschedule() {
  if (!currentDetailGoalId) {
    toast('请先打开一个目标', 'warning');
    return;
  }

  // 获取用户选择的排期方案
  var rescheduleModal = document.getElementById('rescheduleModal');
  var selectedOption = rescheduleModal ? rescheduleModal.querySelector('.reschedule-option.selected') : null;
  var allOptions = rescheduleModal ? rescheduleModal.querySelectorAll('.reschedule-option') : [];
  var optionIndex = 0;
  for (var i = 0; i < allOptions.length; i++) {
    if (allOptions[i] === selectedOption) { optionIndex = i; break; }
  }
  // optionIndex: 0=方案A(顺延), 1=方案B(跳过), 2=方案C(拆分)

  try {
    // 获取当前目标的任务列表
    var detailResult = await DB.getGoalDetail(currentDetailGoalId);
    if (!detailResult.success || !detailResult.data) {
      toast('获取目标数据失败', 'error');
      return;
    }

    var tasks = detailResult.data.tasks || [];
    var taskUpdates = [];

    // 找到未完成的任务，按排序/截止日期排序
    var pendingTasks = tasks
      .filter(function (t) { return t.status !== 'completed'; })
      .sort(function (a, b) {
        return (a.sort || 0) - (b.sort || 0) ||
          new Date(a.deadline || 0) - new Date(b.deadline || 0);
      });

    if (optionIndex === 0) {
      // 方案A：顺延当前里程碑 — 未完成任务截止日期延后5天
      for (var i = 0; i < pendingTasks.length; i++) {
        var task = pendingTasks[i];
        var newDeadline = task.deadline ? new Date(task.deadline) : new Date();
        newDeadline.setDate(newDeadline.getDate() + 5);
        taskUpdates.push({
          taskId: task._id,
          deadline: newDeadline,
          sort: task.sort || 0
        });
      }
    } else if (optionIndex === 1) {
      // 方案B：跳过当前任务 — 第一个未完成任务标记为"待补学"，降至最低优先级
      if (pendingTasks.length > 0) {
        var skipTask = pendingTasks[0];
        taskUpdates.push({
          taskId: skipTask._id,
          deadline: skipTask.deadline ? new Date(skipTask.deadline) : null,
          sort: 999,
          status: 'skipped'
        });
      }
    } else if (optionIndex === 2) {
      // 方案C：拆分任务 — 当前任务截止日期不变，后续任务延后3天
      for (var i = 1; i < pendingTasks.length; i++) {
        var task = pendingTasks[i];
        var newDeadline = task.deadline ? new Date(task.deadline) : new Date();
        newDeadline.setDate(newDeadline.getDate() + 3);
        taskUpdates.push({
          taskId: task._id,
          deadline: newDeadline,
          sort: task.sort || 0
        });
      }
    }

    var result = await DB.rescheduleGoal(currentDetailGoalId, { taskUpdates: taskUpdates });
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
    topbarRight.innerHTML =
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

// AI 诊断面板缓存
var _diagCache = {};

/** 加载 AI 诊断面板（详情页右侧栏） */
async function _loadAiDiagPanel(goalId) {
  var panelBody = document.getElementById('aiDiagPanelBody');
  var updateTime = document.getElementById('aiDiagUpdateTime');
  if (!panelBody) return;

  if (!goalId) {
    panelBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);"><div style="font-size:28px;margin-bottom:8px;">🤖</div><div style="font-size:13px;">选择一个学习目标后，AI 将自动生成诊断报告</div></div>';
    if (updateTime) updateTime.textContent = '—';
    return;
  }

  // 有缓存则直接展示
  if (_diagCache[goalId]) {
    _renderDiagPanelSummary(_diagCache[goalId].content, panelBody, updateTime);
    return;
  }

  // 显示加载状态
  panelBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);"><div class="typing-indicator" style="display:inline-block;"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div><div style="margin-top:8px;font-size:13px;">AI 正在分析学习进度…</div></div>';
  if (updateTime) updateTime.textContent = '分析中...';

  try {
    var res = await DB.aiDiagnoseGoal(goalId);
    if (res.success && res.content) {
      _diagCache[goalId] = { content: res.content, time: new Date() };
      _renderDiagPanelSummary(res.content, panelBody, updateTime);
    } else {
      // AI 不可用时不显示 mock 数据，显示简洁提示
      panelBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);"><div style="font-size:24px;margin-bottom:6px;">📋</div><div style="font-size:13px;">AI 诊断暂不可用</div><div style="font-size:12px;margin-top:4px;">请确认 AI 模型已在设置中配置</div></div>';
      if (updateTime) updateTime.textContent = '—';
    }
  } catch (error) {
    console.error('AI 诊断面板加载失败:', error);
    panelBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray-400);"><div style="font-size:24px;margin-bottom:6px;">📋</div><div style="font-size:13px;">AI 诊断暂不可用</div></div>';
    if (updateTime) updateTime.textContent = '—';
  }
}

/** 渲染诊断面板摘要 */
function _renderDiagPanelSummary(content, panelBody, updateTime) {
  var now = new Date();
  if (updateTime) updateTime.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日更新';

  var summary = (content || '').substring(0, 200);
  var hasMore = content && content.length > 200;

  panelBody.innerHTML =
    '<div class="ai-diag-header">' +
      '<div class="ai-diag-avatar">🤖</div>' +
      '<div class="ai-diag-score-info"><strong>AI 诊断报告已生成</strong><br><span style="color:var(--gray-400);font-size:12px;">点击下方查看完整报告</span></div>' +
    '</div>' +
    '<div class="ai-diag-section">' +
      '<div class="ai-diag-section-title">📋 诊断摘要</div>' +
      '<div style="font-size:12.5px;color:var(--gray-600);line-height:1.6;">' + _renderMarkdown(summary) + (hasMore ? '...' : '') + '</div>' +
    '</div>' +
    '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:4px;justify-content:center;" onclick="openDiagModal()">查看完整诊断报告 →</button>';
}

/** 简单 Markdown 渲染 */
function _renderMarkdown(text) {
  if (!text) return '';
  var html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4 style="margin:16px 0 8px;color:var(--gray-700);">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:18px 0 10px;color:var(--gray-700);">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:20px 0 12px;color:var(--gray-700);">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm, '<div style="padding-left:16px;margin:4px 0;">• $1</div>')
    .replace(/\n/g, '<br>');
  return html;
}

/** 打开 AI 诊断弹窗（完整报告） */
async function _openDiagModal() {
  const modal = document.getElementById('diagModal');
  if (modal) modal.classList.add('show');

  var goalId = currentDetailGoalId;
  if (!goalId) {
    var body = document.getElementById('diagModalBody');
    if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400);">请先选择一个学习目标</div>';
    return;
  }

  var body = document.getElementById('diagModalBody');
  var subtitle = document.getElementById('diagModalSubtitle');

  // 有缓存直接展示
  if (_diagCache[goalId]) {
    _renderDiagReport(_diagCache[goalId].content, subtitle, body);
    return;
  }

  // 加载状态
  if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400);"><div class="typing-indicator" style="display:inline-block;"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div><div style="margin-top:12px;font-size:14px;">AI 正在生成诊断报告…</div></div>';
  if (subtitle) subtitle.textContent = 'AI 正在分析学习进度...';

  try {
    var res = await DB.aiDiagnoseGoal(goalId);
    if (res.success && res.content) {
      _diagCache[goalId] = { content: res.content, time: new Date() };
      _renderDiagReport(res.content, subtitle, body);
    } else {
      if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400);"><div style="font-size:28px;margin-bottom:8px;">📋</div><div style="font-size:14px;">AI 诊断暂不可用</div><div style="font-size:12px;margin-top:4px;">请确认 AI 模型已在设置中配置</div></div>';
      if (subtitle) subtitle.textContent = '—';
    }
  } catch (error) {
    console.error('AI 诊断失败:', error);
    if (body) body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-400);"><div style="font-size:28px;margin-bottom:8px;">📋</div><div style="font-size:14px;">AI 诊断出错：' + (error.message || '') + '</div></div>';
    if (subtitle) subtitle.textContent = '诊断出错';
  }
}

/** 渲染完整诊断报告 */
function _renderDiagReport(content, subtitleEl, bodyEl) {
  var now = new Date();
  var timeStr = (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
  if (subtitleEl) subtitleEl.textContent = 'AI 诊断报告 · 生成于 ' + timeStr;

  var html = _renderMarkdown(content);
  if (bodyEl) bodyEl.innerHTML = '<div style="line-height:1.8;font-size:14px;">' + html + '</div>' +
    '<div style="margin-top:20px;text-align:right;"><button class="btn btn-primary btn-sm" onclick="closePlanModal(\'diagModal\');openRescheduleModal()">📅 按建议调整排期</button></div>';
}

function _openDiagModalSimple() {
  const modal = document.getElementById('diagModal');
  if (modal) modal.classList.add('show');
}

function _openAddTaskModal() {
  const modal = document.getElementById('addTaskModal');
  if (modal) modal.classList.add('show');
}

/* ================================================================
   手动创建模式：里程碑/任务编辑器渲染
   ================================================================ */
function _renderManualMilestones() {
  var container = document.getElementById('manualMilestonesList');
  if (!container) return;

  // 先同步当前输入到内存
  if (window._syncManualMilestones) window._syncManualMilestones();

  if (!window._manualMilestones || window._manualMilestones.length === 0) {
    container.innerHTML = '<div style="color:var(--gray-400);font-size:13px;padding:12px 0;">暂无里程碑，点击下方按钮添加。</div>';
    return;
  }

  var html = '';
  window._manualMilestones.forEach(function (ms, mIdx) {
    html += '<div class="manual-ms-item" style="border-left:3px solid var(--primary);padding:12px;margin-bottom:12px;border-radius:0 8px 8px 0;background:var(--gray-50,#f9fafb);">';
    html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">';
    html += '<span style="font-size:12px;color:var(--gray-400);flex-shrink:0;">M' + (mIdx + 1) + '</span>';
    html += '<input class="form-input manual-ms-title" placeholder="里程碑名称" value="' + _escapeHtml(ms.title) + '" style="flex:1;font-weight:600;" oninput="window._syncManualMilestones()">';
    html += '<button type="button" class="btn btn-secondary btn-sm" onclick="removeManualMilestone(' + mIdx + ')" style="flex-shrink:0;">删除</button>';
    html += '</div>';

    // 任务列表
    if (ms.tasks && ms.tasks.length > 0) {
      html += '<div style="padding-left:28px;">';
      ms.tasks.forEach(function (task, tIdx) {
        html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">';
        html += '<span style="font-size:11px;color:var(--gray-400);">•</span>';
        html += '<input class="form-input manual-task-input" placeholder="任务名称" value="' + _escapeHtml(task) + '" style="flex:1;font-size:13px;" oninput="window._syncManualMilestones()">';
        html += '<button type="button" class="btn btn-secondary btn-sm" onclick="removeManualTask(' + mIdx + ',' + tIdx + ')" style="flex-shrink:0;padding:4px 8px;">×</button>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '<button type="button" class="btn btn-secondary btn-sm" onclick="addManualTask(' + mIdx + ')" style="margin-left:28px;margin-top:4px;font-size:12px;">+ 添加任务</button>';
    html += '</div>';
  });
  container.innerHTML = html;
}

function _escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  window._handleWeeklyDiagnosis = _handleWeeklyDiagnosis;
  window._renderAIGeneratedPlanPreview = _renderAIGeneratedPlanPreview;
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
  window.openDiagModal = _openDiagModal;  // 完整版：加载 AI 诊断数据
  window.openAddTaskModal = _openAddTaskModal;

  // 子标签切换 — plan.html 中 onclick="switchPlanSubTab(this, 'all')" 需要
  window.switchPlanSubTab = _switchPlanSubTab;
  window.sortPlanGoals = _sortPlanGoals;

  // 详情打开/关闭
  window.openPlanDetail = _openPlanDetail;
  window.closePlanDetail = _closePlanDetail;
  window.toggleMilestone = _toggleMilestone;

  // 任务完成切换 — 先弹出完成确认弹窗
  window.toggleTaskComplete = function (taskId, goalId, el) {
    var modal = document.getElementById('taskCompleteModal');
    if (modal) {
      modal.setAttribute('data-task-id', taskId);
      modal.setAttribute('data-goal-id', goalId || currentDetailGoalId || '');
      modal.classList.add('show');
    } else if (goalId || currentDetailGoalId) {
      // 无弹窗时回退直接完成
      _handleTaskComplete(taskId, goalId || currentDetailGoalId, el);
    }
  };

  // ====== 强制覆盖：下拉菜单 & 状态机操作 ======
  // 这些函数在 plan.html 内联脚本中也有定义，但内联脚本的 currentDetailGoalId
  // 与 learning.js 的 currentDetailGoalId 可能不是同一个变量（let 作用域问题），
  // 因此必须强制覆盖，确保使用 learning.js 维护的 currentDetailGoalId。
  window.toggleGoalCardMenu = function(btn, e) { e.stopPropagation(); const d = btn.nextElementSibling; if(d) d.style.display = d.style.display==='block'?'none':'block'; };
  window.toggleDetailMenu = function(btn) { const d = document.getElementById('detailMenuDropdown'); if(d) d.style.display = d.style.display==='block'?'none':'block'; };

  // openDeleteGoalModal — 接受可选的 goalId 参数，设置 currentDetailGoalId
  window.openDeleteGoalModal = function(goalId) {
    document.querySelectorAll('.goal-card-dropdown').forEach(function(d){d.style.display='none';});
    var dm=document.getElementById('detailMenuDropdown'); if(dm) dm.style.display='none';
    if (goalId) currentDetailGoalId = goalId;
    document.getElementById('deleteGoalModal').classList.add('show');
  };

  // confirmDeleteGoalAction — 使用 learning.js 的 currentDetailGoalId
  window.confirmDeleteGoalAction = async function() {
    var goalId = currentDetailGoalId;
    if (!goalId) { toast('未选择目标', 'warning'); return; }
    closePlanModal('deleteGoalModal');
    try {
      const res = await DB.deleteGoal(goalId);
      if (res.success) {
        toast('目标已删除', 'success');
        _closePlanDetail();
        await _loadGoals(planFilter);
      } else {
        toast('删除失败: ' + (res.error || '未知错误'), 'error');
      }
    } catch (e) {
      console.error('删除目标失败:', e);
      toast('删除目标失败', 'error');
    }
  };

  // openMilestoneEditModal — 使用 learning.js 的 currentDetailGoalId
  window.openMilestoneEditModal = async function() {
    if (!currentDetailGoalId) { toast('请先进入目标详情', 'warning'); return; }
    document.getElementById('milestoneEditModal').classList.add('show');
    await _renderMilestoneEditList();
  };

  async function _renderMilestoneEditList() {
    var body = document.getElementById('milestoneEditBody');
    if (!body) return;
    try {
      var milestones = [];
      if (window.DB && currentDetailGoalId) {
        var res = await DB.getMilestones(currentDetailGoalId);
        milestones = res.success ? (res.data || []) : [];
      }
      if (milestones.length === 0) {
        body.innerHTML = '<div style="text-align:center;padding:32px;color:var(--gray-400);">暂无里程碑，点击下方按钮添加</div>';
        return;
      }
      body.innerHTML = '<div style="margin-bottom:12px;font-size:13px;color:var(--gray-500);">共 ' + milestones.length + ' 个里程碑</div>' +
        milestones.map(function(m, i) {
          var mId = m._id || m.id;
          return '<div style="display:flex;align-items:center;padding:10px 12px;border:1px solid var(--gray-200);border-radius:8px;margin-bottom:8px;background:var(--white);">' +
            '<span style="color:var(--gray-400);margin-right:10px;font-size:13px;">' + (i + 1) + '.</span>' +
            '<span style="flex:1;font-size:14px;color:var(--gray-800);">' + _escapeHTML(m.title || '未命名') + '</span>' +
            '<span style="font-size:11px;background:' + (m.status === 'completed' ? '#d1fae5' : '#f0fdf4') + ';color:' + (m.status === 'completed' ? '#059669' : '#6b7280') + ';padding:2px 8px;border-radius:8px;margin-right:8px;">' + (m.status === 'completed'?'已完成':(m.status === 'active'?'进行中':'待开始')) + '</span>' +
            '<button class="btn btn-ghost btn-sm" style="color:var(--danger);font-size:12px;" onclick="_deleteMilestoneInEdit(\'' + mId + '\')">🗑</button>' +
          '</div>';
        }).join('');
    } catch (e) {
      console.error('加载里程碑列表失败:', e);
      body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);">加载失败：' + (e.message || '未知错误') + '</div>';
    }
  }
  window._renderMilestoneEditList = _renderMilestoneEditList;

  window._deleteMilestoneInEdit = async function(mId) {
    if (!confirm('确定删除此里程碑及其所有任务？')) return;
    try {
      if (window.DB) await DB.deleteMilestone(mId);
      toast('里程碑已删除', 'success');
      await _renderMilestoneEditList();
      if (currentDetailGoalId) await _renderDetailView(currentDetailGoalId);
    } catch (e) {
      toast('删除失败', 'error');
    }
  };

  window.addNewMilestoneInline = async function() {
    var name = prompt('请输入里程碑名称：');
    if (!name || !name.trim()) return;
    try {
      if (window.DB) {
        var maxSort = 0;
        var existing = await DB.getMilestones(currentDetailGoalId);
        if (existing.success && existing.data) {
          existing.data.forEach(function(m) { if ((m.sort || 0) > maxSort) maxSort = m.sort; });
        }
        await DB.createMilestone({ goalId: currentDetailGoalId, title: name.trim(), sort: maxSort + 1 });
        toast('里程碑已添加', 'success');
      }
      await _renderMilestoneEditList();
      if (currentDetailGoalId) await _renderDetailView(currentDetailGoalId);
    } catch (e) {
      toast('添加失败: ' + e.message, 'error');
    }
  };

  if (!window.handleTaskAction) window.handleTaskAction = async function(taskId, action) {
    try {
      if (action === 'start') { await DB.startTask(taskId); toast('任务已启动','success'); }
      else if (action === 'complete') { var m=document.getElementById('taskCompleteModal'); if(m){m.setAttribute('data-task-id',taskId);m.classList.add('show');} return; }
      else if (action === 'restart') { await DB.restartTask(taskId); toast('任务已重新启动','success'); }
      await _renderDetailView(currentDetailGoalId);
    } catch(e) { toast('操作失败','error'); }
  };
  if (!window.handleDeleteTask) window.handleDeleteTask = function(taskId) { _handleDeleteTask(taskId, currentDetailGoalId); };
  if (!window.openTaskEditModal) window.openTaskEditModal = function(taskId) { toast('编辑任务：'+taskId,'info'); };
  if (!window.completeWith) window.completeWith = _handleTaskComplete;

  // 创建目标（从弹窗保存）
  window.confirmCreateGoal = function () {
    _handleCreateGoal();
  };

  /* ---- 手动创建模式：跳到第3步，携带第1步内容 ---- */
  window.isManualCreateMode = false;

  window.manualCreateToStep3 = function () {
    // 校验第1步标题
    var titleEl = document.getElementById('goalTitleInput');
    var title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      toast('请输入目标名称', 'error');
      return;
    }

    // 将第1步内容带入第3步
    var genTitleEl = document.getElementById('genGoalTitle');
    if (genTitleEl) genTitleEl.value = title;

    // 设置手动模式标记
    window.isManualCreateMode = true;

    // 切换显示：隐藏 AI 预览，显示手动编辑器
    var aiPreview = document.querySelector('#createStep3 .gen-result');
    var manualEditor = document.getElementById('manualMilestoneEditor');
    if (aiPreview) aiPreview.style.display = 'none';
    if (manualEditor) manualEditor.style.display = 'block';

    // 初始化一个空里程碑
    _renderManualMilestones();

    // 跳到第3步
    window.createStep = 3;
    var step1 = document.getElementById('createStep1');
    var step2 = document.getElementById('createStep2');
    var step3 = document.getElementById('createStep3');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'block';

    // 更新步骤指示器
    var steps = document.getElementById('createSteps');
    if (steps) {
      steps.querySelectorAll('.step').forEach(function (s, i) {
        s.classList.toggle('active', i + 1 === 3);
        s.classList.toggle('done', i + 1 < 3);
      });
    }

    // 切换按钮
    var nextBtn = document.getElementById('createNextBtn');
    var manualBtn = document.getElementById('createManualBtn');
    var confirmBtn = document.getElementById('createConfirmBtn');
    var prevBtn = document.getElementById('createPrevBtn');
    if (nextBtn) nextBtn.style.display = 'none';
    if (manualBtn) manualBtn.style.display = 'none';
    if (confirmBtn) confirmBtn.style.display = 'inline-flex';
    if (prevBtn) prevBtn.style.display = 'inline-flex';
  };

  // 手动里程碑数据（内存中）
  window._manualMilestones = [];

  window.addManualMilestone = function () {
    window._manualMilestones.push({ title: '', tasks: [] });
    _renderManualMilestones();
  };

  window.removeManualMilestone = function (idx) {
    window._manualMilestones.splice(idx, 1);
    _renderManualMilestones();
  };

  window.addManualTask = function (mIdx) {
    if (!window._manualMilestones[mIdx]) return;
    window._manualMilestones[mIdx].tasks.push('');
    _renderManualMilestones();
  };

  window.removeManualTask = function (mIdx, tIdx) {
    if (!window._manualMilestones[mIdx]) return;
    window._manualMilestones[mIdx].tasks.splice(tIdx, 1);
    _renderManualMilestones();
  };

  // 同步输入框值到内存数据
  window._syncManualMilestones = function () {
    var container = document.getElementById('manualMilestonesList');
    if (!container) return;
    var msItems = container.querySelectorAll('.manual-ms-item');
    msItems.forEach(function (msEl, mIdx) {
      var titleInput = msEl.querySelector('.manual-ms-title');
      if (titleInput && window._manualMilestones[mIdx]) {
        window._manualMilestones[mIdx].title = titleInput.value.trim();
      }
      var taskInputs = msEl.querySelectorAll('.manual-task-input');
      taskInputs.forEach(function (taskInput, tIdx) {
        if (window._manualMilestones[mIdx] && window._manualMilestones[mIdx].tasks[tIdx] !== undefined) {
          window._manualMilestones[mIdx].tasks[tIdx] = taskInput.value.trim();
        }
      });
    });
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
  window.completeWith = async function (type) {
    var modal = document.getElementById('taskCompleteModal');
    var taskId = modal ? modal.getAttribute('data-task-id') : null;
    var goalId = modal ? modal.getAttribute('data-goal-id') : currentDetailGoalId;

    _closePlanModal('taskCompleteModal');

    // 标记任务完成（await 确保"任务完成"toast 先于后续操作 toast 显示）
    if (taskId) {
      await _handleTaskComplete(taskId, goalId || currentDetailGoalId);
    }

    if (type === 'note') {
      toast('已打开笔记编辑器', 'info');
    } else {
      toast('复习卡片已生成', 'success');
    }
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
      // AI 模式：确保标记正确，显示 AI 预览
      window.isManualCreateMode = false;
      var aiPreview = document.querySelector('#createStep3 .gen-result');
      var manualEditor = document.getElementById('manualMilestoneEditor');
      if (aiPreview) aiPreview.style.display = '';
      if (manualEditor) manualEditor.style.display = 'none';
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
