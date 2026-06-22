// 页面路由配置
const routes = {
  home: { title: '📊 首页', file: 'pages/home.html' },
  plan: { title: '📋 学习计划', file: 'pages/plan.html' },
  news: { title: '📰 资讯动态', file: 'pages/news.html' },
  knowledge: { title: '📚 知识库', file: 'pages/knowledge.html' },
  'ai-chat': { title: '🤖 AI对话', file: 'pages/ai-chat.html' },
  review: { title: '🔄 复习计划', file: 'pages/review.html' },
  output: { title: '📝 知识沉淀', file: 'pages/output.html' },
  settings: { title: '⚙️ 系统设置', file: 'pages/settings.html' }
};

// 页面顶栏右侧与中间配置
const topbarConfigs = {
  home: {
    right: `<span class="topbar-greeting" id="topbarGreeting"></span>
            <span class="topbar-date" id="topbarDate"></span>`,
    center: ''
  },
  plan: {
    right: `<button class="btn btn-secondary btn-sm" onclick="openDiagModal()">🤖 AI诊断</button>
            <button class="btn btn-primary btn-sm" id="planCreateBtn" onclick="openCreateModal()">+ 新建目标</button>`,
    center: ''
  },
  news: {
    right: `<span class="topbar-greeting"></span>`,
    center: `<div class="sub-tabs">
              <div class="sub-tab active" onclick="switchNewsMainTab('recommend')">AI推荐清单</div>
              <div class="sub-tab" onclick="switchNewsMainTab('history')">资讯历史</div>
              <div class="sub-tab" onclick="switchNewsMainTab('stats')">统计概览</div>
            </div>`
  },
  knowledge: {
    right: `<span class="topbar-greeting"></span>`,
    center: `<div style="margin-left:auto;display:flex;gap:10px;align-items:center">
              <button class="btn btn-secondary btn-sm" onclick="openModal('modal-health')">📋 知识体检</button>
              <button class="btn btn-primary btn-sm" onclick="openModal('modal-new-entry')">+ 新建知识</button>
            </div>`
  },
  'ai-chat': {
    right: `<span class="topbar-greeting"></span>`,
    center: ''
  },
  review: {
    right: `<button class="btn btn-warning btn-sm" onclick="openModal('modal-risk')">⚠️ 遗忘预警</button>`,
    center: ''
  },
  output: {
    right: `<button class="btn btn-secondary btn-sm" onclick="showQuickScrap()">💡 快速灵感</button>
            <button class="btn btn-primary" onclick="openModal('modal-new-output')"><span>+</span> 新建输出</button>`,
    center: ''
  },
  settings: {
    right: `<span style="font-size:12px;color:var(--gray-400)">设置即时生效 · 自动保存</span>`,
    center: ''
  }
};

// 单列布局页面
const singleColumnPages = ['plan', 'news', 'knowledge', 'ai-chat', 'review', 'output', 'settings'];

let currentPage = null;
let isLoading = false;

// 页面导航函数
function navigateTo(pageId) {
  if (isLoading || currentPage === pageId) return;
  
  const route = routes[pageId];
  if (!route) {
    console.error(`Page not found: ${pageId}`);
    return;
  }
  
  isLoading = true;
  
  // 更新导航状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const navItem = document.querySelector(`[data-page="${pageId}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }
  
  // 更新标题
  document.getElementById('page-title').textContent = route.title;
  
  // 更新顶栏右侧和中间
  updateTopbarRight(pageId);
  updateTopbarCenter(pageId);
  
  // 更新内容区布局
  updateContentLayout(pageId);
  
  // 加载页面内容
  loadPageContent(pageId, route.file);
}

// 加载页面内容
async function loadPageContent(pageId, filePath) {
  const container = document.getElementById('content-container');
  
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load ${filePath}`);
    }
    
    const html = await response.text();
    container.innerHTML = html;
    container.setAttribute('data-page', pageId);
    
    // 执行页面中的脚本
    executeScripts(container);
    
    // 调用页面初始化函数
    const initFn = window[`init${capitalize(pageId)}Page`];
    if (typeof initFn === 'function') {
      initFn();
    }
    
    currentPage = pageId;
    
    // 更新URL hash
    window.history.pushState({ page: pageId }, '', `#${pageId}`);
    
  } catch (error) {
    console.error('Error loading page:', error);
    container.innerHTML = `<div class="empty-state"><p>页面加载失败</p></div>`;
  } finally {
    isLoading = false;
  }
}

