/**
 * StudyMind 客户端 AI 服务
 * 直接从 localStorage 读取模型配置，调用 AI 提供商的 OpenAI 兼容接口
 * 替代原有通过 CloudBase 云函数代理的方式
 * 版本: v1.0 | 日期: 2026-06-21
 */

(function() {
  'use strict';

  // ================================================================
  // 存储键（与 settings.html 保持一致）
  // ================================================================
  const STORAGE_KEY_MODELS = 'studymind_ai_models';
  const STORAGE_KEY_SETTINGS = 'studymind_ai_settings';

  // ================================================================
  // 读取模型配置
  // ================================================================

  function getModels() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_MODELS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[AIService] 读取模型配置失败:', e);
      return [];
    }
  }

  function getAISettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (data) return JSON.parse(data);
    } catch (e) {}
    return {
      defaultModelId: '',
      temperature: 0.7,
      maxTokens: 4096,
      monthlyBudget: 20,
      budgetUsed: 0
    };
  }

  /**
   * 获取默认模型配置
   */
  function getDefaultModel() {
    const models = getModels();
    if (models.length === 0) return null;

    const settings = getAISettings();
    if (settings.defaultModelId) {
      const found = models.find(m => m.id === settings.defaultModelId);
      if (found) return found;
    }
    // 回退到第一个模型
    return models[0];
  }

  /**
   * 根据 model ID 或名称获取模型配置
   */
  function getModel(modelIdOrName) {
    const models = getModels();
    if (models.length === 0) return null;

    // 先按 ID 匹配
    if (modelIdOrName) {
      const byId = models.find(m => m.id === modelIdOrName);
      if (byId) return byId;

      // 按 provider 或 modelName 匹配
      const byName = models.find(m =>
        m.provider === modelIdOrName ||
        m.modelName === modelIdOrName ||
        m.displayName === modelIdOrName
      );
      if (byName) return byName;
    }

    // 回退到默认模型
    return getDefaultModel();
  }

  // ================================================================
  // AI Action 的系统提示词
  // ================================================================

  const ACTION_PROMPTS = {
    'chat': {
      system: '你是 StudyMind 的 AI 学习助手，帮助用户解答学习相关问题。请用中文回答，保持友好和专业。',
      format: 'text'
    },
    'goal-create': {
      system: '你是 StudyMind 的学习规划专家。用户会描述一个学习目标，你需要将其拆解为可执行的里程碑和任务。\n\n请返回 JSON 格式（不要包含 markdown 代码块标记），结构如下：\n{\n  "milestones": [\n    {\n      "title": "里程碑名称",\n      "tasks": ["任务1", "任务2", "任务3"]\n    }\n  ]\n}\n\n要求：\n- 生成 3-5 个里程碑，按学习顺序排列\n- 每个里程碑包含 2-4 个具体可执行的任务\n- 任务描述要具体、可操作\n- 考虑从基础到进阶的学习路径',
      format: 'json'
    },
    'goal-diagnosis': {
      system: '你是 StudyMind 的学习诊断专家。分析用户的学习进度数据，给出诊断报告。包括：完成率、学习时长、进度符合率、卡点分析、下周建议。请用中文回答，格式清晰。',
      format: 'text'
    },
    'time-estimate': {
      system: '你是 StudyMind 的时间预估专家。根据学习目标和任务，预估每个任务和里程碑的完成时间。给出 P70（70%概率完成）的时间估算。请用中文回答。',
      format: 'text'
    },
    'goal-summary': {
      system: '你是 StudyMind 的学习总结专家。总结用户近期的学习内容、完成情况、知识掌握度。请用中文回答，条理清晰。',
      format: 'text'
    },
    'quiz': {
      system: '你是 StudyMind 的快问快答出题专家。根据给定主题，出一道简短的知识检测题。格式：问题 + 答案。请用中文。',
      format: 'text'
    },
    'serial-test': {
      system: '你是 StudyMind 的串联测试专家。根据多张复习卡片的内容，生成一道综合性的串联测试题，考察知识点之间的关联。请用中文。',
      format: 'text'
    },
    'improvement-plan': {
      system: '你是 StudyMind 的补强计划专家。根据用户的薄弱知识点，生成有针对性的补强学习计划。请用中文。',
      format: 'text'
    },
    'all-improvement-plans': {
      system: '你是 StudyMind 的补强计划专家。分析用户所有薄弱项，批量生成补强计划。请用中文。',
      format: 'text'
    },
    'process-orphaned': {
      system: '你是 StudyMind 的知识管理专家。分析孤岛知识（未分类或无关联的知识条目），给出分类和关联建议。请用中文。',
      format: 'text'
    },
    'health-report': {
      system: '你是 StudyMind 的知识健康度分析专家。分析知识库的整体健康状况，包括分类覆盖度、知识更新频率、关联密度等。请用中文。',
      format: 'text'
    },
    'generate-cards': {
      system: '你是 StudyMind 的复习卡片生成专家。根据给定知识条目，生成 3-5 张复习卡片。每张卡片包含问题和答案。请用中文。\n\n返回 JSON 格式（不要包含 markdown 代码块标记）：\n{\n  "cards": [\n    {"question": "问题", "answer": "答案"}\n  ]\n}',
      format: 'json'
    },
    'import-suggestions': {
      system: '你是 StudyMind 的资讯分析专家。分析给定资讯内容，判断是否值得入库，并给出分类和标签建议。请用中文。',
      format: 'text'
    },
    'recommend-materials': {
      system: '你是 StudyMind 的素材推荐专家。根据当前文档内容，推荐相关的知识条目作为参考素材。请用中文。',
      format: 'text'
    },
    'expand': {
      system: '你是 StudyMind 的内容扩写专家。将给定的简短内容扩写为详细的学习笔记。请用中文。',
      format: 'text'
    },
    'refine': {
      system: '你是 StudyMind 的内容润色专家。对给定内容进行润色优化，提升表达清晰度和可读性。请用中文。',
      format: 'text'
    },
    'outline': {
      system: '你是 StudyMind 的大纲生成专家。根据给定主题，生成结构化的文章大纲。请用中文。',
      format: 'text'
    },
    'review': {
      system: '你是 StudyMind 的文档评审专家。对给定文档进行质量评审，给出改进建议。请用中文。',
      format: 'text'
    },
    'compare': {
      system: '你是 StudyMind 的 AI 学习助手。请用中文回答用户问题。',
      format: 'text'
    },
    'review-exercises': {
      system: '你是 StudyMind 的复习出题专家。根据提供的复习卡片内容，生成指定题型比例和难度的练习题。\n\n请返回 JSON 格式（不要包含 markdown 代码块标记），结构如下：\n{\n  "exercises": [\n    {\n      "type": "choice|fill|qa",\n      "question": "题目",\n      "options": [{"key": "A", "text": "选项"}],\n      "answer": "答案",\n      "explanation": "解析",\n      "difficulty": "easy|medium|hard"\n    }\n  ]\n}\n\n要求：\n- 严格按传入的题型比例生成题目\n- 每道题标注难度\n- 选择题必须提供 4 个选项和唯一正确答案\n- 填空题和问答题答案要准确简洁',
      format: 'json'
    },
    'create-plan-with-search': {
      system: '你是 StudyMind 的学习规划专家。根据用户描述和检索到的学习资料，制定学习目标并拆解为里程碑和任务。\n\n请返回 JSON 格式（不要包含 markdown 代码块标记），结构如下：\n{\n  "title": "目标标题",\n  "description": "目标描述",\n  "milestones": [\n    {\n      "title": "里程碑名称",\n      "tasks": ["任务1", "任务2"]\n    }\n  ],\n  "recommendedMaterials": ["资料标题1", "资料标题2"]\n}\n\n要求：\n- 目标标题简洁明确\n- 生成 3-5 个里程碑，按学习顺序排列\n- 每个里程碑包含 2-4 个具体可执行的任务\n- 优先结合提供的参考资料',
      format: 'json'
    },
    'news-judge': {
      system: '你是 StudyMind 的资讯价值判断专家。判断给定资讯是否与学习相关、是否值得入库，并给出评分和分类。\n\n请返回 JSON 格式（不要包含 markdown 代码块标记），结构如下：\n{\n  "isLearningRelated": true|false,\n  "worthSaving": true|false,\n  "score": 75,\n  "level": "high|mid|low",\n  "title": "优化后的标题",\n  "summary": "50字以内摘要",\n  "tags": ["标签1", "标签2"],\n  "reason": "判断理由"\n}\n\n评分标准：80-100=high，60-79=mid，40-59=low，<40 不推荐',
      format: 'json'
    },
    'weekly-diagnosis': {
      system: '你是 StudyMind 的学习诊断专家。根据用户近一周的学习数据（复习记录、任务完成情况、薄弱主题），生成诊断报告。\n\n请返回 JSON 格式（不要包含 markdown 代码块标记），结构如下：\n{\n  "overallScore": 78,\n  "completionRate": 0.65,\n  "weakPoints": ["薄弱点1", "薄弱点2"],\n  "strengths": ["优势1", "优势2"],\n  "suggestions": ["建议1", "建议2"],\n  "nextWeekPlan": ["下周行动1", "下周行动2"]\n}\n\n要求：\n- overallScore 为 0-100 的整数\n- 薄弱点不超过 5 个\n- 建议要具体可执行',
      format: 'json'
    }
  };

  // ================================================================
  // 核心：调用 AI API
  // ================================================================

