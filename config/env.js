// 环境配置
const ENV = {
  development: {
    CLOUDBASE_ENV: 'your-dev-env-id',
    API_BASE: '/api',
    DEBUG: true
  },
  production: {
    CLOUDBASE_ENV: 'your-prod-env-id',
    API_BASE: '/api',
    DEBUG: false
  }
};

// 根据环境变量选择配置
const currentEnv = process.env.NODE_ENV || 'development';
const config = ENV[currentEnv];

export default config;
