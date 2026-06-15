// 主题配置
const THEME_CONFIG = {
  // 主题类型（当前仅支持白色主题）
  mode: 'light',

  // 颜色配置（与CSS变量保持一致）
  colors: {
    primary: '#6366f1',
    primaryDark: '#4f46e5',
    primaryLight: '#eef2ff',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    purple: '#7c3aed'
  },

  // 圆角配置
  radius: {
    default: '8px',
    large: '12px',
    small: '6px'
  },

  // 阴影配置
  shadows: {
    default: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
    medium: '0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06)',
    large: '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)'
  }
};

export default THEME_CONFIG;
