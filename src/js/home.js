/**
 * StudyMind 首页逻辑 (home.js)
 * ---------------------------------------------------------------------------
 * 职责：通过统计接口 window.DB（直连 CloudBase，即本项目的"统计接口"）拉取真实数据，
 *       驱动 src/pages/home.html 的 5 大区块渲染。
 *
 * 关键背景（修复"首页统计始终不正确"的根因）：
 *   旧版 home.js 从未被 index.html 加载，导致 framework.js 里只会渲染热力图的
 *   默认 initHomePage() 在生效，真实统计从未加载。本文件在 index.html 中以
 *   <script src="js/home.js?v=12"></script> 置于 framework.js 之后加载，从而用
 *   window.initHomePage 覆盖 framework 的默认实现，统计才会真正生效。
 *
 * 设计要点：
 *   - 所有数据来自 window.DB 的统计方法，不写死任何 mock 数字。
 *   - 所有网络调用包 try/catch，单区块失败不影响整页。
 *   - 仅在全局暴露需要的钩子函数（initHomePage / showQuizAnswer / skipWarmup /
 *     generateContextSummary / showRelatedKnowledge / selectQuizOption），
 *     其余工具函数封装在 IIFE 内，避免污染全局命名空间。
 */
(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * 工具函数
   * ---------------------------------------------------------------- */

  /** 获取元素：返回 HTMLElement 或 null */
  function $(id) {
    return document.getElementById(id);
  }

  /** 设置文本（元素不存在时安全跳过） */
  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  /** 日期 → 本地天粒度 key（用于集合去重） */
  function dateKey(d) {
    const dt = new Date(d);
    return dt.getFullYear() + '-' + dt.getMonth() + '-' + dt.getDate();
  }

  /** 相对时间文案：今天 / 昨天 / N天前 */
  function formatRelative(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (diffDays <= 0) return `今天 ${time}`;
    if (diffDays === 1) return `昨天 ${time}`;
    return `${diffDays}天前 ${time}`;
  }

  /** HTML 转义，防止 XSS */
  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /* ----------------------------------------------------------------
   * 主入口：由 framework.js 的 loadPageContent 以 window.initHomePage() 调用
   * ---------------------------------------------------------------- */
  async function initHomePage() {
    // 1) 初始化云服务与统计接口（失败不影响 DOM 渲染，区块会走兜底文案）
    try {
      await initCloudbase();
      if (window.DB && typeof window.DB.init === 'function') {
        await window.DB.init();
      }
    } catch (err) {
      console.error('[home] 初始化云服务失败：', err);
      toast('云服务连接失败，部分数据可能不可用', 'warning');
    }

    // 2) 各区块加载（内部均自带 try/catch，异常不会中断其它区块）
    loadStatistics();   // AGG-002/003/004/005 四宫格数字 + 逾期徽标
    loadHeatmap();      // DB-R-002 近 2 周热力图
    loadWarmup();       // DB-R-001 昨日回顾 + AI-001 快问快答
    loadResume();       // AGG-001 智能续接
    loadWeeklyTrend();  // AGG-006 本周趋势

    // 3) 绑定交互按钮事件（元素由 home.html 提供）
    bindEvents();
  }

  /** 绑定暖身卡交互按钮 */
  function bindEvents() {
    const answerBtn = $('quiz-answer-btn');
    if (answerBtn) answerBtn.addEventListener('click', showQuizAnswer);

    const skipBtn = $('skip-warmup');
    if (skipBtn) skipBtn.addEventListener('click', skipWarmup);
  }

  /* ----------------------------------------------------------------
   * 区块 2：四宫格统计 — AGG-002 / AGG-003 / AGG-004 / AGG-005
   * ---------------------------------------------------------------- */
  async function loadStatistics() {
    try {
      // 直接并发调用统计接口，拿真实数据
      const [plan, review, news, output] = await Promise.all([
        DB.getPlanStats(),            // { active, paused, completed, total }
        DB.getTodayReviewStats(),     // { dueToday, overdue }
        DB.getNewsStats(),            // { unread, total }
        DB.getKnowledgeOutputStats()  // { drafts, published, total }
      ]);

      const active = plan.success ? (plan.data.active || 0) : 0;
      const dueToday = review.success ? (review.data.dueToday || 0) : 0;
      const overdue = review.success ? (review.data.overdue || 0) : 0;
      const unread = news.success ? (news.data.unread || 0) : 0;
      const drafts = output.success ? (output.data.drafts || 0) : 0;

      // 填充四宫格大数字
      setText('stat-goals', active);
      setText('stat-review', dueToday);
      setText('stat-news', unread);
      setText('stat-output', drafts);

      // 复习卡逾期徽标：overdue > 0 显示"⚠ 逾期N"并加 qbadge-warn 类
      const badge = $('review-badge');
      if (badge) {
        if (overdue > 0) {
          badge.textContent = `⚠ 逾期${overdue}`;
          badge.className = 'quick-card-badge qbadge-warn';
        } else {
          badge.textContent = '待复习';
          badge.className = 'quick-card-badge';
        }
      }

      // 各卡副标题文案
      const cards = document.querySelectorAll('.quick-card');
      if (cards[0]) cards[0].querySelector('.quick-card-sub').textContent = `${active} 个学习目标进行中`;
      if (cards[1]) cards[1].querySelector('.quick-card-sub').textContent =
        overdue > 0 ? `${dueToday} 张卡片待复习 · ${overdue} 张已逾期` : `${dueToday} 张卡片待复习`;
      if (cards[2]) cards[2].querySelector('.quick-card-sub').textContent = `${unread} 条 AI 推荐资讯待处理`;
      if (cards[3]) cards[3].querySelector('.quick-card-sub').textContent = `${drafts} 篇草稿待完成`;
    } catch (error) {
      console.error('[home] 加载统计数据失败：', error);
      toast('首页统计加载失败', 'error');
    }
  }

  /* ----------------------------------------------------------------
   * 区块 4：学习日历热力图 — DB-R-002（近 2 周 / 14 天 / 7 列 / h0–h4）
   * ---------------------------------------------------------------- */
  const HEAT_LEVELS = ['h0', 'h1', 'h2', 'h3', 'h4'];

  /** 复习次数 → 等级 0..4 */
  function toHeatLevel(count) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  }

  async function loadHeatmap() {
    const el = $('heatmap');
    if (!el) return;

    try {
      // 取近 2 周（14 天）的复习记录
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 13);

      const result = await DB.getStudyHeatmap(start.toISOString());
      const counts = {};
      if (result.success && Array.isArray(result.data)) {
        result.data.forEach((record) => {
          const key = dateKey(record.reviewedAt);
          counts[key] = (counts[key] || 0) + 1;
        });
      }

      el.innerHTML = '';
      // 渲染 14 个格子（7 列网格 → 2 行），无前导空白
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const c = counts[dateKey(d)] || 0;
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell ' + HEAT_LEVELS[toHeatLevel(c)];
        cell.title = `${d.getMonth() + 1}/${d.getDate()} — ${c} 次学习`;
        el.appendChild(cell);
      }
    } catch (error) {
      console.error('[home] 加载热力图失败：', error);
      toast('学习日历加载失败', 'error');
      // 降级：渲染全 h0 的 14 格，保证布局不塌
      el.innerHTML = '';
      for (let i = 0; i < 14; i++) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell h0';
        el.appendChild(cell);
      }
    }
  }

  /* ----------------------------------------------------------------
   * 区块 1：暖身卡 — DB-R-001 昨日回顾 + AI-001 快问快答
   * ---------------------------------------------------------------- */
  function loadWarmup() {
    loadYesterdaySummary();
    loadQuiz();
  }

  /** 昨日回顾：DB.getYesterdayReview → [{topic/title, ...}] */
  async function loadYesterdaySummary() {
    const el = $('yesterday-summary');
    try {
      const result = await DB.getYesterdayReview();
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        const list = result.data;
        const topics = list
          .slice(0, 3)
          .map((r) => r.topic || r.title || r.question || '')
          .filter(Boolean);
        el.textContent = topics.length
          ? `昨日你完成了 ${list.length} 次复习，涉及：${topics.join('、')}。`
          : `昨日你完成了 ${list.length} 次复习，继续保持！`;
      } else {
        el.textContent = '昨日暂无复习记录，今天开始加油吧 💪';
      }
    } catch (error) {
      console.error('[home] 加载昨日回顾失败：', error);
      if (el) el.textContent = '昨日回顾加载失败';
    }
  }

  /**
   * 快问快答：改用复习计划真实卡片（DB.getReviewQueue）
   * 取待复习队列首张卡，渲染 question/answer；空则提示「暂无待复习卡片」。
   */
  async function loadQuiz() {
    const questionEl = $('quiz-question');
    const optionsEl = $('quiz-options');
    const answerBtn = $('quiz-answer-btn');
    const answerEl = $('quiz-answer');
    if (!questionEl) return;

    try {
      const result = await DB.getReviewQueue();
      const cards = (result && result.success ? result.data : []) || [];
      const card = cards[0];

      if (!card) {
        // 无待复习卡片 → 显示空态提示
        questionEl.textContent = '暂无待复习卡片';
        if (optionsEl) optionsEl.innerHTML = '';
        if (answerBtn) answerBtn.style.display = 'none';
        if (answerEl) answerEl.style.display = 'none';
        currentQuiz = { question: '', answer: '' };
        return;
      }

      questionEl.textContent = card.question || '（无题面）';
      if (optionsEl) optionsEl.innerHTML = '';

      // 暂存当前卡片，供 showQuizAnswer 揭晓
      currentQuiz = { question: card.question, answer: card.answer };

      if (answerBtn) answerBtn.style.display = 'inline-flex';
      if (answerEl) answerEl.style.display = 'none';
    } catch (error) {
      console.error('[home] 加载快问快答失败：', error);
      questionEl.textContent = '题目加载失败，请稍后重试';
    }
  }

  /** 容错解析 AI 返回的 quiz content */
  function parseQuizContent(content) {
    if (content == null) return null;

    // 对象形态：{ question, options?, answer? }
    if (typeof content === 'object') {
      const q = content.question || content.q || content.title;
      if (!q) return null;
      return {
        question: String(q),
        options: Array.isArray(content.options) ? content.options.map(String) : null,
        answer: content.answer != null ? String(content.answer) : (content.explanation != null ? String(content.explanation) : '')
      };
    }

    // 字符串形态：先尝试 JSON，否则整段当作题目
    const str = String(content).trim();
    if (!str) return null;
    try {
      const obj = JSON.parse(str);
      if (obj && typeof obj === 'object') return parseQuizContent(obj);
    } catch (e) {
      /* 非 JSON，按纯文本处理 */
    }
    return { question: str, options: null, answer: str };
  }

  /** 当前题目缓存（供 showQuizAnswer 使用） */
  let currentQuiz = null;

  /* ----------------------------------------------------------------
   * 区块 3：智能续接 — AGG-001 上次学习断点
   * ---------------------------------------------------------------- */
  async function loadResume() {
    const panel = $('resumePanel');
    try {
      const result = await DB.getLastBreakpoint();
      if (!result.success || !result.data) {
        if (panel) panel.style.display = 'none';
        return;
      }

      const { goals, reviewCards, chats } = result.data;
      const goal = Array.isArray(goals) && goals[0] ? goals[0] : null;
      const card = Array.isArray(reviewCards) && reviewCards[0] ? reviewCards[0] : null;
      const chat = Array.isArray(chats) && chats[0] ? chats[0] : null;

      // 主题
      const topicEl = $('resume-topic-content');
      let topic = '暂无学习记录';
      if (goal && goal.title) topic = goal.title;
      else if (card && (card.topic || card.question)) topic = card.topic || card.question;
      else if (chat && chat.title) topic = chat.title;
      if (topicEl) topicEl.textContent = topic;

      // 时间
      const ts = (goal && goal.updatedAt) || (card && card.lastReviewAt) || (chat && chat.updatedAt);
      const timeEl = $('resume-time');
      if (timeEl) {
        if (ts) { timeEl.textContent = '⏱ ' + formatRelative(ts); timeEl.style.display = ''; }
        else timeEl.style.display = 'none';
      }

      // 剩余时间（学习目标预估周学时）
      const durEl = $('resume-duration');
      if (durEl) {
        const wh = goal && goal.weeklyHours;
        if (wh) { durEl.textContent = `📖 预计剩余约 ${wh} 小时`; durEl.style.display = ''; }
        else durEl.style.display = 'none';
      }

      // 进度
      const progEl = $('resume-progress');
      if (progEl) {
        let progress = null;
        if (goal && goal.progress != null) progress = goal.progress;
        else if (card && card.mastery != null) progress = Math.round(card.mastery * 100);
        progEl.textContent = progress != null ? `📊 进度 ${progress}%` : '📊 继续学习';
      }
    } catch (error) {
      console.error('[home] 加载智能续接失败：', error);
      if (panel) panel.style.display = 'none';
    }
  }

  /* ----------------------------------------------------------------
   * 区块 5：本周趋势 — AGG-006 本周学习统计
   * ---------------------------------------------------------------- */
  async function loadWeeklyTrend() {
    try {
      const result = await DB.getWeeklyStudyStats();
      if (!result.success || !result.data) return;

      const history = Array.isArray(result.data.history) ? result.data.history : [];
      const cards = Array.isArray(result.data.cards) ? result.data.cards : [];

      // 本周范围（周一 00:00 → 周日 23:59:59）
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      // 本周到期卡片数
      const dueThisWeek = cards.filter((c) => {
        const d = new Date(c.nextReview);
        return d >= monday && d <= sunday;
      }).length;

      // 本周已完成复习次数（history 记录数）
      const reviewedThisWeek = history.filter((h) => {
        const d = new Date(h.reviewedAt);
        return d >= monday && d <= sunday;
      }).length;

      // 复习完成率
      let completionRate;
      if (dueThisWeek > 0) {
        completionRate = Math.min(100, Math.round((reviewedThisWeek / dueThisWeek) * 100));
      } else {
        completionRate = reviewedThisWeek > 0 ? 100 : 0;
      }

      // 连续学习天数（从今天往回数有学习记录的天数；今天未学则从昨天起算）
      const studyDays = new Set();
      history.forEach((h) => studyDays.add(dateKey(h.reviewedAt)));
      let streak = 0;
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      if (!studyDays.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1); // 今天还没学，从昨天算
      while (studyDays.has(dateKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      // 填充 DOM
      setText('trend-completion', completionRate + '%');
      const bar = $('trend-completion-bar');
      if (bar) bar.style.width = completionRate + '%';

      const cc = $('trend-completion-change');
      if (cc) {
        if (completionRate >= 80) { cc.textContent = '↑ 达成优秀'; cc.className = 'trend-change trend-up'; }
        else if (completionRate >= 50) { cc.textContent = '↗ 稳步推进'; cc.className = 'trend-change trend-up'; }
        else { cc.textContent = '↔ 继续加油'; cc.className = 'trend-change'; }
      }

      setText('trend-streak', streak + ' 天');
      const sc = $('trend-streak-change');
      if (sc) {
        if (streak >= 7) { sc.textContent = '🔥 创近30天新高'; sc.className = 'trend-change trend-up'; }
        else if (streak >= 3) { sc.textContent = '↗ 保持势头'; sc.className = 'trend-change trend-up'; }
        else if (streak === 0) { sc.textContent = '💪 开始学习吧'; sc.className = 'trend-change'; }
        else { sc.textContent = '↔ 继续保持'; sc.className = 'trend-change'; }
      }
    } catch (error) {
      console.error('[home] 加载本周趋势失败：', error);
    }
  }

  /* ----------------------------------------------------------------
   * 全局交互钩子（供 home.html 的 onclick 调用）
   * ---------------------------------------------------------------- */

  /** 揭晓快问快答答案 */
  function showQuizAnswer() {
    const answerEl = $('quiz-answer');
    const answerBtn = $('quiz-answer-btn');
    if (answerEl) {
      const ans = currentQuiz && currentQuiz.answer ? currentQuiz.answer : '暂无答案';
      answerEl.textContent = '💡 参考答案：' + ans;
      answerEl.style.display = 'block';
    }
    if (answerBtn) answerBtn.style.display = 'none';
  }

  /** 跳过暖身卡 */
  function skipWarmup() {
    const panel = $('warmupPanel');
    if (panel) panel.style.display = 'none';
    toast('已跳过暖身');
  }

  /** 选择某选项（高亮后揭晓答案） */
  function selectQuizOption(optionEl, correctAnswer) {
    const options = document.querySelectorAll('#quiz-options .quiz-option');
    options.forEach((o) => { o.style.cursor = 'default'; });
    if (optionEl && correctAnswer != null && optionEl.textContent.indexOf(String(correctAnswer)) !== -1) {
      optionEl.style.background = '#dcfce7';
      optionEl.style.borderColor = '#22c55e';
    }
    showQuizAnswer();
  }

  /** 查看上下文摘要 */
  async function generateContextSummary() {
    try {
      const result = await DB.getLastBreakpoint();
      if (result.success && result.data && result.data.goals && result.data.goals.length > 0) {
        const goal = result.data.goals[0];
        toast(`上下文摘要：${goal.title || '未知主题'} — 点击"开始学习"继续`, 'info');
      } else {
        toast('暂无学习记录', 'info');
      }
    } catch (error) {
      console.error('[home] 生成上下文摘要失败：', error);
      toast('生成失败', 'error');
    }
  }

  /** 关联知识点 */
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
      console.error('[home] 获取关联知识点失败：', error);
      toast('获取失败', 'error');
    }
  }

  /* ----------------------------------------------------------------
   * 暴露到全局（framework.js 以 window.initHomePage 调用；其余为 home.html 钩子）
   * ---------------------------------------------------------------- */
  window.initHomePage = initHomePage;
  window.showQuizAnswer = showQuizAnswer;
  window.skipWarmup = skipWarmup;
  window.generateContextSummary = generateContextSummary;
  window.showRelatedKnowledge = showRelatedKnowledge;
  window.selectQuizOption = selectQuizOption;
})();
