const cloud = require('wx-server-sdk');

cloud.init({
  env: 'studymind-d7g06nv0de98a1f1b'
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;
  
  try {
    if (action === 'backup') {
      return await backupData();
    } else if (action === 'cleanup') {
      return await cleanupData();
    } else {
      return { success: false, error: '未知操作' };
    }
  } catch (error) {
    console.error('数据清理失败:', error);
    return { success: false, error: error.message };
  }
};

async function backupData() {
  const collections = ['goals', 'knowledge_items', 'review_cards', 'chats', 'messages', 'news_items', 'output_docs', 'scraps'];
  const backupData = {};
  
  for (const coll of collections) {
    const result = await db.collection(coll).get();
    backupData[coll] = result.data;
  }
  
  return {
    success: true,
    message: '备份成功',
    data: backupData
  };
}

async function cleanupData() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  await db.collection('news_items')
    .where({ createdAt: { $lt: thirtyDaysAgo } })
    .remove();
  
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  await db.collection('review_history')
    .where({ reviewedAt: { $lt: oneYearAgo } })
    .remove();
  
  return {
    success: true,
    message: '数据清理完成'
  };
}