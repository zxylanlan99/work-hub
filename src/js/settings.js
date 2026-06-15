document.addEventListener('DOMContentLoaded', async function() {
  await initCloudbase();
  
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', importData);
  document.getElementById('backup-btn').addEventListener('click', backupData);
  document.getElementById('temperature').addEventListener('input', updateTemperature);
});

async function exportData() {
  showToast('正在导出数据...', 'info');
  
  try {
    const collections = ['goals', 'knowledge_items', 'review_cards', 'chats', 'messages', 'news_items', 'output_docs', 'scraps'];
    const data = {};
    
    for (const coll of collections) {
      const result = await getData(coll);
      data[coll] = result.data;
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studymind-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('数据导出成功', 'success');
  } catch (error) {
    console.error('导出数据失败:', error);
    showToast('导出数据失败', 'error');
  }
}

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    showToast('正在导入数据...', 'info');
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      for (const [coll, items] of Object.entries(data)) {
        for (const item of items) {
          delete item._id;
          delete item._openid;
          await addData(coll, item);
        }
      }
      
      showToast('数据导入成功', 'success');
    } catch (error) {
      console.error('导入数据失败:', error);
      showToast('导入数据失败', 'error');
    }
  };
  input.click();
}

async function backupData() {
  showToast('正在备份数据...', 'info');
  
  try {
    await callFunction('data-cleanup', { action: 'backup' });
    showToast('备份成功', 'success');
  } catch (error) {
    console.error('备份失败:', error);
    showToast('备份失败', 'error');
  }
}

function updateTemperature(e) {
  const value = e.target.value;
  e.target.nextElementSibling.textContent = value;
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