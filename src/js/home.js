/**
 * StudyMind 首页模块
 * 使用 DB 服务层 (window.DB) 获取数据
 * 版本: v2.0 | 日期: 2026-06-16
 */

/* ================================================================
   主初始化函数 — 由 framework.js 调用
   ================================================================ */

async function initHomePage() {
  try {
    await initCloudbase();
    await DB.init();
  } catch (err) {
    console.error('初始化失败:', err);
    toast('云服务连接失败，部分数据不可用', 'warning');
  }

  loadStatistics();
  loadHeatmap();
  loadWarmup();
  loadResume();
  loadWeeklyTrend();

  const answerBtn = document.getElementById('quiz-answer-btn');
  const skipBtn = document.getElementById('skip-warmup');

  if (answerBtn) {
    answerBtn.addEventListener('click', showQuizAnswer);
  }
  if (skipBtn) {
    skipBtn.addEventListener('click', skipWarmup);
  }
}

/* ================================================================
   统计数据加载 — AGG-002 / AGG-003 / AGG-004 / AGG-005
   ================================================================ */

async function loadStatistics() {
  try {
    const [planStats, reviewStats, newsStats, outputStats] = await Promise.all([
      DB.getPlanStats(),
      DB.getTodayReviewStats(),
      DB.getNewsStats(),
      DB.getKnowledgeOutputStats()
    ]);

    const statGoals = document.getElementById('stat-goals');
    const statReview = document.getElementById('stat-review');
    const statNews = document.getElementById('stat-news');
    const statOutput = document.getElementById('stat-output');
    const reviewBadge = document.getElementById('review-badge');

    if (statGoals) {
      statGoals.textContent = planStats.success ? (planStats.data.active || 0) : 0;
    }
    if (statReview) {
      statReview.textContent = reviewStats.success ? (reviewStats.data.dueToday || 0) : 0;
    }
    if (statNews) {
      statNews.textContent = newsStats.success ? (newsStats.data.unread || 0) : 0;
    }
    if (statOutput) {
      statOutput.textContent = outputStats.success ? (outputStats.data.draftCount || 0) : 0;
    }

    if (reviewBadge && reviewStats.success) {
      const overdue = reviewStats.data.overdue || 0;
      if (overdue > 0) {
        reviewBadge.textContent = `⚠ 逾期${overdue}`;
        reviewBadge.className = 'quick-card-badge qbadge-warn';
      } else {
        reviewBadge.textContent = '待复习';
        reviewBadge.className = 'quick-card-badge';
      }
    }

    const quickCards = document.querySelectorAll('.quick-card');
    if (quickCards[0]) {
      const active = planStats.success ? (planStats.data.active || 0) : 0;
      quickCards[0].querySelector('.quick-card-sub').textContent = `${active}个学习目标进行中`;
    }
    if (quickCards[1]) {
      const due = reviewStats.success ? (reviewStats.data.dueToday || 0) : 0;
      const overdue = reviewStats.success ? (reviewStats.data.overdue || 0) : 0;
      quickCards[1].querySelector('.quick-card-sub').textContent = overdue > 0 
        ? `${due}张卡片待复习 · ${overdue}张已逾期` 
        : `${due}张卡片待复习`;
    }
    if (quickCards[2]) {
      const unread = newsStats.success ? (newsStats.data.unread || 0) : 0;
      quickCards[2].querySelector('.quick-card-sub').textContent = `${unread}条AI推荐资讯待处理`;
    }
    if (quickCards[3]) {
      const drafts = outputStats.success ? (outputStats.data.draftCount || 0) : 0;
      quickCards[3].querySelector('.quick-card-sub').textContent = `${drafts}篇草稿待完成`;
    }
  } catch (error) {
    console.error('加载统计数据失败:', error);
    toast('加载统计数据失败', 'error');
  }
}

/* ================================================================
   学习热力图 — DB-R-002
   ================================================================ */

