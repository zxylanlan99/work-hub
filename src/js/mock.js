// 模拟数据
const mockData = {
  // 首页数据
  home: {
    warmup: {
      yesterday: '你学习了「服务发现」概念，掌握了 Consul 的基本注册机制，并完成了 Go 并发模型的复习。',
      quiz: {
        question: 'Go 语言的并发模型基于什么理论？',
        options: ['间隔不变', 'CSP（通信顺序进程）', '面向对象', '事件驱动'],
        answer: 'CSP（通信顺序进程）',
        explanation: 'Go语言的并发模型基于CSP（Communicating Sequential Processes）理论，通过goroutine和channel实现并发通信。'
      }
    },
    quickStats: {
      goals: 2,
      reviewCards: 9,
      news: 2,
      output: 3
    },
    resume: {
      topic: 'Go 语言并发模型深度解析',
      subTopic: '二、GMP 调度模型',
      progress: 65,
      remainingTime: 25,
      lastTime: '昨天 22:30'
    },
    heatmap: generateHeatmapData(),
    weeklyTrend: {
      completionRate: 72,
      streakDays: 7,
      reviewCount: 45,
      knowledgeCount: 128
    }
  },

  // 学习计划数据
  plan: {
    goals: [
      {
        id: 'goal-1',
        title: 'Go语言高级编程',
        description: '深入学习Go语言的并发编程、内存管理和性能优化',
        status: 'active',
        progress: 45,
        milestones: 3,
        completedMilestones: 1,
        tasks: 12,
        completedTasks: 5,
        createdAt: '2026-06-01',
        deadline: '2026-07-15'
      },
      {
        id: 'goal-2',
        title: '系统设计入门',
        description: '学习分布式系统设计原理和常用模式',
        status: 'active',
        progress: 20,
        milestones: 4,
        completedMilestones: 0,
        tasks: 8,
        completedTasks: 2,
        createdAt: '2026-06-10',
        deadline: '2026-08-01'
      },
      {
        id: 'goal-3',
        title: '算法与数据结构',
        description: '复习常用算法和数据结构',
        status: 'completed',
        progress: 100,
        milestones: 5,
        completedMilestones: 5,
        tasks: 20,
        completedTasks: 20,
        createdAt: '2026-05-01',
        deadline: '2026-06-01'
      }
    ],
    milestones: [
      { id: 'm1', goalId: 'goal-1', title: '并发编程基础', completed: true, dueDate: '2026-06-10' },
      { id: 'm2', goalId: 'goal-1', title: '内存管理与GC', completed: false, dueDate: '2026-06-25' },
      { id: 'm3', goalId: 'goal-1', title: '性能优化实战', completed: false, dueDate: '2026-07-15' }
    ],
    tasks: [
      { id: 't1', goalId: 'goal-1', title: '学习goroutine和channel', completed: true, priority: 'high' },
      { id: 't2', goalId: 'goal-1', title: '理解select和select超时', completed: true, priority: 'high' },
      { id: 't3', goalId: 'goal-1', title: '并发安全与sync包', completed: true, priority: 'medium' },
      { id: 't4', goalId: 'goal-1', title: 'context包的使用', completed: false, priority: 'high' },
      { id: 't5', goalId: 'goal-1', title: '内存分配原理', completed: false, priority: 'medium' }
    ]
  },

  // 资讯数据
  news: {
    items: [
      {
        id: 'news-1',
        title: 'Go 1.23 发布，引入新的并发原语',
        source: 'Go官方博客',
        category: '技术动态',
        hasRead: false,
        isAIRecommended: true,
        publishedAt: '2026-06-14',
        summary: 'Go 1.23版本正式发布，带来了新的并发原语和性能改进。'
      },
      {
        id: 'news-2',
        title: '分布式系统设计模式总结',
        source: '技术分享',
        category: '系统设计',
        hasRead: false,
        isAIRecommended: true,
        publishedAt: '2026-06-13',
        summary: '总结了常用的分布式系统设计模式和最佳实践。'
      },
      {
        id: 'news-3',
        title: '学习方法：间隔重复的科学原理',
        source: '学习科学',
        category: '学习技巧',
        hasRead: true,
        isAIRecommended: false,
        publishedAt: '2026-06-12',
        summary: '介绍间隔重复学习法的科学原理和应用方法。'
      },
      {
        id: 'news-4',
        title: 'Rust vs Go：性能对比分析',
        source: '性能测试',
        category: '技术对比',
        hasRead: false,
        isAIRecommended: false,
        publishedAt: '2026-06-11',
        summary: '对Rust和Go进行了全面的性能对比测试。'
      }
    ],
    categories: ['全部', '技术动态', '系统设计', '学习技巧', '技术对比']
  },

  // 知识库数据
  knowledge: {
    items: [
      {
        id: 'k1',
        title: '服务发现与Consul',
        category: '分布式系统',
        tags: ['服务发现', 'Consul', '微服务'],
        createdAt: '2026-06-10',
        updateAt: '2026-06-14',
        viewCount: 45,
        likeCount: 12
      },
      {
        id: 'k2',
        title: 'Go并发模型-GMP',
        category: 'Go语言',
        tags: ['Go', '并发', 'GMP'],
        createdAt: '2026-06-08',
        updateAt: '2026-06-12',
        viewCount: 89,
        likeCount: 23
      },
      {
        id: 'k3',
        title: 'SM-2记忆算法详解',
        category: '学习方法',
        tags: ['记忆', '算法', '学习'],
        createdAt: '2026-06-05',
        updateAt: '2026-06-05',
        viewCount: 156,
        likeCount: 45
      },
      {
        id: 'k4',
        title: 'Redis缓存策略',
        category: '数据库',
        tags: ['Redis', '缓存', '性能'],
        createdAt: '2026-06-03',
        updateAt: '2026-06-04',
        viewCount: 67,
        likeCount: 18
      }
    ],
    categories: ['全部', '分布式系统', 'Go语言', '学习方法', '数据库']
  },

  // AI对话数据
  aiChat: {
    conversations: [
      {
        id: 'conv-1',
        title: '关于Go并发的问题',
        lastMessage: '好的，我来详细解释一下CSP模型...',
        createdAt: '2026-06-14 22:30',
        model: 'silicon-flow'
      },
      {
        id: 'conv-2',
        title: '帮我生成学习计划',
        lastMessage: '根据你的目标，我建议这样安排...',
        createdAt: '2026-06-13 15:20',
        model: 'mimo'
      },
      {
        id: 'conv-3',
        title: '微服务架构设计',
        lastMessage: '微服务架构有以下几个关键要点...',
        createdAt: '2026-06-12 10:15',
        model: 'silicon-flow'
      }
    ],
    messages: [
      { id: 'msg-1', role: 'user', content: '请解释一下Go语言的CSP并发模型', timestamp: '22:30' },
      { id: 'msg-2', role: 'assistant', content: 'CSP（Communicating Sequential Processes）是一种并发编程模型，Go语言通过goroutine和channel实现了CSP。\n\n**核心概念：**\n\n1. **Goroutine**：轻量级执行线程，由Go运行时管理，开销远小于操作系统线程。\n\n2. **Channel**：用于goroutine之间通信的管道，可以安全地传递数据。\n\n3. **Select**：允许goroutine同时等待多个channel操作。\n\n**设计原则：**\n- 不要通过共享内存来通信\n- 而是通过通信来共享内存\n\n这种方式避免了传统多线程编程中的锁竞争问题，使并发代码更加简洁和安全。', timestamp: '22:31' },
      { id: 'msg-3', role: 'user', content: '那GMP调度模型是什么？', timestamp: '22:35' }
    ],
    models: [
      { id: 'silicon-flow', name: '硅基流动', description: '通用AI模型', selected: true },
      { id: 'mimo', name: '小米Mimo', description: '专注对话', selected: false }
    ]
  },

  // 复习计划数据
  review: {
    cards: [
      { id: 'card-1', question: '什么是CSP模型？', answer: 'CSP是通信顺序进程，Go并发的理论基础', dueTime: '10分钟前', interval: 1, easeFactor: 2.5, repetitions: 3 },
      { id: 'card-2', question: 'Go中channel的三种类型是什么？', answer: '无缓冲、带缓冲、单向channel', dueTime: '30分钟前', interval: 2, easeFactor: 2.3, repetitions: 5 },
      { id: 'card-3', question: 'select语句的作用？', answer: '同时等待多个channel操作', dueTime: '1小时前', interval: 1, easeFactor: 2.6, repetitions: 2 },
      { id: 'card-4', question: 'context包的用途？', answer: '用于goroutine之间传递取消信号和请求范围的值', dueTime: '2小时前', interval: 3, easeFactor: 2.4, repetitions: 4 },
      { id: 'card-5', question: 'sync.WaitGroup的作用？', answer: '等待一组goroutine完成', dueTime: '3小时前', interval: 1, easeFactor: 2.5, repetitions: 1 },
      { id: 'card-6', question: 'atomic包的用途？', answer: '提供原子操作，用于无锁并发编程', dueTime: '过期2小时', interval: 7, easeFactor: 2.2, repetitions: 6 },
      { id: 'card-7', question: 'defer语句的执行顺序？', answer: '后进先出（LIFO）', dueTime: '过期4小时', interval: 14, easeFactor: 2.1, repetitions: 8 },
      { id: 'card-8', question: 'Go的内存模型是什么？', answer: '描述Go程序中goroutine之间共享变量的可见性规则', dueTime: '过期1天', interval: 21, easeFactor: 1.9, repetitions: 10 }
    ],
    todayStats: {
      totalDue: 8,
      completed: 0,
      accuracy: 0
    },
    weeklyStats: {
      days: ['周一', '周二', '周三', '周四', '周五', '周六', '今天'],
      counts: [6, 8, 4, 9, 7, 5, 0],
      accuracy: [85, 78, 92, 88, 80, 95, 0]
    }
  },

  // 知识沉淀数据
  output: {
    docs: [
      { id: 'doc-1', title: 'Go并发编程总结', status: 'draft', wordCount: 2580, updatedAt: '今天 14:30', category: '技术总结' },
      { id: 'doc-2', title: '分布式系统笔记', status: 'draft', wordCount: 1890, updatedAt: '昨天 22:15', category: '学习笔记' },
      { id: 'doc-3', title: 'SM-2算法实现', status: 'published', wordCount: 1200, updatedAt: '3天前', category: '技术实现' },
      { id: 'doc-4', title: '系统设计面试准备', status: 'draft', wordCount: 3450, updatedAt: '1周前', category: '面试准备' },
      { id: 'doc-5', title: 'Consul使用指南', status: 'published', wordCount: 1680, updatedAt: '2周前', category: '技术文档' }
    ],
    scraps: [
      { id: 's1', content: 'Go 1.23新特性：sync.Pool优化', createdAt: '2026-06-14' },
      { id: 's2', content: '分布式ID生成方案对比', createdAt: '2026-06-13' },
      { id: 's3', content: 'gRPC流式调用示例', createdAt: '2026-06-12' }
    ],
    stats: {
      totalDocs: 5,
      draftCount: 3,
      publishedCount: 2,
      totalWords: 10800
    }
  }
};