/**
 * 清洗 AI 返回内容，移除 markdown JSON 代码块包装
 * @param {string} content
 * @returns {string}
 */
function cleanJsonWrapper(content) {
  if (!content || typeof content !== 'string') return content;
  // 匹配 ```json ... ``` 或 ``` ... ```
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }
  return content.trim();
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error, response) {
  if (!response) return true;
  // 5xx 服务端错误、429 限流、408 请求超时、网络错误
  if (response.status >= 500 || response.status === 429 || response.status === 408) return true;
  // fetch 抛错（网络异常、CORS 等）
  if (error && error.name === 'TypeError') return true;
  return false;
}

/**
 * 带重试的 fetch 调用
 */
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError = null;
  let lastResponse = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[AIService] 🔄 请求尝试 ${attempt + 1}/${maxRetries + 1}: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return { response, error: null };
      }

      lastResponse = response;
      const errorText = await response.text().catch(() => '');
      lastError = new Error('API 返回错误 ' + response.status + ': ' + errorText.substring(0, 200));

      if (!isRetryableError(lastError, response)) {
        console.warn('[AIService] ⚠️ 错误不可重试，直接返回:', response.status);
        break;
      }
    } catch (error) {
      lastError = error;
      lastResponse = null;
      console.warn(`[AIService] ⚠️ 第 ${attempt + 1} 次请求失败:`, error.message);
    }

    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      console.log(`[AIService] ⏳ ${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { response: lastResponse, error: lastError };
}

/**
 * 调用 AI API（OpenAI 兼容格式），内置自动重试与 JSON 清洗
 * @param {Object} params - { action, messages, model, temperature, maxTokens, retry }
 * @returns {Promise<{success, content, tokens, model}>}
 */
async function callAI(params) {
  const { action, messages, model: modelParam, temperature, maxTokens, retry = 3 } = params;

  // 获取模型配置
  const modelConfig = getModel(modelParam);
  if (!modelConfig) {
    console.error('[AIService] 未找到可用的模型配置');
    return {
      success: false,
      error: '未配置 AI 模型，请先在设置页面添加模型配置',
      content: ''
    };
  }

  // 获取 AI 设置
  const settings = getAISettings();

  // 构建系统提示
  const actionConfig = ACTION_PROMPTS[action] || ACTION_PROMPTS['chat'];
  const systemPrompt = actionConfig.system;

  // 构建消息列表
  const fullMessages = [
    { role: 'system', content: systemPrompt }
  ];

  // 如果传入的 messages 已有 system 消息，跳过
  const userMessages = (messages || []).filter(m => m.role !== 'system');
  fullMessages.push(...userMessages);

  // 构建请求 URL
  const baseUrl = modelConfig.baseUrl.replace(/\/$/, '');
  const url = baseUrl + '/chat/completions';

  // 构建请求头
  const headers = { 'Content-Type': 'application/json' };
  if (modelConfig.provider !== 'ollama' && modelConfig.apiKey) {
    headers['Authorization'] = 'Bearer ' + modelConfig.apiKey;
  }

  // 构建请求体
  const body = {
    model: modelConfig.modelName,
    messages: fullMessages,
    temperature: temperature !== undefined ? temperature : (settings.temperature || 0.7),
    max_tokens: maxTokens || (settings.maxTokens || 4096),
    stream: false
  };

  console.log('[AIService] 📡 调用 AI API:', {
    provider: modelConfig.provider,
    model: modelConfig.modelName,
    action: action,
    url: url,
    messageCount: fullMessages.length,
    maxRetries: retry
  });

  const { response, error } = await fetchWithRetry(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  }, retry);

  if (error || !response) {
    console.error('[AIService] ❌ API 调用失败（已重试）:', error);
    return {
      success: false,
      error: error && error.message ? error.message : 'AI API 调用失败',
      content: ''
    };
  }

  try {
    const data = await response.json();
    console.log('[AIService] 📥 API 响应:', { status: 'ok', model: data.model || modelConfig.modelName });

    // 提取回复内容
    let content = '';
    if (data.choices && data.choices.length > 0) {
      if (data.choices[0].message && data.choices[0].message.content) {
        content = data.choices[0].message.content;
      } else if (data.choices[0].text) {
        content = data.choices[0].text;
      }
    } else if (data.content) {
      content = data.content;
    }

    // 清洗 JSON 包装
    if (actionConfig.format === 'json' && content) {
      const originalLength = content.length;
      content = cleanJsonWrapper(content);
      if (content.length !== originalLength) {
        console.log('[AIService] 🧹 已清洗 JSON 代码块包装');
      }
    }

    // 提取 token 用量
    let tokens = 0;
    if (data.usage) {
      tokens = data.usage.total_tokens || (data.usage.prompt_tokens || 0) + (data.usage.completion_tokens || 0);
    }

    return {
      success: true,
      content: content || '(空回复)',
      tokens: tokens,
      model: modelConfig.modelName
    };
  } catch (parseError) {
    console.error('[AIService] ❌ 响应解析失败:', parseError);
    return {
      success: false,
      error: 'AI 响应解析失败: ' + parseError.message,
      content: ''
    };
  }
}

  /**
   * 测试模型连接
   */
  async function testConnection(modelId) {
    const models = getModels();
    const model = models.find(m => m.id === modelId);
    if (!model) {
      return { success: false, error: '模型不存在' };
    }

    try {
      const result = await callAI({
        action: 'chat',
        messages: [{ role: 'user', content: 'Hi' }],
        model: model.id,
        maxTokens: 5
      });
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 获取可用模型列表（给 UI 下拉框用）
   */
  function getAvailableModels() {
    const models = getModels();
    return models.map(m => ({
      id: m.id,
      name: m.displayName || m.modelName,
      description: m.provider + ' / ' + m.modelName,
      provider: m.provider,
      modelName: m.modelName,
      status: m.status || 'unknown'
    }));
  }

  // ================================================================
  // 智能体管理器 (AgentManager)
  // ================================================================

  const STORAGE_KEY_AGENTS = 'studymind_agents';
  const STORAGE_KEY_SKILLS = 'studymind_skills';

  /** 内置智能体配置 */
  const BUILTIN_AGENTS = [
    {
      id: 'general',
      name: '通用助手',
      icon: '🤖',
      description: '通用 AI 学习助手，解答各类学习问题',
      skills: [],
      contextInject: null,
      isBuiltin: true
    },
    {
      id: 'kb-butler',
      name: '知识库管家',
      icon: '📚',
      description: '帮你整理知识库分类、标签、切片',
      skills: ['kb-manage'],
      contextInject: 'injectKnowledgeContext',
      isBuiltin: true
    },
    {
      id: 'news-butler',
      name: '资讯管家',
      icon: '📰',
      description: 'RSS源管理、资讯抓取、AI评分入库',
      skills: ['news-manage'],
      contextInject: 'injectNewsContext',
      isBuiltin: true
    },
    {
      id: 'learning-coach',
      name: '学习教练',
      icon: '🎯',
      description: '管理学习目标、诊断进度、制定计划',
      skills: ['learn-manage'],
      contextInject: 'injectLearningContext',
      isBuiltin: true
    },
    {
      id: 'review-coach',
      name: '复习教练',
      icon: '🔄',
      description: '管理复习计划、生成卡片、知识健康诊断',
      skills: ['review-manage'],
      contextInject: 'injectReviewContext',
      isBuiltin: true
    }
  ];

  /** 内置智能体 System Prompt */
  const AGENT_PROMPTS = {
    'general': '你是 StudyMind 的 AI 学习助手，帮助用户解答学习相关问题。请用中文回答，保持友好和专业。',

    'kb-butler': `你是 StudyMind 知识库管家，专门帮助用户整理和管理知识库。

## 你的能力
1. 查看知识库分类树和知识条目列表
2. 创建/重命名/删除/移动知识分类
3. 为知识条目重新打标签
4. 删除知识条目
5. 对知识条目重新切片和矢量化

## 工作流程
当用户要求整理知识库时：
1. 先读取当前分类树和条目列表（系统会自动注入）
2. 分析现有结构的问题
3. 提出详细的整理方案，包括：
   - 哪些分类需要创建/重命名/删除/移动
   - 哪些条目需要重新打标签/移动分类/删除
   - 整理后的预期效果（用树形结构展示）
4. 等待用户确认方案
5. 用户确认后，输出结构化指令执行

## 输出格式
当你需要执行操作时，必须在回复末尾输出以下格式（不要省略）：
<kb-commands>
[{"action":"create","name":"新分类名","parentId":"","level":1,"icon":"📁"},
 {"action":"rename","target":"旧分类名","newName":"新分类名"},
 {"action":"delete","target":"分类名"},
 {"action":"move","target":"分类名","newParent":"父分类名"},
 {"action":"retag","itemTitle":"文章标题","tags":["tag1","tag2"]},
 {"action":"delete-item","itemTitle":"文章标题"},
 {"action":"rechunk","itemTitle":"文章标题"}]
</kb-commands>

## 注意事项
- 删除操作前必须二次确认
- 方案要清晰列出每一步操作，用表格或列表展示
- 先给方案，用户确认后再输出 <kb-commands>
- parentId 为空字符串表示顶级分类
- level: 1=一级, 2=二级, 3=三级`,

    'news-butler': `你是 StudyMind 资讯管家，专门帮助用户管理资讯信息。

## 你的能力
1. 查看和管理 RSS 源（添加/删除/启用/禁用）
2. 触发资讯抓取
3. 查看抓取到的资讯列表和 AI 评分
4. 将高评分资讯推荐入库

## 工作流程
1. 用户要求管理资讯时，先查看当前 RSS 源配置和最近抓取结果
2. 分析资讯质量和覆盖度
3. 给出优化建议（添加哪些源、删除哪些源、哪些资讯值得入库）
4. 用户确认后执行操作

## 注意事项
- RSS 源需要可访问的 URL
- 资讯 AI 评分 ≥60 的才值得入库
- 优先推荐与用户学习目标相关的资讯`,

    'learning-coach': `你是 StudyMind 学习教练，专门帮助用户管理学习目标和进度。

## 你的能力
1. 查看和分析学习目标、里程碑、任务
2. 诊断学习进度（完成率、卡点分析）
3. 制定和调整学习计划
4. 预估任务完成时间
5. 生成学习总结报告

## 工作流程
1. 用户请求时，先查看当前学习目标和进度数据
2. 分析完成率、时间分配、卡点
3. 给出具体的改进建议或计划调整方案
4. 用户确认后执行调整

## 注意事项
- 建议要具体可执行
- 考虑用户的时间预算
- 优先解决卡点问题`,

    'review-coach': `你是 StudyMind 复习教练，专门帮助用户管理复习计划和知识巩固。

## 你的能力
1. 查看待复习卡片和复习计划
2. 分析遗忘曲线数据
3. 生成复习卡片和练习题
4. 诊断知识健康度
5. 制定补强计划

## 工作流程
1. 用户请求时，先查看当前复习状态和薄弱知识点
2. 分析遗忘率、复习完成率、知识关联度
3. 给出复习策略建议或补强计划
4. 用户确认后执行

## 注意事项
- 复习间隔要符合遗忘曲线
- 优先复习高遗忘率的卡片
- 补强计划要针对具体薄弱点`
  };

  /** 内置 Skills 配置 */
  const BUILTIN_SKILLS = [
    {
      id: 'kb-manage',
      name: '知识库管理',
      icon: '📚',
      description: '读取、整理、切片知识库',
      agentId: 'kb-butler',
      actions: ['kb-read', 'kb-rename', 'kb-delete', 'kb-move', 'kb-retag', 'kb-rechunk', 'kb-delete-item'],
      isBuiltin: true,
      isInstalled: true
    },
    {
      id: 'news-manage',
      name: '资讯管理',
      icon: '📰',
      description: 'RSS源管理、资讯抓取、AI评分',
      agentId: 'news-butler',
      actions: ['news-read', 'news-crawl', 'news-score'],
      isBuiltin: true,
      isInstalled: true
    },
    {
      id: 'learn-manage',
      name: '学习管理',
      icon: '🎯',
      description: '学习目标管理、进度诊断',
      agentId: 'learning-coach',
      actions: ['learn-read', 'learn-diagnose', 'learn-plan'],
      isBuiltin: true,
      isInstalled: true
    },
    {
      id: 'review-manage',
      name: '复习管理',
      icon: '🔄',
      description: '复习计划、卡片生成、知识健康',
      agentId: 'review-coach',
      actions: ['review-read', 'review-generate', 'review-diagnose'],
      isBuiltin: true,
      isInstalled: true
    }
  ];

  /**
   * 获取所有智能体（内置 + 自定义）
   */
  function getAgents() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AGENTS);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    // 首次使用，初始化内置智能体
    localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(BUILTIN_AGENTS));
    return BUILTIN_AGENTS;
  }

  /**
   * 根据 ID 获取智能体配置
   */
  function getAgent(agentId) {
    const agents = getAgents();
    return agents.find(a => a.id === agentId) || agents.find(a => a.id === 'general');
  }

  /**
   * 获取智能体的 system prompt
   */
  function getAgentPrompt(agentId) {
    return AGENT_PROMPTS[agentId] || AGENT_PROMPTS['general'];
  }

  /**
   * 获取所有 Skills
   */
  function getSkills() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SKILLS);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    localStorage.setItem(STORAGE_KEY_SKILLS, JSON.stringify(BUILTIN_SKILLS));
    return BUILTIN_SKILLS;
  }

  /**
   * 安装 Skill（预留接口）
   */
  function installSkill(skillConfig) {
    const skills = getSkills();
    const existing = skills.find(s => s.id === skillConfig.id);
    if (existing) {
      Object.assign(existing, skillConfig, { isInstalled: true });
    } else {
      skills.push({ ...skillConfig, isInstalled: true, installedAt: new Date().toISOString() });
    }
    localStorage.setItem(STORAGE_KEY_SKILLS, JSON.stringify(skills));
    return true;
  }

  /**
   * 卸载 Skill（内置不可卸载）
   */
  function uninstallSkill(skillId) {
    const skills = getSkills();
    const skill = skills.find(s => s.id === skillId);
    if (!skill || skill.isBuiltin) return false;
    skill.isInstalled = false;
    localStorage.setItem(STORAGE_KEY_SKILLS, JSON.stringify(skills));
    return true;
  }

  // ================================================================
  // 上下文注入函数
  // ================================================================

  /**
   * 注入知识库上下文（分类树 + 最近条目摘要）
   */
  async function injectKnowledgeContext() {
    try {
      if (!window.DB) return '';
      const categories = await window.DB.getCategories();
      const items = await window.DB._exec(
        window.DB._collection('knowledge_items')
          .where({ isDeleted: false })
          .orderBy('updatedAt', 'desc')
          .limit(20)
          .get()
      );
      const cats = categories.data || categories || [];
      const itemList = items.data || [];

      let ctx = '\n\n## 当前知识库状态\n\n### 分类树\n';
      if (cats.length === 0) {
        ctx += '（暂无分类）\n';
      } else {
        const catMap = {};
        cats.forEach(c => { catMap[c._id] = c; });
        const roots = cats.filter(c => !c.parentId);
        function renderTree(cat, depth) {
          let line = '  '.repeat(depth) + '- ' + (cat.icon || '📁') + ' ' + cat.name;
          ctx += line + '\n';
          cats.filter(c => c.parentId === cat._id).forEach(c => renderTree(c, depth + 1));
        }
        roots.forEach(c => renderTree(c, 0));
      }

      ctx += '\n### 最近知识条目（前20条）\n';
      if (itemList.length === 0) {
        ctx += '（暂无知识条目）\n';
      } else {
        itemList.forEach(item => {
          const catName = cats.find(c => c._id === item.categoryId)?.name || '未分类';
          const tags = (item.tags || []).join('、') || '无标签';
          ctx += `- ${item.title}（分类：${catName}，标签：${tags}）\n`;
        });
      }
      return ctx;
    } catch (e) {
      console.error('[AIService] 注入知识库上下文失败:', e);
      return '';
    }
  }

  /**
   * 注入资讯上下文（RSS源 + 最近抓取结果）
   */
  async function injectNewsContext() {
    try {
      if (!window.DB) return '';
      const sources = await window.DB.getRssSources();
      const news = await window.DB._exec(
        window.DB._collection('news_items')
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get()
      );
      const srcList = sources.data || sources || [];
      const newsList = news.data || [];

      let ctx = '\n\n## 当前资讯状态\n\n### RSS 源配置\n';
      if (srcList.length === 0) {
        ctx += '（暂无 RSS 源）\n';
      } else {
        srcList.forEach(s => {
          ctx += `- ${s.name}（${s.enabled ? '已启用' : '已禁用'}）: ${s.url}\n`;
        });
      }

      ctx += '\n### 最近抓取资讯（前10条）\n';
      if (newsList.length === 0) {
        ctx += '（暂无抓取的资讯）\n';
      } else {
        newsList.forEach(n => {
          const score = n.aiScore ? `评分:${n.aiScore}` : '未评分';
          ctx += `- ${n.title}（${score}）\n`;
        });
      }
      return ctx;
    } catch (e) {
      console.error('[AIService] 注入资讯上下文失败:', e);
      return '';
    }
  }

  /**
   * 注入学习上下文（目标 + 任务进度）
   */
  async function injectLearningContext() {
    try {
      if (!window.DB) return '';
      const goals = await window.DB._exec(
        window.DB._collection('goals')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get()
      );
      const goalList = goals.data || [];

      let ctx = '\n\n## 当前学习状态\n\n### 学习目标\n';
      if (goalList.length === 0) {
        ctx += '（暂无学习目标）\n';
      } else {
        for (const goal of goalList) {
          ctx += `- ${goal.title}（状态：${goal.status || '进行中'}）\n`;
          const tasks = await window.DB._exec(
            window.DB._collection('tasks')
              .where({ goalId: goal._id })
              .limit(10)
              .get()
          );
          const taskList = tasks.data || [];
          taskList.forEach(t => {
            ctx += `  - ${t.title}（${t.completed ? '已完成' : '未完成'}）\n`;
          });
        }
      }
      return ctx;
    } catch (e) {
      console.error('[AIService] 注入学习上下文失败:', e);
      return '';
    }
  }

  /**
   * 注入复习上下文（待复习卡片 + 薄弱知识点）
   */
  async function injectReviewContext() {
    try {
      if (!window.DB) return '';
      const cards = await window.DB._exec(
        window.DB._collection('review_cards')
          .where({ nextReview: { $lte: new Date() } })
          .limit(20)
          .get()
      );
      const cardList = cards.data || [];

      let ctx = '\n\n## 当前复习状态\n\n### 待复习卡片\n';
      if (cardList.length === 0) {
        ctx += '（暂无待复习卡片）\n';
      } else {
        cardList.forEach(c => {
          ctx += `- ${c.title || c.question || '未命名'}（难度：${c.difficulty || '中'}）\n`;
        });
      }
      return ctx;
    } catch (e) {
      console.error('[AIService] 注入复习上下文失败:', e);
      return '';
    }
  }

  /** 上下文注入函数映射表 */
  const CONTEXT_INJECTORS = {
    injectKnowledgeContext: injectKnowledgeContext,
    injectNewsContext: injectNewsContext,
    injectLearningContext: injectLearningContext,
    injectReviewContext: injectReviewContext
  };

  /**
   * 获取智能体的完整 system prompt（含上下文注入）
   * @param {string} agentId - 智能体 ID
   * @returns {Promise<string>} 完整的 system prompt
   */
  async function buildAgentSystemPrompt(agentId) {
    const agent = getAgent(agentId);
    let prompt = getAgentPrompt(agentId);

    // 注入上下文
    if (agent.contextInject && CONTEXT_INJECTORS[agent.contextInject]) {
      const context = await CONTEXT_INJECTORS[agent.contextInject]();
      if (context) {
        prompt += context;
      }
    }

    return prompt;
  }

  // ================================================================
  // 导出全局
  // ================================================================

  window.AIService = {
    callAI: callAI,
    testConnection: testConnection,
    getModels: getModels,
    getModel: getModel,
    getDefaultModel: getDefaultModel,
    getAvailableModels: getAvailableModels,
    getAISettings: getAISettings,
    // 智能体
    getAgents: getAgents,
    getAgent: getAgent,
    getAgentPrompt: getAgentPrompt,
    buildAgentSystemPrompt: buildAgentSystemPrompt,
    // Skills
    getSkills: getSkills,
    installSkill: installSkill,
    uninstallSkill: uninstallSkill,
    // 上下文注入
    injectKnowledgeContext: injectKnowledgeContext,
    injectNewsContext: injectNewsContext,
    injectLearningContext: injectLearningContext,
    injectReviewContext: injectReviewContext
  };

  console.log('✅ StudyMind AI Service loaded (with AgentManager)');
})();
