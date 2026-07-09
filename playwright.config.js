// playwright.config.js — E2E 门禁配置（StudyMind）
// ---------------------------------------------------------------------------
// 作用：
//   - 定义 E2E 测试目录 (tests/e2e)
//   - 自动启动本地静态服务 (npm run dev → python http.server 8090)
//   - 统一 baseURL，便于后续将 test-ai.js 迁移为 *.spec.js
//
// 注意：test-ai.js 目前是独立脚本 (node tests/test-ai.js)，不依赖本配置。
//   本配置为后续标准化 E2E 预留。浏览器需本地安装：npx playwright install chromium
const { defineConfig, devices } = require('playwright');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8090',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8090/index.html',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
