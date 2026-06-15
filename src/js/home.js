async function initHomePage() {
  await initCloudbase().catch(err => console.log('CloudBase init:', err));
  
  loadStatistics();
  loadHeatmap();
  loadWarmup();
  
  const answerBtn = document.getElementById('quiz-answer-btn');
  const skipBtn = document.getElementById('skip-warmup');
  
  if (answerBtn) {
    answerBtn.addEventListener('click', showQuizAnswer);
  }
  if (skipBtn) {
    skipBtn.addEventListener('click', skipWarmup);
  }
}

async function loadStatistics() {
  try {
    const goals = await getData('goals', { status: 'active' }) || { data: [] };
    const reviewCards = await getData('review_cards', { nextReview: { $lte: new Date() } }) || { data: [] };
    const newsItems = await getData('news_items', { hasRead: false }) || { data: [] };
    const outputDocs = await getData('output_docs', { status: 'draft' }) || { data: [] };
    
    const statGoals = document.getElementById('stat-goals');
    const statReview = document.getElementById('stat-review');
    const statNews = document.getElementById('stat-news');
    const statOutput = document.getElementById('stat-output');
    
    if (statGoals) statGoals.textContent = goals.data?.length || 0;
    if (statReview) statReview.textContent = reviewCards.data?.length || 0;
    if (statNews) statNews.textContent = newsItems.data?.length || 0;
    if (statOutput) statOutput.textContent = outputDocs.data?.length || 0;
  } catch (error) {
    console.error('加载统计数据失败:', error);
  }
}

function loadHeatmap() {
  const heatmap = document.getElementById('heatmap');
  if (!heatmap) return;
  
  heatmap.innerHTML = '';
  const today = new Date();
  
  for (let i = 99; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    
    const level = Math.floor(Math.random() * 5);
    const cell = document.createElement('div');
    cell.className = `heatmap-cell heatmap-level-${level}`;
    cell.title = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    heatmap.appendChild(cell);
  }
}

function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

async function loadWarmup() {
  loadYesterdaySummary();
  loadQuiz();
}

async function loadYesterdaySummary() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(yesterday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const history = await getData('review_history', {
      reviewedAt: {
        $gte: yesterday,
        $lt: tomorrow
      }
    }) || { data: [] };
    
    const summaryEl = document.getElementById('yesterday-summary');
    if (summaryEl && history.data?.length > 0) {
      summaryEl.textContent = `昨日完成了 ${history.data.length} 道复习题，继续保持！`;
    }
  } catch (error) {
    console.error('加载昨日回顾失败:', error);
  }
}

async function loadQuiz() {
  try {
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
    
    const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
    
    const questionEl = document.getElementById('quiz-question');
    const optionsContainer = document.getElementById('quiz-options');
    
    if (questionEl) {
      questionEl.textContent = randomQuestion.question;
    }
    
    if (optionsContainer) {
      optionsContainer.innerHTML = '';
      
      randomQuestion.options.forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'quiz-option';
        optionElement.textContent = `${['A', 'B', 'C', 'D'][index]}. ${option}`;
        optionElement.style.padding = '8px 12px';
        optionElement.style.border = '1px solid #e5e7eb';
        optionElement.style.borderRadius = '8px';
        optionElement.style.marginBottom = '8px';
        optionElement.style.cursor = 'pointer';
        optionElement.addEventListener('click', () => selectQuizOption(option, randomQuestion.answer));
        optionsContainer.appendChild(optionElement);
      });
    }
    
    window.currentQuizAnswer = randomQuestion.answer;
    window.currentQuizExplanation = randomQuestion.explanation;
    
    const answerBtn = document.getElementById('quiz-answer-btn');
    if (answerBtn) {
      answerBtn.style.display = 'block';
    }
  } catch (error) {
    console.error('加载快问快答失败:', error);
    const questionEl = document.getElementById('quiz-question');
    if (questionEl) {
      questionEl.textContent = '加载问题失败，请重试';
    }
  }
}

function selectQuizOption(selected, correct) {
  const options = document.querySelectorAll('.quiz-option');
  options.forEach(opt => {
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