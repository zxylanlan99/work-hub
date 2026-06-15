const StudyMind = {
  toast: {
    show(message, type = 'info', duration = 3000) {
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
          document.body.removeChild(toast);
        }, 300);
      }, duration);

      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideOutRight {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(20px); }
        }
      `;
      document.head.appendChild(style);
      setTimeout(() => document.head.removeChild(style), duration + 400);
    },

    success(message) {
      this.show(message, 'success');
    },

    error(message) {
      this.show(message, 'danger');
    },

    warning(message) {
      this.show(message, 'warning');
    },

    info(message) {
      this.show(message, 'info');
    }
  },

  modal: {
    open(selector) {
      const overlay = document.querySelector(selector);
      if (overlay) {
        overlay.classList.add('show');
        document.body.style.overflow = 'hidden';
      }
    },

    close(selector) {
      const overlay = document.querySelector(selector);
      if (overlay) {
        overlay.classList.remove('show');
        document.body.style.overflow = '';
      }
    },

    closeAll() {
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.classList.remove('show');
      });
      document.body.style.overflow = '';
    },

    create(options = {}) {
      const {
        title = '',
        content = '',
        size = 'md',
        buttons = [],
        onClose
      } = options;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal-${size}">
          <div class="modal-header">
            <div>
              ${title ? `<div class="modal-title">${title}</div>` : ''}
            </div>
            <span class="modal-close" onclick="StudyMind.modal.closeFromElement(this)">&times;</span>
          </div>
          <div class="modal-body">${content}</div>
          ${buttons.length > 0 ? `
            <div class="modal-footer">
              ${buttons.map(btn => `
                <button class="btn ${btn.type ? `btn-${btn.type}` : 'btn-secondary'}" 
                        onclick="StudyMind.modal.handleButtonClick(this, ${JSON.stringify(btn.action)})">
                  ${btn.text}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;

      document.body.appendChild(overlay);
      this.open(`.modal-overlay:last-child`);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeFromElement(overlay.querySelector('.modal-close'));
        }
      });

      return overlay;
    },

    closeFromElement(el) {
      const overlay = el.closest('.modal-overlay');
      if (overlay) {
        overlay.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 300);
      }
      document.body.style.overflow = '';
    },

    handleButtonClick(el, action) {
      if (action === 'close') {
        this.closeFromElement(el);
      } else if (typeof action === 'string' && window[action]) {
        window[action]();
        this.closeFromElement(el);
      }
    },

    confirm(title, message, onConfirm, onCancel) {
      this.create({
        title,
        content: `<p>${message}</p>`,
        size: 'sm',
        buttons: [
          { text: '取消', type: 'secondary', action: 'close' },
          { text: '确认', type: 'primary', action: () => {
            if (onConfirm) onConfirm();
          }}
        ]
      });
    },

    alert(title, message, onClose) {
      this.create({
        title,
        content: `<p>${message}</p>`,
        size: 'sm',
        buttons: [
          { text: '确定', type: 'primary', action: () => {
            if (onClose) onClose();
          }}
        ]
      });
    }
  },

  nav: {
    setActive(navId) {
      document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
      });
      const activeItem = document.getElementById(navId);
      if (activeItem) {
        activeItem.classList.add('active');
      }
    },

    init() {
      const navItems = document.querySelectorAll('.menu-item');
      navItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          this.setActive(item.id);
          const page = item.dataset.page;
          if (page) {
            this.navigate(page);
            this.loadPage(page);
          }
        });
      });
    },

    navigate(page) {
      window.location.hash = page;
    },

    getCurrentPage() {
      return window.location.hash.slice(1) || 'home';
    },

    loadPage(page) {
      const pageTitles = {
        'home': '欢迎来到 StudyMind',
        'learning': '学习计划',
        'review': '复习计划',
        'news': '资讯',
        'ai-chat': 'AI对话',
        'knowledge': '知识沉淀',
        'output': '输出文档',
        'settings': '系统设置'
      };
      
      const titleEl = document.getElementById('page-title');
      if (titleEl && pageTitles[page]) {
        titleEl.textContent = pageTitles[page];
      }

      const container = document.getElementById('page-container');
      if (!container) return;

      fetch(`pages/${page}.html`)
        .then(response => {
          if (response.ok) {
            return response.text();
          }
          throw new Error('Page not found');
        })
        .then(html => {
          container.innerHTML = html;
        })
        .catch(() => {
          container.innerHTML = `<div class="empty-state"><span style="font-size:48px">📄</span><div class="empty-title">页面未找到</div><div class="empty-desc">该页面正在开发中...</div></div>`;
        });
    }
  },

  form: {
    validateTitle(title, maxLength = 100) {
      if (!title || title.trim().length === 0) {
        return { valid: false, message: '标题不能为空' };
      }
      if (title.length > maxLength) {
        return { valid: false, message: `标题不能超过${maxLength}字` };
      }
      return { valid: true };
    },

    validateContent(content, maxLength = 50000) {
      if (!content || content.trim().length === 0) {
        return { valid: false, message: '内容不能为空' };
      }
      if (content.length > maxLength) {
        return { valid: false, message: `内容不能超过${maxLength}字` };
      }
      return { valid: true };
    },

    validateEmail(email) {
      const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email) {
        return { valid: false, message: '邮箱不能为空' };
      }
      if (!regex.test(email)) {
        return { valid: false, message: '请输入有效的邮箱地址' };
      }
      return { valid: true };
    },

    validateUrl(url) {
      try {
        new URL(url);
        return { valid: true };
      } catch {
        return { valid: false, message: '请输入有效的URL' };
      }
    },

    showError(field, message) {
      const errorEl = field.parentNode.querySelector('.form-error');
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
      } else {
        const error = document.createElement('div');
        error.className = 'form-error form-hint';
        error.textContent = message;
        field.parentNode.appendChild(error);
      }
      field.style.borderColor = 'var(--danger)';
    },

    clearError(field) {
      const errorEl = field.parentNode.querySelector('.form-error');
      if (errorEl) {
        errorEl.remove();
      }
      field.style.borderColor = '';
    },

    serialize(form) {
      const data = {};
      const formData = new FormData(form);
      formData.forEach((value, key) => {
        data[key] = value;
      });
      return data;
    }
  },

  storage: {
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },

    get(key, defaultValue = null) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
      } catch {
        return defaultValue;
      }
    },

    remove(key) {
      localStorage.removeItem(key);
    },

    clear() {
      localStorage.clear();
    }
  },

  utils: {
    formatDate(date, format = 'YYYY-MM-DD HH:mm') {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      
      return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes);
    },

    formatTimeAgo(timestamp) {
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return this.formatDate(timestamp);
    },

    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },

    throttle(func, limit) {
      let inThrottle;
      return function executedFunction(...args) {
        if (!inThrottle) {
          func(...args);
          inThrottle = true;
          setTimeout(() => (inThrottle = false), limit);
        }
      };
    },

    generateId() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },

    getRelativeTime(date) {
      const now = new Date();
      const target = new Date(date);
      const diffMs = now - target;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return '今天';
      if (diffDays === 1) return '昨天';
      if (diffDays === -1) return '明天';
      if (diffDays < 7) return `${diffDays}天前`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
      return this.formatDate(date, 'YYYY-MM-DD');
    }
  },

  api: {
    async request(url, options = {}) {
      const defaultOptions = {
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      };

      const mergedOptions = { ...defaultOptions, ...options };
      
      try {
        const response = await fetch(url, mergedOptions);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.message || '请求失败');
        }
        
        return data;
      } catch (error) {
        StudyMind.toast.error(error.message);
        throw error;
      }
    },

    async get(url, params = {}) {
      const urlParams = new URLSearchParams(params);
      const fullUrl = `${url}?${urlParams.toString()}`;
      return this.request(fullUrl, { method: 'GET' });
    },

    async post(url, data = {}) {
      return this.request(url, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async put(url, data = {}) {
      return this.request(url, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async delete(url) {
      return this.request(url, { method: 'DELETE' });
    }
  },

  loading: {
    show(target = document.body) {
      const loading = document.createElement('div');
      loading.className = 'loading-overlay';
      loading.innerHTML = `
        <div class="loading-spinner">
          <div class="loading"></div>
          <span class="loading-text">加载中...</span>
        </div>
      `;
      target.appendChild(loading);
    },

    hide(target = document.body) {
      const loading = target.querySelector('.loading-overlay');
      if (loading) {
        loading.remove();
      }
    }
  },

  init() {
    const self = this;
    
    document.addEventListener('DOMContentLoaded', () => {
      const currentPage = self.nav.getCurrentPage();
      self.nav.setActive(`nav-${currentPage}`);
      self.nav.loadPage(currentPage);
      
      self.nav.init();
      self.initLoginButton();
      
      initCloudbase().catch(err => console.error('CloudBase init failed:', err));
    });

    window.addEventListener('hashchange', () => {
      const currentPage = self.nav.getCurrentPage();
      self.nav.setActive(`nav-${currentPage}`);
      self.nav.loadPage(currentPage);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        self.modal.closeAll();
      }
    });
  },

  initLoginButton() {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        this.showLoginModal();
      });
    }
  },

  showLoginModal() {
    this.modal.create({
      title: '用户登录',
      content: `
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input type="email" id="login-email" class="form-input" placeholder="请输入邮箱">
        </div>
        <div class="form-group">
          <label class="form-label">密码</label>
          <input type="password" id="login-password" class="form-input" placeholder="请输入密码">
        </div>
      `,
      size: 'md',
      buttons: [
        { text: '取消', type: 'secondary', action: 'close' },
        { text: '登录', type: 'primary', action: () => {
          this.handleLogin();
        }}
      ]
    });
  },

  handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
      this.toast.error('请输入邮箱和密码');
      return;
    }
    
    this.toast.info('登录中...');
    
    setTimeout(() => {
      this.storage.set('user', { email, name: email.split('@')[0] });
      this.modal.closeAll();
      this.updateUserInfo();
      this.toast.success('登录成功');
    }, 1000);
  },

  updateUserInfo() {
    const user = this.storage.get('user');
    const loginBtn = document.getElementById('login-btn');
    
    if (user) {
      loginBtn.innerHTML = `
        <span>👤</span>
        <span>${user.name}</span>
      `;
      loginBtn.onclick = () => this.showUserMenu();
    } else {
      loginBtn.textContent = '登录';
      loginBtn.onclick = () => this.showLoginModal();
    }
  },

  showUserMenu() {
    this.modal.create({
      title: '用户菜单',
      content: `
        <div style="padding: 16px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <span style="font-size: 32px;">👤</span>
            <div>
              <div style="font-weight: 600;">${this.storage.get('user')?.name}</div>
              <div style="font-size: 14px; color: #6b7280;">${this.storage.get('user')?.email}</div>
            </div>
          </div>
          <div style="border-top: 1px solid #e5e7eb; padding-top: 16px;">
            <button onclick="StudyMind.logout()" style="width: 100%; padding: 10px; background: #f3f4f6; border: none; border-radius: 8px; cursor: pointer; color: #ef4444;">
              退出登录
            </button>
          </div>
        </div>
      `,
      size: 'sm',
      buttons: []
    });
  },

  logout() {
    this.storage.remove('user');
    this.modal.closeAll();
    this.updateUserInfo();
    this.toast.info('已退出登录');
  }
};

window.StudyMind = StudyMind;

document.addEventListener('DOMContentLoaded', () => {
  StudyMind.init();
});
