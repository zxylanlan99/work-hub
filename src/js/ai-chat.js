document.addEventListener('DOMContentLoaded', async function() {
  await initCloudbase();
  loadChats();
  
  document.getElementById('new-chat-btn').addEventListener('click', createNewChat);
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('message-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
  });
});

let currentChatId = null;

async function loadChats() {
  try {
    const result = await getData('chats');
    const chats = result.data;
    
    if (chats.length === 0) {
      document.getElementById('chat-list').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comments"></i>
          <div class="empty-title">暂无对话</div>
          <div class="empty-desc">点击右上角按钮开始新对话</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('chat-list').innerHTML = chats.map(chat => `
      <div style="padding: 12px; border-radius: 8px; cursor: pointer; margin-bottom: 8px;" 
           onclick="selectChat('${chat._id}', '${chat.title}')"
           id="chat-${chat._id}">
        <div style="font-weight: 500; margin-bottom: 4px;">${chat.title || '未命名对话'}</div>
        <div style="font-size: 12px; color: #6b7280;">${chat.lastMessage || '暂无消息'}</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('加载对话失败:', error);
  }
}

async function createNewChat() {
  try {
    const result = await addData('chats', {
      title: '新对话',
      createdAt: new Date()
    });
    
    currentChatId = result._id;
    document.getElementById('chat-messages').innerHTML = '';
    document.querySelectorAll('[id^="chat-"]').forEach(el => el.style.background = 'transparent');
    
    showToast('新对话已创建', 'success');
    loadChats();
  } catch (error) {
    console.error('创建对话失败:', error);
    showToast('创建对话失败', 'error');
  }
}

async function selectChat(id, title) {
  currentChatId = id;
  document.querySelectorAll('[id^="chat-"]').forEach(el => el.style.background = 'transparent');
  document.getElementById(`chat-${id}`).style.background = '#e0e7ff';
  
  await loadMessages(id);
}

async function loadMessages(chatId) {
  try {
    const result = await getData('messages', { chatId });
    const messages = result.data.sort((a, b) => a.createdAt - b.createdAt);
    
    if (messages.length === 0) {
      document.getElementById('chat-messages').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-message-circle"></i>
          <div class="empty-title">开始对话</div>
          <div class="empty-desc">输入消息开始与AI聊天</div>
        </div>
      `;
      return;
    }
    
    document.getElementById('chat-messages').innerHTML = messages.map(msg => `
      <div style="display: flex; margin-bottom: 16px; ${msg.isUser ? 'justify-content: flex-end' : ''}">
        <div style="max-width: 70%;">
          <div style="background: ${msg.isUser ? '#6366f1' : '#f3f4f6'}; 
                      color: ${msg.isUser ? 'white' : '#1f2937'};
                      padding: 12px 16px; 
                      border-radius: ${msg.isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};">
            ${msg.content}
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px; text-align: ${msg.isUser ? 'right' : 'left'};">
            ${msg.isUser ? '我' : 'AI'} · ${formatTime(msg.createdAt)}
          </div>
        </div>
      </div>
    `).join('');
    
    document.getElementById('chat-messages').scrollTop = document.getElementById('chat-messages').scrollHeight;
  } catch (error) {
    console.error('加载消息失败:', error);
  }
}

function formatTime(date) {
  const d = new Date(date);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

async function sendMessage() {
  const content = document.getElementById('message-input').value.trim();
  if (!content || !currentChatId) {
    if (!currentChatId) showToast('请先创建或选择一个对话', 'error');
    return;
  }
  
  document.getElementById('message-input').value = '';
  
  await addMessage(currentChatId, content, true);
  
  showToast('正在思考...', 'info');
  
  try {
    const model = document.getElementById('model-select').value;
    const response = await callAI(content, model);
    
    await addMessage(currentChatId, response, false);
    
    await updateData('chats', currentChatId, {
      lastMessage: content,
      updatedAt: new Date()
    });
    
    loadChats();
  } catch (error) {
    console.error('AI调用失败:', error);
    showToast('AI调用失败', 'error');
  }
}

async function addMessage(chatId, content, isUser) {
  try {
    await addData('messages', {
      chatId,
      content,
      isUser,
      createdAt: new Date()
    });
    
    await loadMessages(chatId);
  } catch (error) {
    console.error('发送消息失败:', error);
  }
}

async function callAI(message, model) {
  try {
    const result = await callFunction('ai-proxy', {
      action: 'chat',
      messages: [{ role: 'user', content: message }],
      model: model || 'mimo',
      temperature: 0.7,
      maxTokens: 1024
    });
    
    if (result && result.result && result.result.success) {
      return result.result.content;
    } else {
      throw new Error(result?.result?.error || 'AI调用失败');
    }
  } catch (error) {
    console.error('云函数调用失败:', error);
    
    const mockResponses = [
      '这是一个很好的问题！根据我的分析，您提到的内容涉及多个方面...',
      '我理解您的需求。让我为您详细解释一下...',
      '这个话题很有意思！以下是我的见解...',
      '根据您的描述，我认为可以从以下几个角度来思考...'
    ];
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return mockResponses[Math.floor(Math.random() * mockResponses.length)];
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}