// 页面路由配置
const routes = {
  home: { title: '📊 首页', file: 'pages/home.html' },
  plan: { title: '📋 学习计划', file: 'pages/plan.html' },
  news: { title: '📰 资讯动态', file: 'pages/news.html' },
  knowledge: { title: '📚 知识库', file: 'pages/knowledge.html' },
  'ai-chat': { title: '🤖 AI对话', file: 'pages/ai-chat.html' },
  review: { title: '🔄 复习计划', file: 'pages/review.html' },
  output: { title: '📝 知识沉淀', file: 'pages/output.html' }
};

// 页面顶栏右侧配置
const topbarConfigs = {
  home: `<span class="topbar-greeting" id="topbarGreeting"></span>
         <span class="topbar-date" id="topbarDate"></span>`,
  plan: `<button class="btn btn-secondary btn-sm" onclick="openDiagModal()">🤖 AI诊断</button>
         <button class="btn btn-primary btn-sm" id="planCreateBtn" onclick="openCreateModal()">+ 新建目标</button>`,
  news: `<span class="topbar-greeting"></span>`,
  knowledge: `<span class="topbar-greeting"></span>`,
  'ai-chat': `<span class="topbar-greeting"></span>`,
  review: `<span class="topbar-greeting"></span>`,
  output: `<span class="topbar-greeting"></span>`
};

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
  
  // 更新顶栏右侧内容
  updateTopbarRight(pageId);
  
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

// 执行脚本
function executeScripts(container) {
  const scripts = container.querySelectorAll('script');
  scripts.forEach(oldScript => {
    const newScript = document.createElement('script');
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
  const rightEl = document.querySelector('.topbar-right');
  if (!rightEl) return;
  const config = topbarConfigs[pageId];
  if (config) {
    rightEl.innerHTML = config;
    if (pageId === 'home') {
      updateGreeting();
      updateDate();
    }
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
}

function initKnowledgePage() {
  console.log('Initializing knowledge page...');
}

function initAiChatPage() {
  console.log('Initializing AI chat page...');
}

function initReviewPage() {
  console.log('Initializing review page...');
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