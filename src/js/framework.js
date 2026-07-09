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
  /* 【Issue 5 修复】列表页去掉AI诊断按钮，仅保留新建目标 */
  plan: {
    right: `<button class="btn btn-primary btn-sm" id="planCreateBtn" onclick="openCreateModal()">+ 新建目标</button>`,
    center: ''
  },
  /* 【Issue 4 修复】tab移到页面内容区，与review/plan等页面风格一致 */
  news: {
    right: `<span class="topbar-greeting"></span>`,
    center: ''
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
    const errMsg = error && error.message ? error.message : String(error || '未知错误');
    const errStack = error && error.stack ? error.stack.replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
    container.innerHTML = `<div class="empty-state" style="padding:32px;text-align:center;">
        <p style="font-size:18px;color:var(--danger);font-weight:600;margin-bottom:12px;">⚠️ 页面加载失败</p>
        <p style="color:var(--gray-600);margin-bottom:8px;">错误信息：<span style="color:var(--danger);font-family:monospace;font-size:13px;">${errMsg}</span></p>
        <details style="max-width:600px;margin:0 auto;text-align:left;">
            <summary style="cursor:pointer;color:var(--gray-500);font-size:12px;">查看详细堆栈（按 F12 控制台可查看完整日志）</summary>
            <pre style="background:var(--gray-100);padding:12px;border-radius:8px;font-size:11px;color:var(--gray-700);overflow:auto;max-height:300px;margin-top:8px;white-space:pre-wrap;word-break:break-all;">${errStack}</pre>
        </details>
        <p style="color:var(--gray-400);font-size:12px;margin-top:16px;">请按 F12 打开控制台查看完整错误信息，或刷新页面重试</p>
    </div>`;
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
async function initApp() {
  // file:// 协议检测：直接双击打开时浏览器会拦截 fetch，导致页面内容无法加载、菜单切换无效
  if (window.location.protocol === 'file:') {
    console.warn('[Framework] 检测到通过 file:// 打开，fetch 将被浏览器拦截，请使用本地 HTTP 服务（如 python3 -m http.server）打开本应用');
    const tc = document.getElementById('toast-container');
    if (tc) {
      const t = document.createElement('div');
      t.className = 'toast toast-warning';
      t.textContent = '⚠️ 请通过本地服务打开（如 python3 -m http.server），直接双击文件会导致页面无法切换';
      tc.appendChild(t);
      setTimeout(() => t.remove(), 6000);
    } else {
      // toast 容器不存在时的兜底提示
      alert('⚠️ 请通过本地服务打开（如 python3 -m http.server），直接双击文件会导致页面无法切换');
    }
  }

  // 先初始化 CloudBase
  try {
    await initCloudbase();
    console.log('[Framework] CloudBase initialized successfully');
  } catch (error) {
    console.error('[Framework] Failed to initialize CloudBase:', error);
  }
  
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
async function renderHeatmap() {
  const heatmapContainer = document.getElementById('heatmap-container');
  if (!heatmapContainer) return;

  /* 使用真实数据替代 mockData，调用 DB.getStudyHeatmap 获取近 90 天学习记录 */
  let data = [];
  try {
    if (window.DB) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      const result = await window.DB.getStudyHeatmap(startDate.toISOString());
      if (result.success && result.data) {
        /* 将 review_history 记录转换为 {date, level} 格式 */
        const dateMap = {};
        result.data.forEach(function(record) {
          const d = new Date(record.reviewedAt);
          const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
        });
        /* 生成最近 84 天（12 周）的数据 */
        for (let i = 83; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          const count = dateMap[dateStr] || 0;
          data.push({ date: dateStr, level: Math.min(count, 4) });
        }
      }
    }
  } catch (error) {
    console.error('[Framework] 加载热力图数据失败:', error);
  }

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