// 生成热力图数据
function generateHeatmapData() {
  const data = [];
  for (let i = 99; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split('T')[0],
      level: Math.floor(Math.random() * 5)
    });
  }
  return data;
}

// API接口映射（标注需要调用的真实接口）
const apiMapping = {
  // 首页接口
  'DB-R-001': { name: '查询学习目标列表', path: 'GET /api/goals', mock: () => mockData.plan.goals },
  'DB-R-002': { name: '查询待复习卡片', path: 'GET /api/review/cards', mock: () => mockData.review.cards },
  'DB-R-003': { name: '查询未读资讯', path: 'GET /api/news/unread', mock: () => mockData.news.items.filter(n => !n.hasRead) },
  'AGG-001': { name: '获取学习统计', path: 'GET /api/stats', mock: () => mockData.home.weeklyTrend },
  
  // 学习计划接口
  'DB-W-001': { name: '创建学习目标', path: 'POST /api/goals', mock: (data) => ({ success: true, id: 'goal-' + Date.now() }) },
  'DB-R-004': { name: '查询目标详情', path: 'GET /api/goals/:id', mock: (id) => mockData.plan.goals.find(g => g.id === id) },
  'DB-U-001': { name: '更新目标进度', path: 'PUT /api/goals/:id', mock: () => ({ success: true }) },
  
  // AI对话接口
  'AI-001': { name: '发送消息', path: 'POST /ai-proxy', mock: (data) => ({ success: true, content: '这是AI的模拟回复。' }) },
  'DB-R-005': { name: '查询对话列表', path: 'GET /api/chats', mock: () => mockData.aiChat.conversations },
  'DB-W-002': { name: '创建对话', path: 'POST /api/chats', mock: () => ({ success: true, id: 'conv-' + Date.now() }) },
  
  // 复习计划接口
  'DB-R-006': { name: '查询复习历史', path: 'GET /api/review/history', mock: () => ({ data: [] }) },
  'DB-W-003': { name: '记录复习结果', path: 'POST /api/review/result', mock: () => ({ success: true }) },
  
  // 知识库接口
  'DB-R-007': { name: '查询知识条目', path: 'GET /api/knowledge', mock: () => mockData.knowledge.items },
  'DB-W-004': { name: '创建知识条目', path: 'POST /api/knowledge', mock: () => ({ success: true }) }
};

// 模拟API调用
async function apiCall(apiKey, data = {}) {
  const api = apiMapping[apiKey];
  if (!api) {
    console.error(`API not found: ${apiKey}`);
    return { success: false, error: 'API not found' };
  }
  
  console.log(`【模拟接口调用】${apiKey}: ${api.name} - ${api.path}`);
  
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
  
  try {
    const result = api.mock(data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 导出全局变量
window.mockData = mockData;
window.apiMapping = apiMapping;
window.apiCall = apiCall;