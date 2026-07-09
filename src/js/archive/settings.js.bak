/**
 * StudyMind 系统设置模块
 * 对应 DB 服务层 settings 模块 (4 逻辑接口)
 * 版本: v2.0 | 日期: 2026-06-16
 */

/* ================================================================
   辅助函数
   ================================================================ */

function showToast(message, type = 'info') {
  if (window.utils && window.utils.toast) {
    window.utils.toast(message, type);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;z-index:9999;animation:slideIn 0.3s;';
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  toast.style.background = colors[type] || colors.info;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 2500);
}

/* ================================================================
   主入口 - initSettingsPage
   ================================================================ */

async function initSettingsPage() {
  try {
    if (window.DB && window.DB.init) {
      await window.DB.init();
    } else {
      await initCloudbase();
    }
    await loadSettings();
    bindEvents();
  } catch (error) {
    console.error('设置页面初始化失败:', error);
    showToast('页面初始化失败，请刷新重试', 'error');
  }
}

function bindEvents() {
  const saveBtn = document.getElementById('save-settings-btn');
  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const backupBtn = document.getElementById('backup-btn');
  const clearBtn = document.getElementById('clear-data-btn');
  const tempSlider = document.getElementById('temperature');

  if (saveBtn) saveBtn.addEventListener('click', saveSettings);
  if (exportBtn) exportBtn.addEventListener('click', exportData);
  if (importBtn) importBtn.addEventListener('click', importData);
  if (backupBtn) backupBtn.addEventListener('click', backupData);
  if (clearBtn) clearBtn.addEventListener('click', clearAllData);
  if (tempSlider) tempSlider.addEventListener('input', updateTemperature);
}

/* ================================================================
   加载设置 — DB-R-034
   ================================================================ */

