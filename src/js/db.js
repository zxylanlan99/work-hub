/**
 * StudyMind 数据服务层
 * 封装全部 CloudBase SDK 调用，对应 20-整合接口文档-v1.0 的 87 个逻辑接口
 * 版本: v1.0 | 日期: 2026-06-16
 */

/* ================================================================
   一、核心数据库服务 (基于 cloudbase.js 的基础函数)
   ================================================================ */

const DB = {
  /* ---------- 通用查询助手 ---------- */

  /** 获取集合引用 */
  _collection(name) {
    if (!db) throw new Error('CloudBase 未初始化, 请先调用 initCloudbase()');
    return db.collection(name);
  },

  /** 安全执行查询, 统一返回 {success, data, error} */
  async _exec(promise) {
    const startTime = Date.now();
    try {
      const result = await promise;
      const duration = Date.now() - startTime;
      console.log(`[DB] ✅ 查询成功 (${duration}ms):`, { dataCount: (result.data || result).length || 0 });
      return { success: true, data: result.data || result };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DB] ❌ 查询失败 (${duration}ms):`, error);
      return { success: false, error: error.message || error, data: [] };
    }
  },

  /* ---------- 高级查询方法 ---------- */

  /** 分页查询 */
  async _paginate(collection, where = {}, orderBy = null, page = 1, pageSize = 20) {
    const coll = this._collection(collection);
    let query = coll.where(where);
    if (orderBy) {
      query = query.orderBy(orderBy.field, orderBy.direction || 'desc');
    }
    const skip = (page - 1) * pageSize;
    const countResult = await query.count();
    const { data } = await query.skip(skip).limit(pageSize).get();
    return {
      success: true,
      data,
      total: countResult.total,
      page,
      pageSize,
      hasMore: skip + data.length < countResult.total
    };
  },

  /** 聚合统计 */
  async _count(collection, where = {}) {
    const countResult = await this._collection(collection).where(where).count();
    return countResult.total;
  },

  /** 批量添加 */
  async _batchAdd(collection, docs) {
    const coll = this._collection(collection);
    const results = [];
    for (const doc of docs) {
      const r = await coll.add(doc);
      results.push(r);
    }
    return { success: true, data: results };
  },

  /** 批量更新 */
  async _batchUpdate(collection, ids, update) {
    const coll = this._collection(collection);
    const results = [];
    for (const id of ids) {
      const r = await coll.doc(id).update(update);
      results.push(r);
    }
    return { success: true, data: results };
  },

  /** 批量删除 */
  async _batchDelete(collection, ids) {
    const coll = this._collection(collection);
    const results = [];
    for (const id of ids) {
      const r = await coll.doc(id).remove();
      results.push(r);
    }
    return { success: true, data: results };
  },

  /* ================================================================
     二、AI 调用代理
     ================================================================ */

  /**
   * 根据 action 类型构建用户消息（非 chat action 的消息构建）
   * 对引用 DB 实体的参数（goalId/itemId/newsId/docId），尝试从 DB 获取数据
   */
  async _buildMessagesForAction(data) {
    const { action, description, topic, goalId, cardIds, weakTopics, itemId, newsId, docId, section, content } = data;

    switch (action) {
      case 'goal-create':
        return [{ role: 'user', content: '请为以下学习目标制定学习计划，拆解为里程碑和任务：\n\n' + (description || '请制定一个学习计划') }];

      case 'quiz':
        return [{ role: 'user', content: '请出一道关于「' + (topic || '学习') + '」的知识检测题，包含问题和答案。' }];

      case 'goal-diagnosis':
      case 'time-estimate':
      case 'goal-summary': {
        let goalInfo = '';
        if (goalId) {
          try {
            const goalRes = await this._exec(this._collection('goals').doc(goalId).get());
            const goal = goalRes.data && goalRes.data[0];
            if (goal) {
              goalInfo = '标题：' + goal.title + '\n描述：' + (goal.description || '无') + '\n状态：' + (goal.status || '未知');
            }
          } catch (e) { /* 忽略 DB 错误 */ }
        }
        const task = action === 'goal-diagnosis' ? '诊断报告' : (action === 'time-estimate' ? '时间预估(P70)' : '学习总结');
        return [{ role: 'user', content: '请生成学习目标的' + task + '。\n' + (goalInfo || '（无目标数据，请给出通用建议）') }];
      }

      case 'serial-test': {
        let cardInfo = '';
        if (cardIds && Array.isArray(cardIds) && cardIds.length > 0) {
          try {
            const cardPromises = cardIds.map(id => this._exec(this._collection('review_cards').doc(id).get()));
            const cardResults = await Promise.all(cardPromises);
            const cards = cardResults.map(r => r.data && r.data[0]).filter(Boolean);
            if (cards.length > 0) {
              cardInfo = cards.map((c, i) => '卡片' + (i + 1) + '：\n问题：' + (c.question || '无') + '\n答案：' + (c.answer || '无')).join('\n\n');
            }
          } catch (e) { /* 忽略 */ }
        }
        return [{ role: 'user', content: '请根据以下复习卡片生成一道综合性的串联测试题，考察知识点之间的关联：\n\n' + (cardInfo || '（无卡片数据，请生成通用串联测试题）') }];
      }

      case 'improvement-plan':
        return [{ role: 'user', content: '以下是我掌握度偏低的主题，请生成有针对性的补强学习计划：\n' + (Array.isArray(weakTopics) ? weakTopics.join('、') : (weakTopics || '通用学习')) }];

      case 'all-improvement-plans':
        return [{ role: 'user', content: '请分析我所有的薄弱知识点，批量生成补强计划。' }];

      case 'process-orphaned':
        return [{ role: 'user', content: '请分析知识库中的孤岛知识（未分类或无关联的知识条目），给出分类和关联建议。' }];

      case 'health-report':
        return [{ role: 'user', content: '请分析知识库的整体健康状况，包括分类覆盖度、知识更新频率、关联密度等，给出健康报告。' }];

      case 'generate-cards': {
        let itemInfo = '';
        if (itemId) {
          try {
            const itemRes = await this._exec(this._collection('knowledge_items').doc(itemId).get());
            const item = itemRes.data && itemRes.data[0];
            if (item) {
              itemInfo = '标题：' + item.title + '\n内容：' + (item.content || '无') + '\n标签：' + ((item.tags || []).join('、') || '无');
            }
          } catch (e) { /* 忽略 */ }
        }
        return [{ role: 'user', content: '请根据以下知识条目生成 3-5 张复习卡片，每张包含问题和答案：\n' + (itemInfo || '（无具体条目，请生成通用复习卡片）') }];
      }

      case 'import-suggestions': {
        let newsInfo = '';
        if (newsId) {
          try {
            const newsRes = await this._exec(this._collection('news_items').doc(newsId).get());
            const news = newsRes.data && newsRes.data[0];
            if (news) {
              newsInfo = '标题：' + news.title + '\n摘要：' + (news.summary || '无') + '\n来源：' + (news.sourceUrl || '未知');
            }
          } catch (e) { /* 忽略 */ }
        }
        return [{ role: 'user', content: '请分析以下资讯是否值得入库，并给出分类和标签建议：\n' + (newsInfo || '（无资讯数据）') }];
      }

      case 'recommend-materials': {
        let docInfo = '';
        if (docId) {
          try {
            const docRes = await this._exec(this._collection('output_docs').doc(docId).get());
            const doc = docRes.data && docRes.data[0];
            if (doc) {
              docInfo = '文档标题：' + doc.title + '\n内容摘要：' + ((doc.content || '').substring(0, 500));
            }
          } catch (e) { /* 忽略 */ }
        }
        return [{ role: 'user', content: '请根据当前文档内容推荐相关知识条目作为参考素材：\n' + (docInfo || '（无文档数据）') }];
      }

      case 'expand':
        return [{ role: 'user', content: '请将以下内容扩写为详细的学习笔记：\n\n' + (section || content || '（无内容）') }];

      case 'refine':
        return [{ role: 'user', content: '请对以下内容进行润色优化，提升表达清晰度和可读性：\n\n' + (content || '（无内容）') }];

      case 'outline':
        return [{ role: 'user', content: '请为以下主题生成结构化的文章大纲：\n\n' + (topic || '（无主题）') }];

      case 'review': {
        let docInfo = '';
        if (docId) {
          try {
            const docRes = await this._exec(this._collection('output_docs').doc(docId).get());
            const doc = docRes.data && docRes.data[0];
            if (doc) {
              docInfo = '标题：' + doc.title + '\n内容：' + (doc.content || '无');
            }
          } catch (e) { /* 忽略 */ }
        }
        return [{ role: 'user', content: '请对以下文档进行质量评审，给出改进建议：\n' + (docInfo || '（无文档数据）') }];
      }

      default:
        return [{ role: 'user', content: description || topic || content || '请处理请求' }];
    }
  },

  /** 调用 AI — 优先使用客户端 AI 服务，回退到云函数 */
  async _aiProxy(data) {
    // 如果没有 messages，根据 action 构建用户消息
    if (!data.messages || !Array.isArray(data.messages) || data.messages.length === 0) {
      try {
        data.messages = await this._buildMessagesForAction(data);
        console.log('[DB] 📝 构建 AI 消息:', { action: data.action, msgCount: data.messages.length });
      } catch (e) {
        console.warn('[DB] 消息构建失败，使用默认消息:', e.message);
        data.messages = [{ role: 'user', content: data.description || data.topic || data.content || '请处理请求' }];
      }
    }

    // 优先使用客户端 AI 服务（直接调用 AI 提供商 API）
    if (window.AIService && typeof window.AIService.callAI === 'function') {
      console.log('[DB] 🤖 使用客户端 AI 服务调用:', data.action);
      try {
        const result = await window.AIService.callAI(data);
        if (result.success) {
          return result;
        }
        // 客户端 AI 失败，记录错误但继续尝试云函数回退
        console.warn('[DB] 客户端 AI 调用失败，尝试云函数回退:', result.error);
      } catch (e) {
        console.warn('[DB] 客户端 AI 异常，尝试云函数回退:', e.message);
      }
    }

    // 回退：尝试通过 CloudBase 云函数调用
    if (app) {
      try {
        const result = await app.callFunction({ name: 'ai-proxy', data });
        if (result && result.result) {
          return { success: true, ...result.result };
        }
        return { success: false, error: 'AI 响应为空' };
      } catch (error) {
        console.error('AI Proxy Error:', error);
        return { success: false, error: error.message || 'AI 调用失败' };
      }
    }

    // 最终回退：返回提示信息（不再返回 mock 数据）
    console.warn('[DB] AI 服务不可用 — 未配置模型且 CloudBase 未初始化');
    return {
      success: false,
      error: 'AI 服务未配置，请先在设置页面添加 AI 模型配置',
      content: ''
    };
  },

  /* ================================================================
     三、首页模块接口 (6 逻辑接口)
     ================================================================ */

  /** DB-R-001: 昨日学习回顾 */
  async getYesterdayReview() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);
    return this._exec(
      this._collection('review_history')
        .where({ reviewedAt: this._gte(yesterday) })
        .get()
    );
  },

  /** AI-001: 快问快答 */
  async getQuiz(topic) {
    return this._aiProxy({ action: 'quiz', topic });
  },

  /** AGG-001: 上次学习断点 */
  async getLastBreakpoint() {
    const [goals, reviewCards, chats] = await Promise.all([
      this._exec(this._collection('goals').where({ status: 'active' }).orderBy('updatedAt', 'desc').limit(1).get()),
      this._exec(this._collection('review_cards').orderBy('lastReviewAt', 'desc').limit(1).get()),
      this._exec(this._collection('chats').orderBy('updatedAt', 'desc').limit(1).get())
    ]);
    return { success: true, data: { goals: goals.data, reviewCards: reviewCards.data, chats: chats.data } };
  },

  /** AGG-002: 学习计划统计 */
  async getPlanStats() {
    const [active, paused, completed] = await Promise.all([
      this._count('goals', { status: 'active' }),
      this._count('goals', { status: 'paused' }),
      this._count('goals', { status: 'completed' })
    ]);
    return { success: true, data: { active, paused, completed, total: active + paused + completed } };
  },

  /** AGG-003: 今日复习统计 */
  async getTodayReviewStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const count = await this._count('review_cards', { nextReview: this._lte(today) });
    return { success: true, data: { dueToday: count } };
  },

  /** AGG-004: 资讯统计 */
  async getNewsStats() {
    const [unread, total] = await Promise.all([
      this._count('news_items', { hasRead: false }),
      this._count('news_items', {})
    ]);
    return { success: true, data: { unread, total } };
  },

  /** AGG-005: 知识沉淀统计 */
  async getKnowledgeOutputStats() {
    const [drafts, published] = await Promise.all([
      this._count('output_docs', { status: 'draft' }),
      this._count('output_docs', { status: 'published' })
    ]);
    return { success: true, data: { drafts, published, total: drafts + published } };
  },

  /** DB-R-002: 学习热力图 */
  async getStudyHeatmap(startDate) {
    return this._exec(
      this._collection('review_history')
        .where({ reviewedAt: this._gte(new Date(startDate)) })
        .get()
    );
  },

  /** AGG-006: 本周学习统计 */
  async getWeeklyStudyStats() {
    const monday = new Date();
    monday.setDate(monday.getDate() - monday.getDay() + 1);
    monday.setHours(0, 0, 0, 0);
    const [history, cards] = await Promise.all([
      this._exec(this._collection('review_history').where({ reviewedAt: this._gte(monday) }).get()),
      this._exec(this._collection('review_cards').where({}).get())
    ]);
    return { success: true, data: { history: history.data, cards: cards.data } };
  },

  /* ================================================================
     四、学习计划模块接口 (13 逻辑接口)
     ================================================================ */

  /** DB-R-003: 目标列表 */
  async getGoals(status) {
    const where = {};
    if (status && status !== 'all') where.status = status;
    console.log('[DB] 📡 getGoals 查询条件:', where);
    const result = await this._exec(
      this._collection('goals').where(where).orderBy('createdAt', 'desc').get()
    );
    console.log('[DB] 📊 getGoals 返回:', { count: result.data.length, data: result.data });
    return result;
  },

  /** DB-R-004: 目标详情 (含关联里程碑/任务) */
  async getGoalDetail(goalId) {
    console.log('[DB] 📡 getGoalDetail 查询:', { goalId });
    const [goalResult, milestones, tasks] = await Promise.all([
      this._exec(this._collection('goals').doc(goalId).get()),
      this._exec(this._collection('milestones').where({ goalId }).orderBy('sort', 'asc').get()),
      this._exec(this._collection('tasks').where({ goalId }).orderBy('sort', 'asc').get())
    ]);
    const goalData = goalResult.data && goalResult.data.length > 0 ? goalResult.data[0] : null;
    if (!goalData) {
      console.log('[DB] ⚠️ 目标不存在:', goalId);
      return { success: false, error: '目标不存在', data: null };
    }
    console.log('[DB] 📊 getGoalDetail 返回:', { title: goalData.title, milestones: milestones.data.length, tasks: tasks.data.length });
    return { success: true, data: { ...goalData, milestones: milestones.data, tasks: tasks.data } };
  },

  /** DB-W-001: 创建目标 */
  async createGoal(data) {
    console.log('[DB] 📡 createGoal 写入:', { title: data.title });
    const result = await this._exec(
      this._collection('goals').add({
        title: data.title,
        description: data.description || '',
        domain: data.domain || '',
        weeklyHours: data.weeklyHours || '',
        currentLevel: data.currentLevel || '',
        deadline: data.deadline || null,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
    console.log('[DB] ✅ createGoal 返回:', result);
    return result;
  },

  /** DB-U-001: 更新目标 */
  async updateGoal(goalId, data) {
    return this._exec(
      this._collection('goals').doc(goalId).update({ ...data, updatedAt: new Date() })
    );
  },

  /** DB-D-001: 删除目标 (级联) */
  async deleteGoal(goalId) {
    const [milestones, tasks] = await Promise.all([
      this._exec(this._collection('milestones').where({ goalId }).get()),
      this._exec(this._collection('tasks').where({ goalId }).get())
    ]);
    for (const m of milestones.data) await this._collection('milestones').doc(m._id).remove();
    for (const t of tasks.data) await this._collection('tasks').doc(t._id).remove();
    return this._exec(this._collection('goals').doc(goalId).remove());
  },

  /** DB-U-002: 暂停目标 */
  async pauseGoal(goalId) {
    console.log('[DB] 📡 pauseGoal 更新:', { goalId, status: 'paused' });
    const result = await this._exec(
      this._collection('goals').doc(goalId).update({ status: 'paused', updatedAt: new Date() })
    );
    console.log('[DB] ✅ pauseGoal 返回:', result);
    return result;
  },

  /** DB-U-003: 恢复目标 */
  async resumeGoal(goalId) {
    console.log('[DB] 📡 resumeGoal 更新:', { goalId, status: 'active' });
    const result = await this._exec(
      this._collection('goals').doc(goalId).update({ status: 'active', updatedAt: new Date() })
    );
    console.log('[DB] ✅ resumeGoal 返回:', result);
    return result;
  },

  /** DB-U-004: 弹性排期 (复合操作) */
  async rescheduleGoal(goalId, options) {
    if (options.taskUpdates && options.taskUpdates.length > 0) {
      for (const update of options.taskUpdates) {
        var fields = { sort: update.sort, deadline: update.deadline, updatedAt: new Date() };
        if (update.status) fields.status = update.status;
        await this._collection('tasks').doc(update.taskId).update(fields);
      }
    }
    return this._exec(
      this._collection('goals').doc(goalId).update({ updatedAt: new Date() })
    );
  },

  /** AI-002: AI 创建目标 */
  async aiCreateGoal(description) {
    return this._aiProxy({ action: 'goal-create', description });
  },

  /** AI-003: AI 诊断 */
  async aiDiagnoseGoal(goalId) {
    return this._aiProxy({ action: 'goal-diagnosis', goalId });
  },

  /** AI-004: 耗时预测 */
  async aiEstimateTime(goalId) {
    return this._aiProxy({ action: 'time-estimate', goalId });
  },

  /** AI-005: 学习总结 */
  async aiGoalSummary(goalId) {
    return this._aiProxy({ action: 'goal-summary', goalId });
  },

  /** DB-W-002: 创建任务 */
  async createTask(data) {
    console.log('[DB] 📡 createTask 写入:', { title: data.title, goalId: data.goalId });
    const result = await this._exec(
      this._collection('tasks').add({
        goalId: data.goalId,
        milestoneId: data.milestoneId,
        title: data.title,
        description: data.description || '',
        deadline: data.deadline || null,
        estimatedTime: data.estimatedTime || 0,
        priority: data.priority || 'mid',
        aiType: data.aiType || '',
        status: 'pending',
        sort: data.sort || 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
    console.log('[DB] ✅ createTask 返回:', result);
    return result;
  },

  /** DB-U-005: 更新任务 */
  async updateTask(taskId, data) {
    return this._exec(
      this._collection('tasks').doc(taskId).update({ ...data, updatedAt: new Date() })
    );
  },

  /** DB-U-006: 完成任务 */
  async completeTask(taskId) {
    console.log('[DB] 📡 completeTask 更新:', { taskId, status: 'completed' });
    const result = await this._exec(
      this._collection('tasks').doc(taskId).update({ status: 'completed', updatedAt: new Date() })
    );
    console.log('[DB] ✅ completeTask 返回:', result);
    return result;
  },

  /* ---------- 里程碑操作 (无编号, 2.2.2 节) ---------- */

  /** 查询某目标下全部里程碑 */
  async getMilestones(goalId) {
    return this._exec(
      this._collection('milestones').where({ goalId }).orderBy('sort', 'asc').get()
    );
  },

  /** 创建里程碑 */
  async createMilestone(data) {
    return this._exec(
      this._collection('milestones').add({
        goalId: data.goalId,
        title: data.title,
        status: 'pending',
        sort: data.sort || 0,
        createdAt: new Date()
      })
    );
  },

  /** 更新里程碑排序 */
  async updateMilestoneSort(id, sort) {
    return this._exec(this._collection('milestones').doc(id).update({ sort }));
  },

  /** 删除里程碑 (级联删除任务) */
  async deleteMilestone(id) {
    const tasks = await this._exec(this._collection('tasks').where({ milestoneId: id }).get());
    for (const t of tasks.data) await this._collection('tasks').doc(t._id).remove();
    return this._exec(this._collection('milestones').doc(id).remove());
  },

  /* ================================================================
     五、复习计划模块接口 (14 逻辑接口)
     ================================================================ */

  /** DB-R-005: 逾期提醒 */
  async getOverdueCards() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this._exec(
      this._collection('review_cards').where({ nextReview: this._lt(today) }).get()
    );
  },

  /** DB-R-006: 遗忘风险 */
  async getRiskCards() {
    return this._exec(
      this._collection('review_cards').where({ mastery: this._lte(0.3) }).get()
    );
  },

  /** DB-R-007: 复习队列 */
  async getReviewQueue() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return this._exec(
      this._collection('review_cards').where({ nextReview: this._lte(today) }).orderBy('mastery', 'asc').get()
    );
  },

  /** DB-R-008: 复习卡片详情 */
  async getReviewCardDetail(cardId) {
    return this._exec(this._collection('review_cards').doc(cardId).get());
  },

  /** DB-U-007: 复习评分 (SM-2 算法) */
  async submitReviewScore(cardId, quality) {
    const card = await this._collection('review_cards').doc(cardId).get();
    const c = card.data[0];
    if (!c) return { success: false, error: '卡片不存在' };
    const { interval, mastery, nextReview } = this._sm2(c, quality);
    await Promise.all([
      this._collection('review_cards').doc(cardId).update({ interval, mastery, nextReview, lastReviewAt: new Date(), updatedAt: new Date() }),
      this._collection('review_history').add({ cardId, quality, interval, mastery, reviewedAt: new Date() })
    ]);
    return { success: true, data: { interval, mastery, nextReview } };
  },

  /** SM-2 算法 */
  _sm2(card, quality) {
    let { interval = 1, mastery = 0.3, easeFactor = 2.5 } = card;
    if (quality >= 3) {
      if (interval === 1) interval = 1;
      else if (interval === 2) interval = 6;
      else interval = Math.round(interval * easeFactor);
      mastery = Math.min(1, mastery + (quality - 3) * 0.15);
      easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    } else {
      interval = 1;
      mastery = Math.max(0, mastery - 0.1);
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    }
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);
    return { interval, mastery, easeFactor, nextReview };
  },

  /** DB-U-008: 开始复习 */
  async startReviewCard(cardId) {
    return this._exec(
      this._collection('review_cards').doc(cardId).update({ lastReviewAt: new Date(), updatedAt: new Date() })
    );
  },

  /** DB-U-009: 加入队列 */
  async enqueueCard(cardId) {
    return this._exec(
      this._collection('review_cards').doc(cardId).update({ nextReview: new Date(), updatedAt: new Date() })
    );
  },

  /** DB-R-009: 掌握度历史 */
  async getMasteryHistory(cardId) {
    return this._exec(
      this._collection('review_history').where({ cardId }).orderBy('reviewedAt', 'desc').get()
    );
  },

  /** DB-R-010: 关联卡片 */
  async getRelatedCards(knowledgeId) {
    return this._exec(
      this._collection('review_cards').where({ knowledgeId }).get()
    );
  },

  /** DB-U-010: 批量加入队列 */
  async batchEnqueueCards(cardIds) {
    const results = [];
    for (const id of cardIds) {
      const r = await this._collection('review_cards').doc(id).update({ nextReview: new Date(), updatedAt: new Date() });
      results.push(r);
    }
    return { success: true, data: results };
  },

  /** DB-R-012: 复习历史 */
  async getReviewHistory(startDate, endDate) {
    const where = {};
    if (startDate && endDate) {
      where.reviewedAt = this._between(startDate, endDate);
    }
    return this._exec(
      this._collection('review_history').where(where).orderBy('reviewedAt', 'desc').get()
    );
  },

  /** DB-R-013: 历史详情 */
  async getReviewHistoryDetail(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return this._exec(
      this._collection('review_history').where({ reviewedAt: this._between(start, end) }).get()
    );
  },

  /** DB-R-014: 复习热力图 */
  async getReviewHeatmap(startDate) {
    return this._exec(
      this._collection('review_history').where({ reviewedAt: this._gte(new Date(startDate)) }).get()
    );
  },

  /** AGG-007: 复习统计 */
  async getReviewStats() {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const [total, due, mastered, risk] = await Promise.all([
      this._count('review_cards', {}),
      this._count('review_cards', { nextReview: this._lte(today) }),
      this._count('review_cards', { mastery: this._gte(0.8) }),
      this._count('review_cards', { mastery: this._lte(0.3) })
    ]);
    return { success: true, data: { total, due, mastered, risk } };
  },

  /** AGG-008: 串联复习建议 */
  async getSerialReviewSuggestions() {
    const [cards, items] = await Promise.all([
      this._exec(this._collection('review_cards').where({}).get()),
      this._exec(this._collection('knowledge_items').where({ isDeleted: false }).get())
    ]);
    return { success: true, data: { cards: cards.data, items: items.data } };
  },

  /** AGG-009: 串联选项 */
  async getSerialOptions() {
    return this._exec(this._collection('review_cards').where({}).get());
  },

  /** AGG-010: 复习统计详情 */
  async getReviewStatsDetail() {
    const [cards, history] = await Promise.all([
      this._exec(this._collection('review_cards').where({}).get()),
      this._exec(this._collection('review_history').where({}).orderBy('reviewedAt', 'desc').limit(100).get())
    ]);
    return { success: true, data: { cards: cards.data, history: history.data } };
  },

  /** AI-006: 串联测试 */
  async aiSerialTest(cardIds) {
    return this._aiProxy({ action: 'serial-test', cardIds });
  },

  /** AI-007: 补强计划 */
  async aiImprovementPlan(weakTopics) {
    return this._aiProxy({ action: 'improvement-plan', weakTopics });
  },

  /** AI-008: 全部补强计划 */
  async aiAllImprovementPlans() {
    return this._aiProxy({ action: 'all-improvement-plans' });
  },

  /* ---------- 复习卡片创建 (无编号) ---------- */
  async createReviewCard(data) {
    return this._exec(
      this._collection('review_cards').add({
        question: data.question,
        answer: data.answer,
        questionType: data.questionType || 'choice',
        knowledgeId: data.knowledgeId || '',
        mastery: 1.0,
        interval: 1,
        nextReview: new Date(),
        lastQuality: null,
        reviewCount: 0,
        lastReviewAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
  },

  /* ---------- 复习记录写入 (无编号) ---------- */
  async addReviewHistory(data) {
    return this._exec(
      this._collection('review_history').add({
        cardId: data.cardId,
        quality: data.quality,
        interval: data.interval,
        mastery: data.mastery,
        reviewedAt: new Date()
      })
    );
  },

  /* ================================================================
     六、知识库模块接口 (25 逻辑接口)
     ================================================================ */

  /** DB-R-015: 分类树 */
  async getCategories() {
    return this._exec(this._collection('categories').orderBy('sort', 'asc').get());
  },

  /** DB-R-016: 搜索分类 */
  async searchCategories(keyword) {
    return this._exec(
      this._collection('categories').where({ name: db.RegExp({ regexp: keyword, options: 'i' }) }).get()
    );
  },

  /** DB-W-003: 创建分类 */
  async createCategory(data) {
    return this._exec(
      this._collection('categories').add({
        name: data.name,
        parentId: data.parentId || '',
        color: data.color || '',
        sort: data.sort || 0,
        createdAt: new Date()
      })
    );
  },

  /** DB-U-011: 更新分类 */
  async updateCategory(categoryId, data) {
    return this._exec(
      this._collection('categories').doc(categoryId).update({ ...data, updatedAt: new Date() })
    );
  },

  /** DB-U-012: 移动分类 */
  async moveCategory(categoryId, parentId) {
    return this._exec(
      this._collection('categories').doc(categoryId).update({ parentId, updatedAt: new Date() })
    );
  },

  /** DB-U-013: 排序分类 */
  async sortCategories(sortData) {
    for (const item of sortData) {
      await this._collection('categories').doc(item.id).update({ sort: item.sort });
    }
    return { success: true };
  },

  /** DB-D-002: 删除分类 (安全) */
  async deleteCategory(categoryId) {
    await this._exec(this._collection('knowledge_items').where({ categoryId }).update({ categoryId: '' }));
    return this._exec(this._collection('categories').doc(categoryId).remove());
  },

  /** DB-R-017: 知识条目列表 */
  async getKnowledgeItems(categoryId, page = 1, pageSize = 20) {
    const where = { isDeleted: false };
    if (categoryId) where.categoryId = categoryId;
    return this._paginate('knowledge_items', where, { field: 'updatedAt', direction: 'desc' }, page, pageSize);
  },

  /** DB-R-018: 知识条目详情 */
  async getKnowledgeItemDetail(itemId) {
    const [item, cards] = await Promise.all([
      this._exec(this._collection('knowledge_items').doc(itemId).get()),
      this._exec(this._collection('review_cards').where({ knowledgeId: itemId }).get())
    ]);
    const itemData = item.data && item.data.length > 0 ? item.data[0] : null;
    if (!itemData) return { success: false, error: '条目不存在', data: null };
    return { success: true, data: { ...itemData, reviewCards: cards.data } };
  },

  /** DB-W-004: 创建知识条目 */
  async createKnowledgeItem(data) {
    return this._exec(
      this._collection('knowledge_items').add({
        title: data.title,
        content: data.content || '',
        summary: data.summary || '',
        categoryId: data.categoryId || '',
        tags: data.tags || [],
        sourceUrl: data.sourceUrl || '',
        sourceType: data.sourceType || 'manual',
        level: data.level || 'public',
        isDeleted: false,
        deletedAt: null,
        readAt: null,
        readProgress: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
  },

  /** DB-U-014: 更新知识条目 */
  async updateKnowledgeItem(itemId, data) {
    return this._exec(
      this._collection('knowledge_items').doc(itemId).update({ ...data, updatedAt: new Date() })
    );
  },

  /** DB-D-003: 删除知识条目 (软删除) */
  async softDeleteKnowledgeItem(itemId) {
    return this._exec(
      this._collection('knowledge_items').doc(itemId).update({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
    );
  },

  /** DB-D-004: 永久删除 */
  async permanentDeleteKnowledgeItem(itemId) {
    return this._exec(this._collection('knowledge_items').doc(itemId).remove());
  },

  /** DB-R-019: 搜索知识 */
  async searchKnowledge(keyword, page = 1, pageSize = 20) {
    try {
      const where = { isDeleted: false, title: db.RegExp({ regexp: keyword, options: 'i' }) };
      return this._paginate('knowledge_items', where, { field: 'updatedAt', direction: 'desc' }, page, pageSize);
    } catch {
      return this._paginate('knowledge_items', { isDeleted: false }, { field: 'updatedAt', direction: 'desc' }, page, pageSize);
    }
  },

  /** DB-R-020: AI 推荐清单 */
  async getAIRecommendedItems() {
    return this._exec(
      this._collection('knowledge_items').where({ isDeleted: false }).orderBy('createdAt', 'desc').limit(20).get()
    );
  },

  /** DB-R-021: 过期条目 */
  async getExpiredItems() {
    const expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() - 3);
    return this._exec(
      this._collection('knowledge_items').where({ isDeleted: false, updatedAt: this._lte(expireDate) }).get()
    );
  },

  /** DB-R-022: 回收站 */
  async getTrashItems() {
    return this._exec(
      this._collection('knowledge_items').where({ isDeleted: true }).get()
    );
  },

  /** DB-U-015: 恢复条目 */
  async restoreKnowledgeItem(itemId) {
    return this._exec(
      this._collection('knowledge_items').doc(itemId).update({ isDeleted: false, updatedAt: new Date() })
    );
  },

  /** DB-U-017: 归档知识 */
  async archiveKnowledge(itemId) {
    return this._exec(
      this._collection('knowledge_items').doc(itemId).update({ level: 'secret', updatedAt: new Date() })
    );
  },

  /** DB-U-018: 暂缓入库 */
  async delayKnowledge(itemId) {
    return this._exec(
      this._collection('knowledge_items').doc(itemId).update({ updatedAt: new Date() })
    );
  },

  /** DB-U-019: 关联知识 */
  async linkKnowledge(itemId, relatedIds) {
    return this._exec(
      this._collection('knowledge_items').doc(itemId).update({ tags: relatedIds, updatedAt: new Date() })
    );
  },

  /** DB-R-023: 导出 Markdown */
  async exportKnowledgeMarkdown(itemId) {
    const result = await this._exec(this._collection('knowledge_items').doc(itemId).get());
    const item = result.data && result.data.length > 0 ? result.data[0] : null;
    if (!item) return { success: false, error: '条目不存在' };
    let md = `# ${item.title}\n\n`;
    if (item.summary) md += `> ${item.summary}\n\n`;
    md += item.content || '';
    return { success: true, data: md };
  },

  /** DB-U-020: 批量移动分类 */
  async batchMoveCategory(itemIds, categoryId) {
    return this._batchUpdate('knowledge_items', itemIds, { categoryId, updatedAt: new Date() });
  },

  /** DB-U-021: 批量恢复 */
  async batchRestoreItems(itemIds) {
    return this._batchUpdate('knowledge_items', itemIds, { isDeleted: false, updatedAt: new Date() });
  },

  /** DB-D-005: 批量删除 */
  async batchSoftDeleteItems(itemIds) {
    return this._batchUpdate('knowledge_items', itemIds, { isDeleted: true, updatedAt: new Date() });
  },

  /** DB-D-006: 清空回收站 */
  async emptyTrash() {
    const result = await this._exec(this._collection('knowledge_items').where({ isDeleted: true }).get());
    for (const item of result.data) {
      await this._collection('knowledge_items').doc(item._id).remove();
    }
    return { success: true };
  },

  /** DB-U-022: 批量入库 */
  async batchImportItems(itemIds) {
    return this._batchUpdate('knowledge_items', itemIds, { isDeleted: false, updatedAt: new Date() });
  },

  /** DB-U-023: 批量忽略 */
  async batchIgnoreItems(itemIds) {
    return this._batchUpdate('knowledge_items', itemIds, { level: 'secret', updatedAt: new Date() });
  },

  /** DB-U-024: 合并知识条目 */
  async mergeKnowledgeItems(sourceIds, targetData) {
    const items = [];
    for (const id of sourceIds) {
      const r = await this._collection('knowledge_items').doc(id).get();
      if (r.data && r.data.length > 0) items.push(r.data[0]);
    }
    const mergedContent = items.map(i => i.content).join('\n\n---\n\n');
    const newItem = await this._collection('knowledge_items').add({
      title: targetData.title, content: mergedContent, isDeleted: false,
      level: 'public', tags: [], createdAt: new Date(), updatedAt: new Date()
    });
    for (const id of sourceIds) {
      await this._collection('knowledge_items').doc(id).remove();
    }
    return { success: true, data: { id: newItem.id } };
  },

  /** AGG-011: 条目统计 */
  async getKnowledgeStats() {
    const [itemCount, categoryCount] = await Promise.all([
      this._count('knowledge_items', { isDeleted: false }),
      this._count('categories', {})
    ]);
    return { success: true, data: { itemCount, categoryCount } };
  },

  /** AGG-012: 知识体检 */
  async getKnowledgeHealth() {
    const [items, categories, cards] = await Promise.all([
      this._exec(this._collection('knowledge_items').where({ isDeleted: false }).get()),
      this._exec(this._collection('categories').where({}).get()),
      this._exec(this._collection('review_cards').where({}).get())
    ]);
    return { success: true, data: { items: items.data, categories: categories.data, cards: cards.data } };
  },

  /** AI-009: 孤岛知识处理 */
  async aiProcessOrphaned() {
    return this._aiProxy({ action: 'process-orphaned' });
  },

  /** AI-010: 体检报告 */
  async aiHealthReport() {
    return this._aiProxy({ action: 'health-report' });
  },

  /** AI-011: 生成复习卡片 */
  async aiGenerateReviewCards(itemId) {
    const aiResult = await this._aiProxy({ action: 'generate-cards', itemId });
    return aiResult;
  },

  /** DB-W-006: 加入学习计划 */
  async addToStudyPlan(data) {
    const goal = await this._collection('goals').add({
      title: data.title, description: data.description || '', status: 'active',
      createdAt: new Date(), updatedAt: new Date()
    });
    if (data.taskTitle) {
      await this._collection('tasks').add({
        goalId: goal.id, title: data.taskTitle, status: 'pending',
        createdAt: new Date(), updatedAt: new Date()
      });
    }
    return { success: true, data: { goalId: goal.id } };
  },

  /* ================================================================
     七、AI 对话模块接口 (8 逻辑接口)
     ================================================================ */

  /** DB-R-024: 对话列表 */
  async getChats(page = 1, pageSize = 20) {
    return this._paginate('chats', {}, { field: 'createdAt', direction: 'desc' }, page, pageSize);
  },

  /** DB-W-007: 创建对话 */
  async createChat(data) {
    return this._exec(
      this._collection('chats').add({
        title: data.title || '新对话',
        model: data.model || 'mimo',
        knowledgeId: data.knowledgeId || null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
  },

  /** DB-U-025: 更新对话 */
  async updateChat(chatId, data) {
    return this._exec(
      this._collection('chats').doc(chatId).update({ ...data, updatedAt: new Date() })
    );
  },

  /** DB-D-007: 删除对话 (级联) */
  async deleteChat(chatId) {
    const messages = await this._exec(this._collection('messages').where({ chatId }).get());
    for (const m of messages.data) {
      await this._collection('messages').doc(m._id).remove();
    }
    return this._exec(this._collection('chats').doc(chatId).remove());
  },

  /** DB-R-025: 消息列表 */
  async getMessages(chatId) {
    return this._exec(
      this._collection('messages').where({ chatId }).orderBy('createdAt', 'asc').get()
    );
  },

  /** AI-012: 发送消息并获取 AI 回复 */
  async sendMessageAndReply(chatId, content, model = 'mimo') {
    await this._collection('messages').add({
      chatId, role: 'user', content, model: null, tokens: 0, cost: 0, isStarred: false, createdAt: new Date()
    });
    const aiResult = await this._aiProxy({
      action: 'chat', messages: [{ role: 'user', content }], model
    });
    const reply = aiResult.success ? aiResult.content : '抱歉,AI 暂时无法回复';
    await this._collection('messages').add({
      chatId, role: 'assistant', content: reply, model, tokens: aiResult.tokens || 0, cost: aiResult.cost || 0, isStarred: false, createdAt: new Date()
    });
    await this._collection('chats').doc(chatId).update({ updatedAt: new Date() });
    return { success: true, data: { reply } };
  },

  /** DB-U-026: 收藏消息 */
  async starMessage(messageId) {
    return this._exec(
      this._collection('messages').doc(messageId).update({ isStarred: true, updatedAt: new Date() })
    );
  },

  /** DB-U-027: 取消收藏 */
  async unstarMessage(messageId) {
    return this._exec(
      this._collection('messages').doc(messageId).update({ isStarred: false, updatedAt: new Date() })
    );
  },

  /** DB-W-008: 消息转知识 */
  async messageToKnowledge(messageId) {
    const result = await this._exec(this._collection('messages').doc(messageId).get());
    const msg = result.data && result.data.length > 0 ? result.data[0] : null;
    if (!msg) return { success: false, error: '消息不存在' };
    return this._exec(
      this._collection('knowledge_items').add({
        title: msg.content.substring(0, 50),
        content: msg.content,
        sourceType: 'chat',
        isDeleted: false,
        level: 'public',
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
  },

  /** AI-013: 对比模式 */
  async aiCompare(models, message) {
    const results = await Promise.all(
      models.map(model => this._aiProxy({ action: 'compare', messages: [{ role: 'user', content: message }], model }))
    );
    return { success: true, data: results };
  },

  /** DB-U-028: 采纳回答 */
  async adoptAnswer(messageId) {
    return this._exec(
      this._collection('messages').doc(messageId).update({ adopted: true, updatedAt: new Date() })
    );
  },

  /** DB-W-009: 合并对比回答 */
  async mergeCompareAnswers(chatId, mergedContent) {
    return this._exec(
      this._collection('messages').add({
        chatId, role: 'assistant', content: mergedContent, createdAt: new Date()
      })
    );
  },

  /** CONST-001: 可用模型列表 — 从 AI 服务获取用户配置的模型 */
  getAvailableModels() {
    if (window.AIService && typeof window.AIService.getAvailableModels === 'function') {
      const models = window.AIService.getAvailableModels();
      if (models.length > 0) return models;
    }
    // 回退：返回空数组，UI 层会提示用户去设置页面配置
    return [];
  },

  /* ================================================================
     八、资讯模块接口 (13 逻辑接口)
     ================================================================ */

  /** DB-R-027: 推荐资讯 (未读列表) */
  async getRecommendedNews() {
    return this._exec(
      this._collection('news_items').where({ hasRead: false }).orderBy('createdAt', 'desc').get()
    );
  },

  /** DB-R-028: 资讯历史 */
  async getNewsHistory() {
    return this._exec(
      this._collection('news_items').where({ isSaved: true }).orderBy('createdAt', 'desc').get()
    );
  },

  /** DB-R-029: 资讯预览 */
  async getNewsPreview(newsId) {
    return this._exec(this._collection('news_items').doc(newsId).get());
  },

  /** AGG-014: 资讯统计 */
  async getNewsOverviewStats() {
    const [unread, total, saved] = await Promise.all([
      this._count('news_items', { hasRead: false }),
      this._count('news_items', {}),
      this._count('news_items', { isSaved: true })
    ]);
    return { success: true, data: { unread, total, saved } };
  },

  /** AGG-015: 资讯统计详情 */
  async getNewsStatsDetail() {
    const [news, knowledge] = await Promise.all([
      this._exec(this._collection('news_items').where({}).get()),
      this._exec(this._collection('knowledge_items').where({ isDeleted: false }).get())
    ]);
    return { success: true, data: { news: news.data, knowledge: knowledge.data } };
  },

  /** AGG-016: 转化统计 */
  async getConversionStats() {
    const [news, knowledge, docs] = await Promise.all([
      this._exec(this._collection('news_items').where({}).get()),
      this._exec(this._collection('knowledge_items').where({ isDeleted: false }).get()),
      this._exec(this._collection('output_docs').where({}).get())
    ]);
    return { success: true, data: { news: news.data, knowledge: knowledge.data, docs: docs.data } };
  },

  /** AGG-017: 趋势数据 */
  async getNewsTrendData() {
    return this._exec(
      this._collection('news_items').where({}).orderBy('createdAt', 'desc').limit(100).get()
    );
  },

  /** AGG-018: 来源排行 */
  async getNewsSourceRanking() {
    const result = await this._exec(this._collection('news_items').where({}).get());
    const ranking = {};
    for (const item of result.data) {
      const source = item.sourceName || '未知来源';
      ranking[source] = (ranking[source] || 0) + 1;
    }
    return { success: true, data: ranking };
  },

  /** AGG-019: 热门标签 */
  async getNewsHotTags() {
    const result = await this._exec(this._collection('news_items').where({}).get());
    const tags = {};
    for (const item of result.data) {
      if (item.tags && Array.isArray(item.tags)) {
        for (const tag of item.tags) {
          tags[tag] = (tags[tag] || 0) + 1;
        }
      }
    }
    return { success: true, data: tags };
  },

  /** AI-014: 入库建议 */
  async aiImportSuggestions(newsId) {
    return this._aiProxy({ action: 'import-suggestions', newsId });
  },

  /** DB-U-029: 入库资讯 */
  async importNewsToKnowledge(newsId) {
    const newsResult = await this._exec(this._collection('news_items').doc(newsId).get());
    const news = newsResult.data && newsResult.data.length > 0 ? newsResult.data[0] : null;
    if (!news) return { success: false, error: '资讯不存在' };
    const knowledgeResult = await this._collection('knowledge_items').add({
      title: news.title, content: news.summary || '', sourceUrl: news.sourceUrl || '',
      sourceType: 'news', isDeleted: false, level: 'public', tags: news.tags || [],
      createdAt: new Date(), updatedAt: new Date()
    });
    await this._collection('news_items').doc(newsId).update({ isSaved: true, knowledgeId: knowledgeResult.id });
    return { success: true };
  },

  /** DB-U-030: 忽略资讯 */
  async ignoreNews(newsId) {
    return this._exec(
      this._collection('news_items').doc(newsId).update({ hasRead: true })
    );
  },

  /** DB-W-010: 手动录入资讯 */
  async addManualNews(data) {
    return this._exec(
      this._collection('news_items').add({
        title: data.title,
        sourceUrl: data.sourceUrl || '',
        sourceName: data.sourceName || '',
        category: data.category || '',
        tags: data.tags || [],
        summary: data.summary || '',
        importance: data.importance || 0,
        hasRead: false,
        isSaved: false,
        knowledgeId: null,
        publishedAt: null,
        createdAt: new Date()
      })
    );
  },

  /** DB-U-031: 批量入库资讯 */
  async batchImportNews(newsIds) {
    for (const id of newsIds) {
      await this.importNewsToKnowledge(id);
    }
    return { success: true };
  },

  /** DB-U-032: 批量忽略资讯 */
  async batchIgnoreNews(newsIds) {
    return this._batchUpdate('news_items', newsIds, { hasRead: true });
  },

  /** DB-U-033: 批量暂缓资讯 */
  async batchDelayNews(newsIds, delayedUntil) {
    return this._batchUpdate('news_items', newsIds, { delayedUntil, updatedAt: new Date() });
  },

  /** DB-U-034: 恢复资讯 */
  async restoreNews(newsId) {
    return this._exec(
      this._collection('news_items').doc(newsId).update({ isSaved: false, hasRead: false, updatedAt: new Date() })
    );
  },

  /** DB-D-008: 永久删除资讯 */
  async permanentDeleteNews(newsId) {
    return this._exec(this._collection('news_items').doc(newsId).remove());
  },

  /* ---------- 资讯标记已读 (无编号) ---------- */
  async markNewsRead(newsId) {
    return this._exec(
      this._collection('news_items').doc(newsId).update({ hasRead: true, updatedAt: new Date() })
    );
  },

  /* ================================================================
     九、知识沉淀模块接口 (12 逻辑接口)
     ================================================================ */

  /** DB-R-031: 文档列表 */
  async getDocuments(status, page = 1, pageSize = 20) {
    const where = {};
    if (status) where.status = status;
    return this._paginate('output_docs', where, { field: 'updatedAt', direction: 'desc' }, page, pageSize);
  },

  /** DB-R-032: 文档内容 */
  async getDocumentContent(docId) {
    const [doc] = await Promise.all([
      this._exec(this._collection('output_docs').doc(docId).get())
    ]);
    return doc;
  },

  /** DB-W-011: 创建文档 */
  async createDocument(data) {
    return this._exec(
      this._collection('output_docs').add({
        title: data.title,
        content: data.content || '',
        type: data.type || 'note',
        status: data.status || 'draft',
        knowledgeIds: data.knowledgeIds || [],
        wordCount: data.wordCount || 0,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );
  },

  /** DB-U-035: 保存文档 (自动保存, 防抖在前端处理) */
  async saveDocument(docId, data) {
    const update = { ...data, updatedAt: new Date() };
    if (data.content) update.wordCount = data.content.length;
    return this._exec(this._collection('output_docs').doc(docId).update(update));
  },

  /** DB-U-036: 发布文档 */
  async publishDocument(docId) {
    return this._exec(
      this._collection('output_docs').doc(docId).update({ status: 'published', updatedAt: new Date() })
    );
  },

  /** DB-D-009: 删除文档 */
  async deleteDocument(docId) {
    return this._exec(this._collection('output_docs').doc(docId).remove());
  },

  /** DB-R-033: 碎片列表 */
  async getScraps(limit = 10) {
    return this._exec(
      this._collection('scraps').orderBy('createdAt', 'desc').limit(limit).get()
    );
  },

  /** DB-W-012: 创建碎片 */
  async createScrap(content, source) {
    return this._exec(
      this._collection('scraps').add({ content, source: source || '', status: 'raw', outputDocId: null, createdAt: new Date() })
    );
  },

  /** DB-U-037: 更新/转化碎片 */
  async updateScrap(scrapId, data) {
    return this._exec(
      this._collection('scraps').doc(scrapId).update({ ...data, updatedAt: new Date() })
    );
  },

  /** DB-D-010: 删除碎片 */
  async deleteScrap(scrapId) {
    return this._exec(this._collection('scraps').doc(scrapId).remove());
  },

  /** DB-W-013: 展开写作 (碎片转文档) */
  async expandScrapToDoc(scrapId, title) {
    const scrapResult = await this._exec(this._collection('scraps').doc(scrapId).get());
    const scrap = scrapResult.data && scrapResult.data.length > 0 ? scrapResult.data[0] : null;
    if (!scrap) return { success: false, error: '碎片不存在' };
    const docResult = await this._collection('output_docs').add({
      title: title || '来自灵感的文章', content: scrap.content, status: 'draft',
      wordCount: scrap.content.length, createdAt: new Date(), updatedAt: new Date()
    });
    await this._collection('scraps').doc(scrapId).update({ status: 'converted', outputDocId: docResult.id, updatedAt: new Date() });
    return { success: true, data: { docId: docResult.id } };
  },

  /** DB-U-038: 忽略碎片 */
  async ignoreScrap(scrapId) {
    return this._exec(
      this._collection('scraps').doc(scrapId).update({ status: 'ignored', updatedAt: new Date() })
    );
  },

  /** AI-015: 推荐素材 */
  async aiRecommendMaterials(docId) {
    return this._aiProxy({ action: 'recommend-materials', docId });
  },

  /** AI-016: AI 扩写 */
  async aiExpand(docId, section) {
    return this._aiProxy({ action: 'expand', docId, section });
  },

  /** AI-017: AI 润色 */
  async aiRefine(docId, content) {
    return this._aiProxy({ action: 'refine', docId, content });
  },

  /** AI-018: AI 生成大纲 */
  async aiOutline(docId, topic) {
    return this._aiProxy({ action: 'outline', docId, topic });
  },

  /** AI-019: AI 评审 */
  async aiReview(docId) {
    return this._aiProxy({ action: 'review', docId });
  },

  /** AGG-020: 输出统计 */
  async getOutputStats() {
    const [docCount, scrapCount] = await Promise.all([
      this._count('output_docs', {}),
      this._count('scraps', {})
    ]);
    return { success: true, data: { docCount, scrapCount } };
  },

  /* ================================================================
     十、系统设置模块接口 (4 逻辑接口)
     ================================================================ */

  /** DB-R-034: 获取设置 */
  async getUserSettings() {
    const result = await this._exec(this._collection('user_settings').where({}).get());
    const settings = result.data && result.data.length > 0 ? result.data[0] : {};
    return { success: true, data: settings };
  },

  /** DB-U-039: 批量更新设置 (合并7个原接口) */
  async updateUserSettings(partial) {
    const result = await this._exec(this._collection('user_settings').where({}).get());
    if (result.data && result.data.length > 0) {
      const doc = result.data[0];
      return this._exec(this._collection('user_settings').doc(doc._id).update({ ...partial, updatedAt: new Date() }));
    }
    const defaults = {
      defaultModel: 'mimo',
      dailyReviewCount: 20,
      notificationEnabled: true,
      autoBackup: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return this._exec(this._collection('user_settings').add({ ...defaults, ...partial }));
  },

  /** AGG-021: 导出数据 (读取全部集合) */
  async exportAllData() {
    const collections = ['goals', 'milestones', 'tasks', 'knowledge_items', 'categories',
      'review_cards', 'review_history', 'news_items', 'chats', 'messages', 'output_docs', 'scraps', 'user_settings'];
    const data = {};
    for (const coll of collections) {
      const result = await this._exec(this._collection(coll).where({}).get());
      data[coll] = result.data;
    }
    return { success: true, data };
  },

  /** DB-W-014: 导入数据 */
  async importAllData(data) {
    const results = {};
    for (const [coll, items] of Object.entries(data)) {
      results[coll] = [];
      for (const item of items) {
        delete item._id;
        delete item._openid;
        const r = await this._collection(coll).add(item);
        results[coll].push(r.id);
      }
    }
    return { success: true, data: results };
  },

  /** DB-D-011: 清空数据 */
  async clearAllData() {
    const collections = ['goals', 'milestones', 'tasks', 'knowledge_items', 'categories',
      'review_cards', 'review_history', 'news_items', 'chats', 'messages', 'output_docs', 'scraps', 'user_settings'];
    for (const coll of collections) {
      const result = await this._exec(this._collection(coll).where({}).get());
      for (const doc of result.data) {
        await this._collection(coll).doc(doc._id).remove();
      }
    }
    return { success: true };
  },

  /** CF-001: 立即备份 (云函数触发) */
  async triggerBackup() {
    if (!app) return { success: false, error: 'CloudBase 未初始化' };
    try {
      const result = await app.callFunction({ name: 'data-cleanup', data: { action: 'backup' } });
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message || '备份失败' };
    }
  },

  /* ================================================================
     十一、CloudBase 查询操作符辅助
     ================================================================ */

  _gte(val) { return db.command.gte(val); },
  _lte(val) { return db.command.lte(val); },
  _lt(val) { return db.command.lt(val); },
  _gt(val) { return db.command.gt(val); },
  _between(start, end) { return db.command.and(db.command.gte(start), db.command.lte(end)); },

  /* ================================================================
     十二、初始化 (确保与 cloudbase.js 协作)
     ================================================================ */

  async init() {
    if (!app) await initCloudbase();
    return !!app;
  }
};

// 导出全局
window.DB = DB;

/**
 * 后端待开发接口一览:
 * - CF-001: data-cleanup 云函数 (定时清理 + 手动备份) → 需要创建 cloudfunctions/data-cleanup
 * - 其余所有接口均已在本文件通过 CloudBase SDK 或 ai-proxy 云函数实现
 */