// 执行脚本：先清理上一页动态注入的脚本，再插入 head 执行，
// 这样页面内的 function 声明会挂到 window，同时避免 const/let 重复声明
function executeScripts(container) {
  // 清理之前页面动态添加的脚本
  document.querySelectorAll('script[data-page-script="true"]').forEach(s => s.remove());

  const scripts = container.querySelectorAll('script');
  scripts.forEach(oldScript => {
    const newScript = document.createElement('script');
    newScript.setAttribute('data-page-script', 'true');
    newScript.textContent = oldScript.textContent;
    document.head.appendChild(newScript);
    oldScript.remove();
  });
}

// 首字母大写
function capitalize(str) {
  return str.replace(/-(\w)/g, (_, letter) => letter.toUpperCase())
            .replace(/^(\w)/, letter => letter.toUpperCase());
}

// 处理URL hash变化
function handleHashChange() {
  const hash = window.location.hash.slice(1) || 'home';
  if (routes[hash] && hash !== currentPage) {
    navigateTo(hash);
  }
}

// 初始化导航事件
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const pageId = item.getAttribute('data-page');
      if (pageId) {
        navigateTo(pageId);
      }
    });
  });
}

// 更新日期显示
function updateDate() {
  const dateEl = document.getElementById('current-date');
  if (dateEl) {
    dateEl.textContent = utils.getCurrentDateString();
  }
}

// 获取问候语
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '🌅 早上好';
  if (hour < 18) return '☀️ 下午好';
  return '🌙 晚上好';
}

// 更新问候语
function updateGreeting() {
  const greetingEl = document.querySelector('.topbar-greeting');
  if (greetingEl) {
    greetingEl.textContent = `${getGreeting()}，欢迎回来`;
  }
}

// 更新顶栏右侧
function updateTopbarRight(pageId) {
  const rightEl = document.getElementById('topbar-right');
  if (!rightEl) return;
  const config = topbarConfigs[pageId];
  if (config) {
    rightEl.innerHTML = config.right || '';
    if (pageId === 'home') {
      updateGreeting();
      updateDate();
    }
  }
}

// 更新顶栏中间子标签
function updateTopbarCenter(pageId) {
  const centerEl = document.getElementById('topbar-center');
  if (!centerEl) return;
  const config = topbarConfigs[pageId];
  if (config && config.center) {
    centerEl.innerHTML = config.center;
    centerEl.style.display = 'flex';
  } else {
    centerEl.innerHTML = '';
    centerEl.style.display = 'none';
  }
}

// 更新内容区布局（单列 vs 双列）
function updateContentLayout(pageId) {
  const content = document.getElementById('content-container');
  if (!content) return;
  if (singleColumnPages.includes(pageId)) {
    content.classList.add('single-column');
  } else {
    content.classList.remove('single-column');
  }
}

// 初始化应用
function initApp() {
  // 初始化导航
  initNavigation();
  
  // 监听hash变化
  window.addEventListener('hashchange', handleHashChange);
  
  // 初始化首页
  const initialPage = window.location.hash.slice(1) || 'home';
  if (routes[initialPage]) {
    navigateTo(initialPage);
  } else {
    navigateTo('home');
  }
}

// 页面初始化函数（各页面独立实现）
function initHomePage() {
  console.log('Initializing home page...');
  renderHeatmap();
}

function initPlanPage() {
  console.log('Initializing plan page...');
}

function initNewsPage() {
  console.log('Initializing news page...');
  // news.html 脚本注册 window.initNewsPage，由 loadPageContent 调用
}

function initKnowledgePage() {
  console.log('Initializing knowledge page...');
}

function initAiChatPage() {
  console.log('Initializing AI chat page...');
}



function initOutputPage() {
  console.log('Initializing output page...');
}

// 渲染热力图
function renderHeatmap() {
  const heatmapContainer = document.getElementById('heatmap-container');
  if (!heatmapContainer) return;
  
  const data = mockData.home.heatmap;
  const weeks = [];
  
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, Math.min(i + 7, data.length)));
  }
  
  let html = '<div class="heatmap-wrapper">';
  weeks.forEach((week, weekIndex) => {
    html += '<div class="heatmap-week">';
    week.forEach((day, dayIndex) => {
      const level = day.level;
      html += `<div class="heatmap-cell level-${level}" title="${day.date}: ${level > 0 ? `${level}次学习` : '无学习'}"></div>`;
    });
    html += '</div>';
  });
  html += '</div>';
  
  heatmapContainer.innerHTML = html;
}

// 导出全局函数
window.navigateTo = navigateTo;
window.initApp = initApp;

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);