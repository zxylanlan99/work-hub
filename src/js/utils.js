// Toast 工具函数
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '✅',
    warning: '⚠️',
    info: 'ℹ️',
    error: '❌'
  };

  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;
  toastEl.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-text">${message}</span>
  `;

  container.appendChild(toastEl);

  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      toastEl.remove();
    }, 300);
  }, 2200);
}

// 格式化日期
function formatDate(date, format = 'YYYY-MM-DD HH:mm') {
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
}

// 获取当前日期显示字符串
function getCurrentDateString() {
  const now = new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
}

// 格式化时间间隔
function formatTimeAgo(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diff = now.getTime() - past.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return formatDate(past, 'MM-DD');
}

// 生成随机ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 防抖函数
function debounce(func, wait = 300) {
  let timeout = null;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 节流函数
function throttle(func, limit = 100) {
  let inThrottle = false;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 存储工具
const storage = {
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
};

// 验证工具
const validator = {
  required(value) {
    return value !== undefined && value !== null && value.toString().trim() !== '';
  },

  email(value) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  },

  minLength(value, min) {
    return value.toString().length >= min;
  },

  maxLength(value, max) {
    return value.toString().length <= max;
  },

  validateTitle(title, maxLength = 100) {
    if (!this.required(title)) {
      return { valid: false, message: '标题不能为空' };
    }
    if (title.length > maxLength) {
      return { valid: false, message: `标题不能超过${maxLength}个字符` };
    }
    return { valid: true, message: '' };
  }
};

// 导出全局变量
window.utils = {
  toast,
  formatDate,
  getCurrentDateString,
  formatTimeAgo,
  generateId,
  debounce,
  throttle,
  storage,
  validator
};