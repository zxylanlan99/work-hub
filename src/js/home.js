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
      statOutput.textContent = outputStats.success ? (outputStats.data.drafts || 0) : 0;
    }

    /* B3: 更新四宫格副文本 */
    const quickCards = document.querySelectorAll('.quick-card');
    if (quickCards[0]) {
      const active = planStats.success ? (planStats.data.active || 0) : 0;
      quickCards[0].querySelector('.quick-card-sub').textContent = `${active}个学习目标进行中`;
    }
    if (quickCards[1]) {
      const due = reviewStats.success ? (reviewStats.data.dueToday || 0) : 0;
      quickCards[1].querySelector('.quick-card-sub').textContent = `${due}张卡片待复习`;
    }
    if (quickCards[2]) {
      const unread = newsStats.success ? (newsStats.data.unread || 0) : 0;
      quickCards[2].querySelector('.quick-card-sub').textContent = `${unread}条AI推荐资讯待处理`;
    }
    if (quickCards[3]) {
      const drafts = outputStats.success ? (outputStats.data.drafts || 0) : 0;
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
      console.log('AI quiz 获取失败，使用 mock 数据:', err);
    }

    // Mock 数据兜底
    if (!quizData || !quizData.question) {
      const questions = [
        {
          question: 'SM-2 算法中，当你对一张卡片的记忆评分是 4 分时（满分 5 分），下次复习间隔会如何变化？',
          options: ['间隔不变', '间隔增加 50%', '间隔翻倍', '间隔增加 20%'],
          answer: '间隔翻倍',
          explanation: 'SM-2 算法中，评分 4 分表示记得很好，间隔会翻倍。'
        },
        {
          question: '在学习计划中，什么是里程碑（Milestone）？',
          options: ['一个学习目标', '目标的重要节点', '每日任务', '复习卡片'],
          answer: '目标的重要节点',
          explanation: '里程碑是学习目标的重要节点，帮助将大目标分解为可管理的部分。'
        },
        {
          question: '以下哪个不是有效的学习方法？',
          options: ['间隔重复', '主动回忆', '被动阅读', '实践应用'],
          answer: '被动阅读',
          explanation: '被动阅读是最无效的学习方法之一，主动参与才能更好地记住知识。'
        }
      ];
      const q = questions[Math.floor(Math.random() * questions.length)];
      quizData = {
        question: q.question,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation
      };
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
    if (!result.success || !result.data) return;

    const { goals, reviewCards, chats } = result.data;
    const topicEl = document.querySelector('.resume-topic');
    const metaEl = document.querySelector('.resume-meta');

    if (topicEl && goals && goals.length > 0) {
      const lastGoal = goals[0];
      topicEl.innerHTML = `<strong>上次学习：</strong>${escapeHtml(lastGoal.title || '未知主题')}`;
    }

    if (metaEl) {
      const parts = [];
      if (goals && goals.length > 0) {
        const lastGoal = goals[0];
        if (lastGoal.updatedAt) {
          parts.push(`⏱ ${formatDate(lastGoal.updatedAt)}`);
        }
        if (lastGoal.weeklyHours) {
          parts.push(`📖 ${lastGoal.weeklyHours}`);
        }
      }
      if (chats && chats.length > 0 && chats[0].updatedAt) {
        parts.push(`💬 最近对话 ${formatDate(chats[0].updatedAt)}`);
      }
      if (parts.length > 0) {
        metaEl.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
      }
    }
  } catch (error) {
    console.error('加载智能续接失败:', error);
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

    // 更新趋势面板
    const panels = document.querySelectorAll('.trend-panel');
    if (panels.length >= 2) {
      // 第一个面板：复习完成率
      const valEl = panels[0].querySelector('.trend-value');
      const barEl = panels[0].querySelector('.trend-bar-fill');
      if (valEl) valEl.textContent = `${completionRate}%`;
      if (barEl) barEl.style.width = `${completionRate}%`;

      // 第二个面板：连续天数
      const valEl2 = panels[1].querySelector('.trend-value');
      if (valEl2) valEl2.textContent = `${streak} 天`;
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
