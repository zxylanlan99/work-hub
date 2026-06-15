const cloud = require('wx-server-sdk');

cloud.init({
  env: 'studymind-d7g06nv0de98a1f1b'
});

exports.main = async (event, context) => {
  const { action, messages, model, temperature, maxTokens } = event;
  
  const apiKeys = {
    mimo: process.env.MIMO_API_KEY || 'tp-cgnwdis3jmla7c5apcy0vnmdc3w7w7uq3uytnn69wo2hcz98',
    silicon: process.env.SILICON_API_KEY || 'sk-fnvlamiyyfctzkxvtvhruwtizalcicxuswnfgemqxxwuougn'
  };
  
  const apiUrls = {
    mimo: 'https://api.mimo.sogou.com/api/text/chat',
    silicon: 'https://api.siliconflow.cn/v1/chat/completions'
  };
  
  const selectedModel = model || 'silicon';
  const apiKey = apiKeys[selectedModel];
  const apiUrl = apiUrls[selectedModel];
  
  console.log(`AI调用开始: model=${selectedModel}, url=${apiUrl}`);
  
  try {
    const requestBody = {
      messages,
      model: selectedModel === 'mimo' ? 'MoMo' : 'deepseek-chat',
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 1024
    };
    
    console.log('请求体:', JSON.stringify(requestBody));
    
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
    console.log('响应数据:', JSON.stringify(data));
    
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
    
    return {
      success: true,
      content: content,
      tokens: tokens,
      model: selectedModel,
      rawResponse: data
    };
  } catch (error) {
    console.error('AI调用失败:', error);
    console.error('错误详情:', JSON.stringify(error));
    return {
      success: false,
      error: error.message,
      model: selectedModel
    };
  }
};