// API配置
const API_CONFIG = {
  // 云函数接口
  cloudFunctions: {
    'ai-proxy': '/api/ai-proxy',
    'data-cleanup': '/api/data-cleanup'
  },

  // AI模型配置
  aiModels: {
    mimo: {
      name: 'MiMo',
      platform: '小米大模型平台',
      endpoint: '/api/ai-proxy'
    },
    deepseek: {
      name: 'DeepSeek',
      platform: 'SiliconFlow',
      endpoint: '/api/ai-proxy'
    },
    kimi: {
      name: 'Kimi',
      platform: 'SiliconFlow',
      endpoint: '/api/ai-proxy'
    },
    doubao: {
      name: '豆包',
      platform: '火山引擎',
      endpoint: '/api/ai-proxy'
    }
  },

  // 请求超时（毫秒）
  timeout: 30000,

  // 重试次数
  retry: 3
};

export default API_CONFIG;
