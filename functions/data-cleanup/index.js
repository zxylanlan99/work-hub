const cloud = require('wx-server-sdk');

cloud.init({
  env: 'studymind-d7g06nv0de98a1f1b'
});

const db = cloud.database();

// ── 调用方鉴权（F1 修复）───────────────────────────────────
// 生产环境（腾讯云函数 + 小程序）应优先使用 cloud.getWXContext() 校验
// 小程序调用方 OPENID，并据此校验数据归属（仅可操作本人数据）。
// 同时支持 callerToken 降级校验，用于：
//   1) 非云函数/本地联调环境（wx-server-sdk 无法获取上下文）
//   2) 定时触发器（无 OPENID）通过受控 token 调用
// 若两者均不可用，则拒绝执行，避免函数被公网任意调用导致数据泄露/清空。
const EXPECTED_CALLER_TOKEN = process.env.DATA_CLEANUP_TOKEN || '';

function authenticate(event, context) {
  // 1) 微信上下文鉴权（生产主路径）
  let wxContext = null;
  try {
    wxContext = cloud.getWXContext();
  } catch (e) {
    wxContext = null;
  }
  // TODO(security): 生产环境应强制要求 wxContext.OPENID 存在且属于本小程序，
  // 并基于 OPENID 过滤数据库查询（数据归属校验）。当前按最小权限保留了调用方标识。
  if (wxContext && wxContext.OPENID) {
    return { ok: true, caller: `wx:${wxContext.OPENID}` };
  }

  // 2) 降级 token 校验（本地联调 / 定时触发）
  const token = event.callerToken || (context && context.callerToken);
  if (!EXPECTED_CALLER_TOKEN) {
    // 未配置 token 且非微信上下文 => 环境未就绪，拒绝以防误部署暴露
    return { ok: false, error: '鉴权未配置：需 DATA_CLEANUP_TOKEN 或微信调用上下文' };
  }
  if (!token || token !== EXPECTED_CALLER_TOKEN) {
    return { ok: false, error: '调用方鉴权失败（callerToken 不匹配）' };
  }
  return { ok: true, caller: 'token' };
}

// 审计日志：记录敏感操作（best-effort，审计写入失败不阻断业务）
async function auditLog(action, caller, detail) {
  try {
    await db.collection('audit_log').add({
      data: {
        action,
        caller,
        detail: detail || {},
        createdAt: db.serverDate()
      }
    });
  } catch (e) {
    console.warn('审计日志写入失败:', e.message);
  }
}

exports.main = async (event, context) => {
  // 统一鉴权
  const auth = authenticate(event, context);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }
  const { action, dryRun } = event;

  try {
    if (action === 'backup') {
      return await backupData(auth.caller);
    } else if (action === 'cleanup') {
      return await cleanupData(auth.caller, !!dryRun);
    } else {
      return { success: false, error: '未知操作' };
    }
  } catch (error) {
    console.error('数据清理失败:', error);
    return { success: false, error: error.message };
  }
};

async function backupData(caller) {
  const collections = ['goals', 'knowledge_items', 'review_cards', 'chats', 'messages', 'news_items', 'output_docs', 'scraps'];
  const backupData = {};

  // 最小权限：backup 仅只读导出（.get()），不修改任何数据
  for (const coll of collections) {
    const result = await db.collection(coll).get();
    backupData[coll] = result.data;
  }

  // 审计留痕
  await auditLog('backup', caller, { collections });

  return {
    success: true,
    message: '备份成功',
    data: backupData
  };
}

// 单批删除上限，避免一次性清空大量数据（F1 修复）
const CLEANUP_LIMIT = 100;

async function cleanupData(caller, dryRun) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  if (dryRun) {
    // 预演：仅统计将被清理的记录数，不实际删除（F1 修复）
    const newsCount = await db.collection('news_items')
      .where({ createdAt: { $lt: thirtyDaysAgo } })
      .count();
    const reviewCount = await db.collection('review_history')
      .where({ reviewedAt: { $lt: oneYearAgo } })
      .count();
    await auditLog('cleanup_dryrun', caller, {
      news_items: newsCount.total,
      review_history: reviewCount.total
    });
    return {
      success: true,
      dryRun: true,
      message: '预演完成（未删除任何数据）',
      wouldRemove: {
        news_items: newsCount.total,
        review_history: reviewCount.total
      }
    };
  }

  // 实际删除：加 .limit() 上限保护（F1 修复）
  const newsRes = await db.collection('news_items')
    .where({ createdAt: { $lt: thirtyDaysAgo } })
    .limit(CLEANUP_LIMIT)
    .remove();

  const reviewRes = await db.collection('review_history')
    .where({ reviewedAt: { $lt: oneYearAgo } })
    .limit(CLEANUP_LIMIT)
    .remove();

  await auditLog('cleanup', caller, {
    news_items_removed: newsRes.removed || 0,
    review_history_removed: reviewRes.removed || 0
  });

  return {
    success: true,
    message: '数据清理完成',
    removed: {
      news_items: newsRes.removed || 0,
      review_history: reviewRes.removed || 0
    }
  };
}