async function loadSettings() {
  try {
    const result = window.DB
      ? await window.DB.getUserSettings()
      : { success: true, data: {} };

    if (result.success && result.data) {
      const settings = result.data;

      // 填充表单
      const defaultModelEl = document.getElementById('default-model');
      const budgetLimitEl = document.getElementById('budget-limit');
      const budgetAlertEl = document.getElementById('budget-alert');
      const stopOnBudgetEl = document.getElementById('stop-on-budget');
      const tempEl = document.getElementById('temperature');
      const tempValEl = tempEl ? tempEl.nextElementSibling : null;
      const notifyEl = document.getElementById('enable-notifications');
      const autoBackupEl = document.getElementById('auto-backup');
      const reviewIntervalEl = document.getElementById('review-interval');

      if (defaultModelEl && settings.defaultModel) defaultModelEl.value = settings.defaultModel;
      if (budgetLimitEl && settings.budgetLimit != null) budgetLimitEl.value = settings.budgetLimit;
      if (budgetAlertEl && settings.budgetAlert != null) budgetAlertEl.value = settings.budgetAlert;
      if (stopOnBudgetEl && settings.stopOnBudget != null) stopOnBudgetEl.checked = settings.stopOnBudget;
      if (tempEl && settings.temperature != null) {
        tempEl.value = settings.temperature;
        if (tempValEl) tempValEl.textContent = settings.temperature;
      }
      if (notifyEl && settings.notifications != null) notifyEl.checked = settings.notifications;
      if (autoBackupEl && settings.autoBackup != null) autoBackupEl.checked = settings.autoBackup;
      if (reviewIntervalEl && settings.reviewInterval) reviewIntervalEl.value = settings.reviewInterval;
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

/* ================================================================
   保存设置 — DB-U-039 (合并 7 个设置接口)
   ================================================================ */

async function saveSettings() {
  const defaultModelEl = document.getElementById('default-model');
  const budgetLimitEl = document.getElementById('budget-limit');
  const budgetAlertEl = document.getElementById('budget-alert');
  const stopOnBudgetEl = document.getElementById('stop-on-budget');
  const tempEl = document.getElementById('temperature');
  const notifyEl = document.getElementById('enable-notifications');
  const autoBackupEl = document.getElementById('auto-backup');
  const reviewIntervalEl = document.getElementById('review-interval');

  const partial = {};

  if (defaultModelEl) partial.defaultModel = defaultModelEl.value;
  if (budgetLimitEl) partial.budgetLimit = parseFloat(budgetLimitEl.value) || 0;
  if (budgetAlertEl) partial.budgetAlert = parseFloat(budgetAlertEl.value) || 0;
  if (stopOnBudgetEl) partial.stopOnBudget = stopOnBudgetEl.checked;
  if (tempEl) partial.temperature = parseFloat(tempEl.value) || 0.7;
  if (notifyEl) partial.notifications = notifyEl.checked;
  if (autoBackupEl) partial.autoBackup = autoBackupEl.checked;
  if (reviewIntervalEl) partial.reviewInterval = reviewIntervalEl.value;

  try {
    const result = window.DB
      ? await window.DB.updateUserSettings(partial)
      : { success: true };
    if (result.success) {
      showToast('设置已保存', 'success');
    } else {
      showToast('保存失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('保存设置失败:', error);
    showToast('保存设置失败', 'error');
  }
}

/* ================================================================
   温度滑块
   ================================================================ */

function updateTemperature(e) {
  const value = e.target.value;
  const next = e.target.nextElementSibling;
  if (next) next.textContent = value;
}

/* ================================================================
   导出数据 — AGG-021
   ================================================================ */

async function exportData() {
  showToast('正在导出数据...', 'info');

  try {
    const result = window.DB
      ? await window.DB.exportAllData()
      : { success: false, error: 'DB 不可用' };

    if (result.success && result.data) {
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studymind-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('数据导出成功', 'success');
    } else {
      showToast('导出失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('导出数据失败:', error);
    showToast('导出数据失败', 'error');
  }
}

/* ================================================================
   导入数据 — DB-W-014
   ================================================================ */

async function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('导入数据将合并到现有数据中，确定继续吗？')) return;

    showToast('正在导入数据...', 'info');

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const result = window.DB
        ? await window.DB.importAllData(data)
        : { success: false, error: 'DB 不可用' };

      if (result.success) {
        const counts = result.data || {};
        const total = Object.values(counts).reduce((sum, arr) => sum + arr.length, 0);
        showToast(`数据导入成功，共导入 ${total} 条记录`, 'success');
      } else {
        showToast('导入失败: ' + (result.error || '未知错误'), 'error');
      }
    } catch (error) {
      console.error('导入数据失败:', error);
      showToast('导入失败: ' + error.message, 'error');
    }
  };
  input.click();
}

/* ================================================================
   清空数据 — DB-D-011
   ================================================================ */

async function clearAllData() {
  if (!confirm('确定要清空所有数据吗？此操作不可恢复！建议先导出备份。')) return;
  if (!confirm('再次确认：清空后将删除所有学习目标、知识条目、复习记录等数据。确定继续吗？')) return;

  try {
    showToast('正在清空数据...', 'info');
    const result = window.DB
      ? await window.DB.clearAllData()
      : { success: false, error: 'DB 不可用' };

    if (result.success) {
      showToast('所有数据已清空', 'success');
    } else {
      showToast('清空失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('清空数据失败:', error);
    showToast('清空失败: ' + error.message, 'error');
  }
}

/* ================================================================
   立即备份 — CF-001
   ================================================================ */

async function backupData() {
  showToast('正在备份数据...', 'info');

  try {
    const result = window.DB
      ? await window.DB.triggerBackup()
      : { success: false, error: 'DB 不可用' };

    if (result.success) {
      showToast('备份成功', 'success');
    } else {
      showToast('备份失败: ' + (result.error || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('备份失败:', error);
    showToast('备份失败: ' + error.message, 'error');
  }
}

/* ================================================================
   DOMContentLoaded 自动启动
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {
  if (document.getElementById('export-btn') || document.getElementById('settings-form')) {
    initSettingsPage();
  }
});

/* ================================================================
   暴露全局函数
   ================================================================ */

window.initSettingsPage = initSettingsPage;
window.saveSettings = saveSettings;
window.exportData = exportData;
window.importData = importData;
window.clearAllData = clearAllData;
window.backupData = backupData;
window.updateTemperature = updateTemperature;
