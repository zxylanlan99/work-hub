const cloud = require('wx-server-sdk');

cloud.init({
  env: 'studymind-d7g06nv0de98a1f1b'
});

// ── 鉴权与配额配置（F2 修复）──────────────────────────────
// 调用方鉴权 token：从环境变量注入，绝不硬编码
const AI_PROXY_TOKEN = process.env.AI_PROXY_TOKEN || '';
// 单个调用方窗口内最大请求数 / 窗口毫秒
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
// 单次请求最大 token 上限（防止滥用导致成本失控）
const MAX_TOKENS_CAP = 2048;

// 进程内（云函数实例复用）频率计数
const _rateBuckets = new Map(); // caller -> { count, windowStart }

function authenticate(event, context) {
  // 1) 微信上下文鉴权（生产主路径）
  let wxContext = null;
  try {
    wxContext = cloud.getWXContext();
  } catch (e) {
    wxContext = null;
  }
  // TODO(security): 生产环境应基于 wxContext.APPID/OPENID 校验来源并绑定配额；
  // 当前以 OPENID 或受控 token 作为调用方标识与限流 key。
  if (wxContext && wxContext.OPENID) {
    return { ok: true, caller: `wx:${wxContext.OPENID}` };
  }
  // 2) 降级 token / 来源校验（本地联调 / 非小程序来源）
  const token = event.callerToken || (context && context.callerToken);
  if (!AI_PROXY_TOKEN) {
    return { ok: false, error: '鉴权未配置：需 AI_PROXY_TOKEN 或微信调用上下文' };
  }
  if (!token || token !== AI_PROXY_TOKEN) {
    return { ok: false, error: '调用方鉴权失败（callerToken 不匹配）' };
  }
  return { ok: true, caller: 'token' };
}

function checkRateLimit(caller) {
  const now = Date.now();
  const bucket = _rateBuckets.get(caller);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    _rateBuckets.set(caller, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    return false;
  }
  return true;
}

exports.main = async (event, context) => {
  // 1) 鉴权（来源校验）
  const auth = authenticate(event, context);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const caller = auth.caller;

  // 2) 频率限制（配额）
  if (!checkRateLimit(caller)) {
    return { success: false, error: '请求过于频繁，请稍后再试', code: 'rate_limited' };
  }

  const { messages, model, temperature, maxTokens } = event;

  // 3) 密钥仅从环境变量注入（F2/F5 修复：绝不出现在响应中）
  const apiKeys = {
    mimo: process.env.MIMO_API_KEY,
    silicon: process.env.SILICON_API_KEY
  };
  if (!apiKeys.mimo) console.warn('WARNING: MIMO_API_KEY not set');
  if (!apiKeys.silicon) console.warn('WARNING: SILICON_API_KEY not set');

  const apiUrls = {
    mimo: 'https://api.mimo.sogou.com/api/text/chat',
    silicon: 'https://api.siliconflow.cn/v1/chat/completions'
  };

  const selectedModel = model || 'silicon';
  if (!apiKeys[selectedModel]) {
    return { success: false, error: `未配置模型密钥: ${selectedModel}` };
  }
  const apiKey = apiKeys[selectedModel];
  const apiUrl = apiUrls[selectedModel];

  // 配额上限（F2 修复）
  const effMaxTokens = Math.min(Math.max(parseInt(maxTokens, 10) || 1024, 1), MAX_TOKENS_CAP);

  console.log(`AI调用开始: caller=${caller}, model=${selectedModel}`);

  try {
    const requestBody = {
      messages,
      model: selectedModel === 'mimo' ? 'MoMo' : 'deepseek-chat',
      temperature: temperature || 0.7,
      max_tokens: effMaxTokens
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    console.log('响应状态:', response.status);
    const data = await response.json();

    let content = '暂无回复';
    let tokens = 0;

    if (data.choices && data.choices.length > 0) {
      if (data.choices[0].message && data.choices[0].message.content) {
        content = data.choices[0].message.content;
      } else if (data.choices[0].text) {
        content = data.choices[0].text;
      }
    } else if (data.response) {
      content = data.response;
    } else if (data.data && data.data.content) {
      content = data.data.content;
    } else if (data.content) {
      content = data.content;
    }

    if (data.usage && data.usage.total_tokens) {
      tokens = data.usage.total_tokens;
    } else if (data.data && data.data.usage) {
      tokens = data.data.usage.total_tokens || 0;
    }

    // 注意：不再回传 rawResponse，避免向调用方泄露上游供应商内部信息；
    // 密钥仅经 Authorization 头外发，绝不进入返回体（F2 修复）。
    return {
      success: true,
      content: content,
      tokens: tokens,
      model: selectedModel
    };
  } catch (error) {
    console.error('AI调用失败:', error.message);
    return {
      success: false,
      error: error.message,
      model: selectedModel
    };
  }
};