async function loadHeatmap() {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;

  try {
    heatmap.innerHTML = '';

    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 99);
    startDate.setHours(0, 0, 0, 0);

    // 从 DB 获取热力图数据
    const result = await DB.getStudyHeatmap(startDate.toISOString());
    const studyMap = {};

    if (result.success && result.data) {
      result.data.forEach((record) => {
        const d = new Date(record.reviewedAt);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        studyMap[key] = (studyMap[key] || 0) + 1;
      });
    }

    // 渲染 100 天网格
    for (let i = 99; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const count = studyMap[key] || 0;
      const level = count >= 5 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0;

      const cell = document.createElement('div');
      cell.className = `heatmap-cell h${level}`;
      cell.title = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} — ${count} 次学习`;
      heatmap.appendChild(cell);
    }
  } catch (error) {
    console.error('加载热力图失败:', error);
    toast('加载热力图失败', 'error');

    // 降级：渲染空白热力图
    heatmap.innerHTML = '';
    const today = new Date();
    for (let i = 99; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell h0';
      cell.title = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
      heatmap.appendChild(cell);
    }
  }
}

/* ================================================================
   暖身卡入口
   ================================================================ */

async function loadWarmup() {
  loadYesterdaySummary();
  loadQuiz();
}

/* DB-R-001: 昨日学习回顾 */
async function loadYesterdaySummary() {
  try {
    const result = await DB.getYesterdayReview();
    const summaryEl = document.getElementById('yesterday-summary');

    if (summaryEl) {
      if (result.success && result.data && result.data.length > 0) {
        summaryEl.textContent = `昨日完成了 ${result.data.length} 道复习题，继续保持！`;
      } else {
        summaryEl.textContent = '昨日暂无复习记录，今天开始加油吧！';
      }
    }
  } catch (error) {
    console.error('加载昨日回顾失败:', error);
    toast('加载昨日回顾失败', 'error');
  }
}

/* AI-001: 快问快答 */
async function loadQuiz() {
  try {
    const questionEl = document.getElementById('quiz-question');
    const optionsContainer = document.getElementById('quiz-options');
    const answerBtn = document.getElementById('quiz-answer-btn');

    if (!questionEl) return;

    let quizData = null;

    // 尝试从 DB/AI 获取题目
    try {
      const result = await DB.getQuiz('学习方法');
      if (result && result.success && result.content) {
        quizData = {
          question: result.content,
          options: ['A', 'B', 'C', 'D'],
          answer: result.content,
          explanation: ''
        };
      }
    } catch (err) {
      console.log('AI quiz 获取失败:', err);
    }

    if (!quizData || !quizData.question) {
      quizContainer.style.display = 'none';
      return;
    }

    // 渲染问题
    questionEl.textContent = quizData.question;

    // 渲染选项
    if (optionsContainer) {
      optionsContainer.innerHTML = '';
      const labels = ['A', 'B', 'C', 'D'];
      (quizData.options || []).forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'quiz-option';
        optionElement.textContent = `${labels[index] || index + 1}. ${option}`;
        optionElement.style.padding = '8px 12px';
        optionElement.style.border = '1px solid #e5e7eb';
        optionElement.style.borderRadius = '8px';
        optionElement.style.marginBottom = '8px';
        optionElement.style.cursor = 'pointer';
        optionElement.addEventListener('click', () => selectQuizOption(option, quizData.answer));
        optionsContainer.appendChild(optionElement);
      });
    }

    window.currentQuizAnswer = quizData.answer;
    window.currentQuizExplanation = quizData.explanation;

    if (answerBtn) {
      answerBtn.style.display = 'block';
    }
  } catch (error) {
    console.error('加载快问快答失败:', error);
    toast('加载快问快答失败', 'error');
    const questionEl = document.getElementById('quiz-question');
    if (questionEl) {
      questionEl.textContent = '加载问题失败，请重试';
    }
  }
}

/* ================================================================
   快问快答交互
   ================================================================ */

function selectQuizOption(selected, correct) {
  const options = document.querySelectorAll('.quiz-option');
  options.forEach((opt) => {
    if (opt.textContent.includes(correct)) {
      opt.style.background = '#dcfce7';
      opt.style.borderColor = '#22c55e';
    } else if (opt.textContent.includes(selected) && selected !== correct) {
      opt.style.background = '#fee2e2';
      opt.style.borderColor = '#ef4444';
    }
    opt.style.cursor = 'default';
  });

  showQuizAnswer();
}

function showQuizAnswer() {
  const answerEl = document.getElementById('quiz-answer');
  const answerBtn = document.getElementById('quiz-answer-btn');

  if (answerEl) {
    answerEl.textContent = `答案：${window.currentQuizAnswer}\n${window.currentQuizExplanation}`;
    answerEl.style.display = 'block';
  }
  if (answerBtn) {
    answerBtn.style.display = 'none';
  }
}

function skipWarmup() {
  const warmupCard = document.getElementById('warmup-card');
  if (warmupCard) {
    warmupCard.style.display = 'none';
  }
}

/* ================================================================
   智能续接 — AGG-001: 上次学习断点
   ================================================================ */

async function loadResume() {
  try {
    const result = await DB.getLastBreakpoint();
    if (!result.success || !result.data) {
      document.getElementById('resumePanel').style.display = 'none';
      return;
    }

    const { goals, reviewCards, chats } = result.data;
    const topicContentEl = document.getElementById('resume-topic-content');
    const timeEl = document.getElementById('resume-time');
    const durationEl = document.getElementById('resume-duration');
    const progressEl = document.getElementById('resume-progress');

    if (topicContentEl && goals && goals.length > 0) {
      const lastGoal = goals[0];
      topicContentEl.textContent = lastGoal.title || '未知主题';
    }

    if (timeEl && goals && goals.length > 0 && goals[0].updatedAt) {
      timeEl.textContent = `⏱ ${formatDate(goals[0].updatedAt)}`;
    } else {
      timeEl.style.display = 'none';
    }

    if (durationEl && goals && goals.length > 0 && goals[0].weeklyHours) {
      durationEl.textContent = `📖 预计剩余约 ${goals[0].weeklyHours} 小时`;
    } else {
      durationEl.style.display = 'none';
    }

    if (progressEl) {
      progressEl.textContent = '📊 继续学习';
    }
  } catch (error) {
    console.error('加载智能续接失败:', error);
    document.getElementById('resumePanel').style.display = 'none';
  }
}

async function generateContextSummary() {
  try {
    const result = await DB.getLastBreakpoint();
    if (result.success && result.data && result.data.goals && result.data.goals.length > 0) {
      const goal = result.data.goals[0];
      toast(`上下文摘要：${goal.title} - 点击继续学习`, 'info');
    } else {
      toast('暂无学习记录', 'info');
    }
  } catch (error) {
    console.error('生成上下文摘要失败:', error);
    toast('生成失败', 'error');
  }
}

async function showRelatedKnowledge() {
  try {
    const result = await DB.getLastBreakpoint();
    if (result.success && result.data && result.data.goals && result.data.goals.length > 0) {
      const goal = result.data.goals[0];
      toast(`关联知识点：${goal.title || '暂无'}`, 'info');
    } else {
      toast('暂无关联知识点', 'info');
    }
  } catch (error) {
    console.error('获取关联知识点失败:', error);
    toast('获取失败', 'error');
  }
}

/* ================================================================
   本周趋势 — AGG-006: 本周学习统计
   ================================================================ */

async function loadWeeklyTrend() {
  try {
    const result = await DB.getWeeklyStudyStats();
    if (!result.success || !result.data) return;

    const { history, cards } = result.data;
    const historyList = history || [];
    const cardList = cards || [];

    // 计算本周完成率：本周有复习记录的天数 / 有到期卡片的天数
    const monday = new Date();
    monday.setDate(monday.getDate() - monday.getDay() + 1);
    monday.setHours(0, 0, 0, 0);

    const reviewedDays = new Set();
    historyList.forEach(h => {
      const d = new Date(h.reviewedAt);
      if (d >= monday) reviewedDays.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
    });

    const dueCardsThisWeek = cardList.filter(c => {
      const d = new Date(c.nextReview);
      return d >= monday;
    }).length;

    const completionRate = dueCardsThisWeek > 0
      ? Math.round((reviewedDays.size / 7) * 100)
      : (reviewedDays.size > 0 ? Math.round((reviewedDays.size / 7) * 100) : 0);

    // 计算连续学习天数（从今天往回数）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const studyDays = new Set();
    historyList.forEach(h => {
      const d = new Date(h.reviewedAt);
      studyDays.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
    });

    let streak = 0;
    const checkDate = new Date(today);
    while (true) {
      const key = `${checkDate.getFullYear()}-${checkDate.getMonth() + 1}-${checkDate.getDate()}`;
      if (studyDays.has(key)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // 如果今天还没学习，不计入连续
        if (streak === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
    }

    const completionEl = document.getElementById('trend-completion');
    const completionBar = document.getElementById('trend-completion-bar');
    const completionChange = document.getElementById('trend-completion-change');
    const streakEl = document.getElementById('trend-streak');
    const streakChange = document.getElementById('trend-streak-change');

    if (completionEl) completionEl.textContent = `${completionRate}%`;
    if (completionBar) completionBar.style.width = `${completionRate}%`;
    if (completionChange) {
      completionChange.textContent = streak >= 5 ? '↑ 保持良好' : '↔ 继续加油';
      completionChange.className = `trend-change ${streak >= 5 ? 'trend-up' : 'trend-neutral'}`;
    }

    if (streakEl) streakEl.textContent = `${streak} 天`;
    if (streakChange) {
      if (streak >= 7) {
        streakChange.textContent = '🔥 创近30天新高';
        streakChange.className = 'trend-change trend-up';
      } else if (streak >= 3) {
        streakChange.textContent = '↗ 保持势头';
        streakChange.className = 'trend-change trend-up';
      } else if (streak === 0) {
        streakChange.textContent = '💪 开始学习吧';
        streakChange.className = 'trend-change trend-neutral';
      } else {
        streakChange.textContent = '↔ 继续保持';
        streakChange.className = 'trend-change trend-neutral';
      }
    }
  } catch (error) {
    console.error('加载本周趋势失败:', error);
  }
}

/* ================================================================
   辅助函数
   ================================================================ */

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
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
