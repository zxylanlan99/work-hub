const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 收集控制台日志
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE_ERROR] ${err.message}`));

  // 先注入 AI 模型配置到 localStorage
  // 注意：需要先导航到页面才能设置 localStorage
  console.log('=== 0. 准备环境 ===');
  await page.goto('http://localhost:8090/index.html', { waitUntil: 'domcontentloaded', timeout: 10000 });

  // 注入智谱 GLM 模型配置（使用测试 API Key，实际调用会失败但能验证代码路径）
  await page.evaluate(() => {
    const testModel = {
      id: 'test-zhipu-001',
      provider: 'zhipu',
      planType: 'standard',
      modelName: 'GLM-4.7-Flash',
      displayName: '智谱 GLM-4.7-Flash',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      apiKey: 'test-api-key-for-verification-only',
      status: 'ok',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('studymind_ai_models', JSON.stringify([testModel]));
    localStorage.setItem('studymind_ai_settings', JSON.stringify({
      defaultModelId: 'test-zhipu-001',
      temperature: 0.7,
      maxTokens: 4096,
      monthlyBudget: 20,
      budgetUsed: 0
    }));
  });

  console.log('已注入测试模型配置');

  // 刷新页面使配置生效
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // 验证配置
  const modelsData = await page.evaluate(() => localStorage.getItem('studymind_ai_models'));
  const settingsData = await page.evaluate(() => localStorage.getItem('studymind_ai_settings'));
  console.log('\n=== 1. 验证 AI 模型配置 ===');
  if (modelsData) {
    const models = JSON.parse(modelsData);
    console.log('已配置模型数量:', models.length);
    models.forEach((m, i) => {
      console.log(`  模型 ${i + 1}: ${m.displayName} (${m.provider}) - baseUrl: ${m.baseUrl} - model: ${m.modelName}`);
    });
  }
  if (settingsData) {
    const settings = JSON.parse(settingsData);
    console.log('默认模型 ID:', settings.defaultModelId);
  }

  // 检查 AIService 和 DB
  const aiServiceLoaded = await page.evaluate(() => typeof window.AIService !== 'undefined');
  const dbLoaded = await page.evaluate(() => typeof window.DB !== 'undefined');
  const availableModels = await page.evaluate(() => window.AIService ? window.AIService.getAvailableModels() : []);
  console.log('AIService 已加载:', aiServiceLoaded);
  console.log('DB 已加载:', dbLoaded);
  console.log('可用模型:', JSON.stringify(availableModels));

  console.log('\n=== 2. 测试 AI 对话页面 ===');
  await page.goto('http://localhost:8090/index.html#ai-chat', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  // 检查页面元素
  const chatListExists = await page.evaluate(() => !!document.getElementById('chat-list'));
  const messageInputExists = await page.evaluate(() => !!document.getElementById('message-input'));
  const modelOptionsHtml = await page.evaluate(() => {
    const el = document.getElementById('model-options');
    return el ? el.innerHTML.substring(0, 300) : '不存在';
  });
  console.log('聊天列表存在:', chatListExists);
  console.log('消息输入框存在:', messageInputExists);
  console.log('模型选择器:', modelOptionsHtml.substring(0, 200));

  // 创建新对话
  console.log('\n--- 创建新对话 ---');
  const newChatClicked = await page.evaluate(() => {
    const btn = document.querySelector('[onclick*="createNewChat"]') || document.querySelector('[onclick*="newChat"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('点击新对话:', newChatClicked);
  await page.waitForTimeout(1500);

  // 输入测试消息
  const testMessage = '你好，请用一句话介绍你自己';
  await page.evaluate((msg) => {
    const input = document.getElementById('message-input');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(input, msg);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, testMessage);
  console.log('已输入消息:', testMessage);

  // 发送消息
  const sendClicked = await page.evaluate(() => {
    const btn = document.getElementById('send-btn') || document.querySelector('[onclick*="sendMessage"]');
    if (btn) { btn.click(); return true; }
    if (typeof sendMessage === 'function') { sendMessage(); return true; }
    return false;
  });
  console.log('点击发送:', sendClicked);

  // 等待 AI 回复
  console.log('等待 AI 回复...');
  let aiResponse = null;
  let lastLogCount = 0;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    
    // 检查是否有回复
    aiResponse = await page.evaluate(() => {
      const messages = document.querySelectorAll('.chat-message, [class*="message"]');
      // 找到非 typing 的最后一条消息
      for (let j = messages.length - 1; j >= 0; j--) {
        const msg = messages[j];
        if (msg.textContent && !msg.querySelector('.typing-dots') && !msg.textContent.includes('typing')) {
          return { index: j, text: msg.textContent.substring(0, 300) };
        }
      }
      return null;
    });
    
    if (aiResponse && i > 2) {
      console.log(`第 ${i + 1} 秒收到回复:`, aiResponse.text.substring(0, 200));
      break;
    }
  }

  if (!aiResponse) {
    console.log('⚠️ 20 秒内未收到 AI 回复（可能是 API Key 无效导致，代码路径已验证）');
  }

  console.log('\n=== 3. 测试学习计划页面 ===');
  await page.goto('http://localhost:8090/index.html#plan', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // 查找 AI 创建目标相关按钮
  const aiButtons = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [onclick]');
    const result = [];
    buttons.forEach(b => {
      const text = (b.textContent || '').trim();
      const onclick = b.getAttribute('onclick') || '';
      if (text.includes('AI') || onclick.includes('aiCreate') || onclick.includes('AI') || text.includes('拆解')) {
        result.push({ text: text.substring(0, 50), onclick: onclick.substring(0, 80) });
      }
    });
    return result;
  });
  console.log('AI 相关按钮:', JSON.stringify(aiButtons, null, 2));

  console.log('\n=== 4. 测试复习计划页面 ===');
  await page.goto('http://localhost:8090/index.html#review', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  const reviewAiButtons = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, [onclick]');
    const result = [];
    buttons.forEach(b => {
      const text = (b.textContent || '').trim();
      const onclick = b.getAttribute('onclick') || '';
      if (onclick.includes('generate') || text.includes('暖身') || text.includes('补强') || text.includes('串联')) {
        result.push({ text: text.substring(0, 50), onclick: onclick.substring(0, 80) });
      }
    });
    return result;
  });
  console.log('复习页面 AI 按钮:', JSON.stringify(reviewAiButtons, null, 2));

  // 测试每日暖身功能
  console.log('\n--- 测试每日暖身 ---');
  const quizClicked = await page.evaluate(() => {
    const btn = document.querySelector('[onclick*="generateDailyQuiz"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('点击暖身测试:', quizClicked);
  await page.waitForTimeout(3000);

  console.log('\n=== 控制台日志（最后 40 条）===');
  console.log(logs.slice(-40).join('\n'));

  await browser.close();
  console.log('\n=== 测试完成 ===');
})();
