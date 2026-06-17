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
    // 暖身数据
    warmup: {
      yesterday: '你学习了「服务发现」概念，掌握了 Consul 的基本注册机制，并完成了 Go 并发模型的复习。',
      quizQuestion: '服务注册中心的核心作用是什么？',
      quizAnswer: '维护服务实例列表，提供服务发现和健康检查功能。'
    },
    // 续接数据
    resume: {
      title: '继续上次学习：微服务架构实战',
      subtitle: '上次停在「服务通信 — gRPC vs REST 对比」· 预计剩余 45 分钟'
    },
    goals: [
      {
        id: 'goal-1',
        title: '微服务架构实战',
        description: '系统掌握微服务设计、开发与部署，能在工作中独立拆分并实施微服务架构',
        status: 'active',
        progress: 65,
        tasks: 12,
        completedTasks: 8,
        estimatedHours: 42,
        createdAt: '2026-04-10',
        deadline: '2026-08-30',
        tags: ['后端', '架构']
      },
      {
        id: 'goal-2',
        title: 'React 深度学习',
        description: '从 Hooks 到性能优化，掌握 React 生态系统，能构建生产级应用',
        status: 'active',
        progress: 38,
        tasks: 13,
        completedTasks: 5,
        estimatedHours: 35,
        createdAt: '2026-05-01',
        deadline: '2026-07-15',
        tags: ['前端']
      },
      {
        id: 'goal-3',
        title: '英语口语提升',
        description: '提升工作英语口语能力，能流畅参与英文技术会议和演讲',
        status: 'paused',
        progress: 22,
        tasks: 15,
        completedTasks: 3,
        estimatedHours: 60,
        createdAt: '2026-03-15',
        deadline: '2026-12-31',
        tags: ['语言']
      },
      {
        id: 'goal-4',
        title: 'Docker & K8s 入门',
        description: '掌握容器化技术与 Kubernetes 基础，能部署生产应用',
        status: 'completed',
        progress: 100,
        tasks: 12,
        completedTasks: 12,
        estimatedHours: 30,
        createdAt: '2026-02-01',
        deadline: '2026-05-20',
        completedAt: '2026-05-20',
        tags: ['DevOps']
      }
    ],
    milestones: [
      { id: 'm1', goalId: 'goal-1', title: '里程碑1：理解微服务核心概念', status: 'completed', progress: 100, completedAt: '2026-05-01' },
      { id: 'm2', goalId: 'goal-1', title: '里程碑2：服务拆分策略与通信机制', status: 'active', progress: 50, dueDate: '2026-06-20' },
      { id: 'm3', goalId: 'goal-1', title: '里程碑3：服务治理与可观测性', status: 'pending', progress: 0 },
      { id: 'm4', goalId: 'goal-1', title: '里程碑4：实战项目', status: 'pending', progress: 0 },
      { id: 'm5', goalId: 'goal-1', title: '里程碑5：输出与分享', status: 'pending', progress: 0 }
    ],
    tasks: [
      { id: 't1', milestoneId: 'm1', title: '阅读《微服务设计》前3章，整理核心概念', completed: true, priority: 'high', timeActual: '95min', timeEst: '90min', dueDate: '2026-04-15' },
      { id: 't2', milestoneId: 'm1', title: '单体架构 vs 微服务对比分析（输出笔记）', completed: true, priority: 'mid', timeActual: '65min', timeEst: '60min' },
      { id: 't3', milestoneId: 'm1', title: '绘制微服务架构全景图（含各组件）', completed: true, priority: 'mid', timeActual: '40min', timeEst: '45min' },
      { id: 't4', milestoneId: 'm2', title: 'DDD 领域驱动拆分方法论', completed: true, priority: 'high', timeActual: '120min', timeEst: '90min' },
      { id: 't5', milestoneId: 'm2', title: 'RESTful API 设计规范与实践', completed: true, priority: 'high', dueDate: '2026-06-05' },
      { id: 't6', milestoneId: 'm2', title: 'gRPC vs REST 对比分析（含代码示例）', completed: false, status: 'in_progress', priority: 'high', dueDate: '2026-06-18' },
      { id: 't7', milestoneId: 'm2', title: '服务发现对比：Consul vs Eureka vs Nacos', completed: false, priority: 'mid', dueDate: '2026-06-10', timeEst: '60min' }
    ]
  },

  // 资讯数据 — 对齐 prototype-news.html
  news: {
    stats: {
      todayProcessed: 12, todayPending: 5, todayImported: 7, todayIgnored: 3,
      monthlyTotal: 86, conversionRate: 58, avgScore: 72, outputRate: 20
    },
    items: [
      { id: 1, title: '微服务架构演进之路 2026', source: 'infoq.cn', time: '2天前', score: 92, level: 'high',
        summary: '本文系统梳理了微服务架构从2014年至今的发展脉络，涵盖从单体拆分到服务网格的技术演进，重点分析了AI原生微服务的新趋势。',
        tags: ['微服务', '架构', '演进'], aiTags: ['微服务', '架构', '演进'],
        matchReason: '与当前主题高度关联，填补服务演进空白',
        scoreDetail: { 信源: [95, 'infoq.cn 是权威技术媒体'], 价值: [88, '深度分析，含代码案例'], 关联度: [98, '与微服务主题高度匹配'], 新鲜度: [90, '2天前发布'], 可转化性: [89, '可生成复习卡片和输出素材'] },
        status: 'pending', content: '# 微服务架构演进之路 2026\n\n## 一、从单体到微服务\n\n2014年，Martin Fowler和James Lewis正式提出了微服务架构的概念...' },
      { id: 2, title: '服务网格与Istio入门实战指南', source: 'juejin.cn', time: '5天前', score: 78, level: 'mid',
        summary: '从零开始讲解服务网格的核心概念，并通过Istio的实际部署案例，手把手教你搭建生产级服务网格。',
        tags: ['服务网格', 'Istio', '教程'], aiTags: ['服务网格', 'Istio', '微服务'],
        matchReason: '与当前学习计划「微服务通信」关联',
        scoreDetail: { 信源: [72, '掘金专栏作者'], 价值: [85, '实操教程含完整代码'], 关联度: [82, '与微服务通信相关'], 新鲜度: [80, '5天前'], 可转化性: [75, '可作为实践素材'] },
        status: 'pending', content: '# 服务网格与Istio入门\n\n## 什么是服务网格\n\n服务网格是微服务架构中的基础设施层...' },
      { id: 3, title: '云原生时代的可观测性实践', source: 'csdn.net', time: '1天前', score: 85, level: 'high',
        summary: '深入探讨云原生环境下可观测性的三大支柱：Metrics、Traces和Logs，以及如何利用OpenTelemetry构建统一可观测平台。',
        tags: ['可观测性', '云原生', 'OpenTelemetry'], aiTags: ['可观测性', '云原生', '监控'],
        matchReason: '与微服务运维知识体系密切相关',
        scoreDetail: { 信源: [65, 'CSDN平台'], 价值: [92, '深度技术分析'], 关联度: [88, '与微服务运维相关'], 新鲜度: [95, '昨天发布'], 可转化性: [82, '可生成运维知识卡片'] },
        status: 'pending', content: '# 云原生可观测性实践\n\n## 可观测性三支柱\n...' },
      { id: 4, title: '10个改善微服务性能的实用技巧', source: 'zhihu.com', time: '3天前', score: 52, level: 'low',
        summary: '分享10个简单实用的微服务性能优化技巧，包括连接池配置、缓存策略、数据库优化等常用方法。',
        tags: ['性能优化', '微服务', '技巧'], aiTags: ['性能优化', '微服务'],
        matchReason: '与微服务主题相关但深度一般',
        scoreDetail: { 信源: [45, '知乎个人文章'], 价值: [55, '实用但不够深入'], 关联度: [60, '与微服务相关'], 新鲜度: [75, '3天前'], 可转化性: [40, '转化价值有限'] },
        status: 'pending', content: '# 10个微服务性能优化技巧\n...' },
      { id: 5, title: '2026年AI编程工具全面评测', source: 'geekbang.org', time: '6天前', score: 68, level: 'mid',
        summary: '横向对比Cursor、Copilot、Cody等AI编程工具，从代码补全、重构建议、多文件理解等维度进行全面评测。',
        tags: ['AI', '编程工具', '评测'], aiTags: ['AI', '开发工具', '效率'],
        matchReason: '与当前学习无直接关联',
        scoreDetail: { 信源: [85, '极客邦权威来源'], 价值: [70, '有参考价值'], 关联度: [35, '与当前主题关联弱'], 新鲜度: [85, '6天前'], 可转化性: [50, '可作为参考'] },
        status: 'pending', content: '# 2026年AI编程工具评测\n...' },
      { id: 6, title: '分布式事务的最终一致性方案对比', source: 'infoq.cn', time: '4天前', score: 73, level: 'mid',
        summary: '详细对比Saga、TCC、可靠消息最终一致性等分布式事务方案，含实际场景选型建议。',
        tags: ['分布式事务', '微服务', 'Saga'], aiTags: ['分布式事务', '微服务', '架构'],
        matchReason: '与微服务数据管理相关',
        scoreDetail: { 信源: [95, 'infoq.cn'], 价值: [80, '技术深度好'], 关联度: [72, '与微服务数据管理相关'], 新鲜度: [80, '4天前'], 可转化性: [65, '可作为学习素材'] },
        status: 'pending', content: '# 分布式事务方案对比\n...' },
      { id: 7, title: 'React 20 全新特性速览', source: 'juejin.cn', time: '1周前', score: 40, level: 'low',
        summary: '快速了解React 20的新特性，包括新的并发模式和Server Components的改进。',
        tags: ['React', '前端', '框架'], aiTags: ['React', '前端'],
        matchReason: '与当前微服务主题无关',
        scoreDetail: { 信源: [70, '掘金'], 价值: [45, '浅层介绍'], 关联度: [10, '与当前主题无关'], 新鲜度: [60, '1周前'], 可转化性: [25, '转化价值低'] },
        status: 'pending', content: '# React 20 新特性\n...' },
      { id: 8, title: 'AI Agent在微服务架构中的落地实践', source: 'infoq.cn', time: '2天前', score: 90, level: 'high',
        summary: '探讨AI Agent如何与现有微服务体系结合，包括服务编排、智能路由、自动扩缩容等场景的落地案例。',
        tags: ['AI Agent', '微服务', '落地实践'], aiTags: ['AI Agent', '微服务', '智能'],
        matchReason: '与当前学习主题高度关联，前沿技术',
        scoreDetail: { 信源: [95, 'infoq.cn'], 价值: [93, '前沿+落地案例'], 关联度: [95, '与微服务主题完美匹配'], 新鲜度: [95, '2天前'], 可转化性: [90, '高水平输出素材'] },
        status: 'pending', content: '# AI Agent在微服务架构中的落地实践\n...' }
    ],
    ignored: [
      { id: 101, title: '如何成为一个更好的程序员', source: 'medium.com', time: '3天前', reason: '与学习主题无关', ignoredAt: '2026-06-08' },
      { id: 102, title: 'Python数据科学入门教程', source: 'csdn.net', time: '5天前', reason: '与当前学习方向无关', ignoredAt: '2026-06-07' },
      { id: 103, title: '2026年最好的笔记本电脑推荐', source: 'zhihu.com', time: '1周前', reason: '非技术内容', ignoredAt: '2026-06-05' }
    ],
    imported: [
      { id: 201, title: 'Kubernetes Operator开发实战', importedAt: '2026-06-09', category: '学习 > 云原生 > K8s Operator', tags: ['Kubernetes', 'Operator'], hasReview: true, hasOutput: false },
      { id: 202, title: 'Go语言并发模式详解', importedAt: '2026-06-08', category: '学习 > Go语言 > 并发编程', tags: ['Go', '并发'], hasReview: true, hasOutput: true },
      { id: 203, title: '微服务架构设计模式', importedAt: '2026-06-07', category: '学习 > 微服务架构 > 设计模式', tags: ['微服务', '设计模式'], hasReview: true, hasOutput: false }
    ],
    trash: [
      { id: 301, title: '过时的Docker Swarm教程', deletedAt: '2026-06-05', expireAt: '2026-07-05' },
      { id: 302, title: '重复内容：微服务入门', deletedAt: '2026-06-03', expireAt: '2026-07-03' }
    ],
    categories: ['全部', '微服务架构', '云原生', 'AI与机器学习', '前端开发']
  },

  // 知识库数据 — 对齐 prototype-knowledge.html
  knowledge: {
    items: [
      {
        id: 'k1',
        title: 'Go 语言并发模型深度解析',
        category: '技术/后端/Go',
        tags: ['Golang', '并发', '后端'],
        status: 'public',
        updateAt: '3个月前',
        sourceUrl: 'github.com',
        excerpt: 'Go 语言的并发模型基于 CSP（Communicating Sequential Processes）理论，通过 goroutine 和 channel 实现轻量级并发。本文深入解析 goroutine 调度器 GMP 模型...',
        isAI: false,
        isExpired: false
      },
      {
        id: 'k2',
        title: '微服务架构设计模式',
        category: '技术/后端',
        tags: ['微服务', '架构', '分布式'],
        status: 'public',
        updateAt: '5个月前',
        sourceUrl: 'martinfowler.com',
        excerpt: '微服务架构的核心设计模式包括：API Gateway、服务发现、断路器、配置中心、分布式追踪等...',
        isAI: false,
        isExpired: false
      },
      {
        id: 'k3',
        title: 'React Server Components 完全指南',
        category: '技术/前端/React',
        tags: ['React', 'RSC', '前端'],
        status: 'public',
        updateAt: '14个月前',
        sourceUrl: 'react.dev',
        excerpt: 'React Server Components (RSC) 是 React 18 引入的革命性特性，允许组件在服务器端渲染...',
        isAI: false,
        isExpired: true
      },
      {
        id: 'k4',
        title: '产品需求文档 (PRD) 写作规范',
        category: '产品/产品管理',
        tags: ['PRD', '产品管理', '文档规范'],
        status: 'sensitive',
        updateAt: '1个月前',
        excerpt: '一份好的 PRD 应该包含：产品背景、目标用户、功能描述、用户故事、验收标准...',
        isAI: false,
        isExpired: false
      },
      {
        id: 'k5',
        title: '向量数据库选型对比：Milvus vs Pinecone',
        category: '技术/AI/ML',
        tags: ['向量数据库', 'AI', '选型'],
        status: 'public',
        updateAt: '2个月前',
        sourceUrl: 'pinecone.io',
        excerpt: '向量数据库是 AI 应用的基础设施。本文从性能、易用性、生态、成本四个维度对比主流向量数据库...',
        isAI: false,
        isExpired: false
      },
      {
        id: 'k6',
        title: '技术写作方法论',
        category: '写作',
        tags: ['技术写作', '文档', '方法论'],
        status: 'secret',
        updateAt: '2周前',
        excerpt: '技术写作的核心原则：读者导向、渐进披露、精确表达、结构清晰...',
        isAI: true,
        isExpired: false
      }
    ],
    aiItems: [
      {
        id: 'ai1',
        title: 'LLM 推理优化技术综述',
        score: 85,
        source: 'arxiv.org',
        updateAt: '2天前',
        excerpt: '大语言模型推理阶段的优化技术：KV Cache、Continuous Batching、Speculative Decoding、量化推理等前沿方法的原理与实现...',
        scoreDetail: [
          { name: '信源可信度', value: 90 },
          { name: '内容价值', value: 88 },
          { name: '主题关联度', value: 82 },
          { name: '信息新鲜度', value: 78 },
          { name: '可转化性', value: 80 }
        ]
      },
      {
        id: 'ai2',
        title: 'PostgreSQL 17 新特性详解',
        score: 72,
        source: 'postgresql.org',
        updateAt: '1周前',
        excerpt: 'PostgreSQL 17 正式发布，带来了增量备份、改进的查询优化器、JSON 性能提升等多项新特性...',
        scoreDetail: [
          { name: '信源可信度', value: 85 },
          { name: '内容价值', value: 70 },
          { name: '主题关联度', value: 68 },
          { name: '信息新鲜度', value: 75 },
          { name: '可转化性', value: 65 }
        ]
      },
      {
        id: 'ai3',
        title: 'Rust 异步编程实战',
        score: 68,
        source: 'rust-lang.org',
        updateAt: '3天前',
        excerpt: '深入探讨 Rust 异步编程模型，从 async/await 语法到 Tokio 运行时，附实战代码示例...',
        scoreDetail: [
          { name: '信源可信度', value: 95 },
          { name: '内容价值', value: 72 },
          { name: '主题关联度', value: 55 },
          { name: '信息新鲜度', value: 88 },
          { name: '可转化性', value: 60 }
        ]
      }
    ],
    trashItems: [
      { id: 't1', title: '旧版 API 设计规范', category: '技术/后端', deletedAt: '3天前', remainingDays: 27 },
      { id: 't2', title: '2024年技术趋势预测', category: '技术', deletedAt: '10天前', remainingDays: 20 },
      { id: 't3', title: '过时的 Docker Swarm 教程', category: 'DevOps', deletedAt: '15天前', remainingDays: 15 }
    ],
    healthReport: {
      healthScore: 78,
      trend: '+3%',
      duplicates: 2,
      orphans: 5,
      weakTopics: ['分布式系统', 'Kubernetes', 'React Hooks'],
      expired: 4
    },
    categories: [
      { _id: 'tech', name: '技术', icon: '💻', count: 12, parentId: null },
      { _id: 'backend', name: '后端', icon: '🔧', count: 5, parentId: 'tech' },
      { _id: 'golang', name: 'Go 语言', icon: '🐹', count: 2, parentId: 'backend' },
      { _id: 'database', name: '数据库', icon: '🗄️', count: 3, parentId: 'backend' },
      { _id: 'frontend', name: '前端', icon: '🎨', count: 4, parentId: 'tech' },
      { _id: 'react', name: 'React', icon: '⚛️', count: 2, parentId: 'frontend' },
      { _id: 'css', name: 'CSS/Tailwind', icon: '🎨', count: 2, parentId: 'frontend' },
      { _id: 'aiml', name: 'AI/ML', icon: '🤖', count: 3, parentId: 'tech' },
      { _id: 'product', name: '产品', icon: '📦', count: 8, parentId: null },
      { _id: 'prod-mgmt', name: '产品管理', icon: '📋', count: 5, parentId: 'product' },
      { _id: 'ux', name: '交互设计', icon: '✏️', count: 3, parentId: 'product' },
      { _id: 'writing', name: '写作', icon: '✍️', count: 3, parentId: null },
      { _id: 'uncategorized', name: '未分类', icon: '📄', count: 2, parentId: null }
    ]
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
    overview: {
      total: 15,
      completed: 6,
      remaining: 9,
      streak: 7,
      overdueCount: 3
    },
    currentQueue: [
      {
        _id: 'card1',
        knowledgeId: 'k1',
        knowledgeTitle: 'Go 并发模型深度解析',
        category: '技术/后端/Go',
        question: 'Go 语言的并发模型基于什么理论？',
        type: '选择题',
        options: [
          { key: 'A', text: 'Actor Model' },
          { key: 'B', text: 'CSP（通信顺序进程）' },
          { key: 'C', text: 'Pipeline Pattern' },
          { key: 'D', text: 'Event Loop' }
        ],
        correctAnswer: 'B',
        explanation: 'Go 语言的并发模型基于 CSP（Communicating Sequential Processes）理论。CSP 是一种描述并发系统中进程间通信的形式化方法，Go 通过 goroutine（轻量级线程）和 channel（通信管道）来实现这一理论。',
        mastery: 1.5,
        interval: 6,
        nextReview: '2026-06-15',
        status: 'overdue',
        created: '3个月前'
      },
      {
        _id: 'card2',
        knowledgeId: 'k2',
        knowledgeTitle: 'Go Channel 详解',
        category: '技术/后端/Go',
        question: 'Go 中 channel 的三种类型是什么？',
        type: '选择题',
        options: [
          { key: 'A', text: '整型、字符串、布尔' },
          { key: 'B', text: '无缓冲、带缓冲、单向' },
          { key: 'C', text: '同步、异步、阻塞' },
          { key: 'D', text: '只读、只写、双向' }
        ],
        correctAnswer: 'B',
        explanation: 'Go 中的 channel 分为三种：无缓冲 channel（make(chan T)）、带缓冲 channel（make(chan T, n)）和单向 channel（chan<- T 或 <-chan T）。单向 channel 通常用于函数参数传递，限制 channel 的使用方式。',
        mastery: 2.5,
        interval: 12,
        nextReview: '2026-06-16',
        status: 'normal',
        created: '2个月前'
      },
      {
        _id: 'card3',
        knowledgeId: 'k3',
        knowledgeTitle: 'Go 内存模型',
        category: '技术/后端/Go',
        question: 'Go 的内存模型保证了什么？',
        type: '选择题',
        options: [
          { key: 'A', text: '所有变量的原子性' },
          { key: 'B', text: 'goroutine 间的可见性规则' },
          { key: 'C', text: '垃圾回收的实时性' },
          { key: 'D', text: '栈空间的无限增长' }
        ],
        correctAnswer: 'B',
        explanation: 'Go 的内存模型描述了 Go 程序中 goroutine 之间共享变量的可见性规则。它定义了在什么条件下一个 goroutine 对变量的写入对另一个 goroutine 是可见的。',
        mastery: 1.8,
        interval: 4,
        nextReview: '2026-06-14',
        status: 'overdue',
        created: '1个月前'
      }
    ],
    currentIndex: 0,
    masteryTrend: [1.5, 2.0, 2.5, 3.0],
    relatedCards: [
      { id: 'r1', title: 'Channel 原理', mastery: 2.5, status: 'overdue', risk: 'high' },
      { id: 'r2', title: 'GMP 调度模型', mastery: 3.0, status: 'normal', risk: 'low' },
      { id: 'r3', title: 'sync 包详解', mastery: 2.0, status: 'normal', risk: 'medium' }
    ],
    history: [
      { date: '2026-06-11', count: 6, accuracy: 83 },
      { date: '2026-06-10', count: 12, accuracy: 75 },
      { date: '2026-06-09', count: 10, accuracy: 70 },
      { date: '2026-06-08', count: 14, accuracy: 86 },
      { date: '2026-06-07', count: 8, accuracy: 63 }
    ],
    stats: {
      totalReviews: 342,
      avgAccuracy: 72,
      longestStreak: 14,
      totalCards: 48,
      masteryDist: { low: 8, medium: 12, high: 18 },
      weakTopics: [
        { name: '分布式系统', mastery: 2.1 },
        { name: 'K8s 运维', mastery: 2.3 },
        { name: 'React Hooks', mastery: 2.4 }
      ],
      forgettingCurve: [95, 85, 75, 60, 45]
    },
    riskCards: [
      { id: 'risk1', title: 'Channel 原理', lastReview: '12天前', mastery: 1.5, riskRatio: 0.80, status: 'critical' },
      { id: 'risk2', title: 'Go 内存模型', lastReview: '10天前', mastery: 2.0, riskRatio: 0.83, status: 'critical' },
      { id: 'risk3', title: '微服务设计模式', lastReview: '6天前', mastery: 2.5, riskRatio: 0.75, status: 'warning' }
    ],
    heatmapData: Array(77).fill(0).map(() => Math.floor(Math.random() * 5)),
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

  // 输出模块数据
  output: {
    docs: [
      {
        _id: 'doc-1',
        title: '微服务架构实战总结',
        type: 'article',
        typeLabel: '技术文章',
        excerpt: '过去半年，团队从单体架构迁移到微服务架构，经历了服务拆分、通信选型、部署运维等关键阶段。本文是对整个迁移过程的全面复盘…',
        wordCount: 3200,
        materialCount: 3,
        status: 'published',
        updatedAt: '3天前',
        content: '# 微服务架构实战总结\n\n## 背景\n\n过去半年，我们团队从单体架构逐步迁移到微服务架构。技术栈：Go + Kubernetes + Istio。\n\n## 核心实践\n\n### 1. 服务拆分策略\n我们参考了 DDD 的限界上下文理论，将单体应用拆分为 15 个独立服务。\n\n### 2. 通信选型\n内部服务间采用 gRPC 通信，外部 API 通过 Kong Gateway 统一入口。\n\n## 总结\n\n微服务不是银弹。15个服务的规模下，团队需要额外投入约 30% 的运维精力。'
      },
      {
        _id: 'doc-2',
        title: 'Go并发模型技术分享',
        type: 'speech',
        typeLabel: '技术演讲',
        excerpt: '准备在团队内做一次关于Go并发模型的技术分享，大纲已梳理：goroutine原理→GMP调度→channel实战→性能优化…',
        wordCount: 5800,
        materialCount: 5,
        status: 'draft',
        progress: 80,
        updatedAt: '编辑中'
      },
      {
        _id: 'doc-3',
        title: '分布式系统学习笔记',
        type: 'note',
        typeLabel: '学习笔记',
        excerpt: 'CAP 理论、一致性协议（Paxos/Raft）、分布式事务（2PC/TCC/Saga）的核心要点梳理。附思维导图和对比表格…',
        wordCount: 1500,
        materialCount: 2,
        status: 'published',
        updatedAt: '1周前'
      },
      {
        _id: 'doc-4',
        title: 'CI/CD 流水线搭建记录',
        type: 'practice',
        typeLabel: '项目实践记录',
        excerpt: '使用 GitHub Actions 搭建前后端 CI/CD 流水线完整记录：Lint → Test → Build → Deploy，含踩坑和解决方案…',
        wordCount: 800,
        materialCount: 1,
        status: 'published',
        updatedAt: '2周前'
      },
      {
        _id: 'doc-5',
        title: 'React Hooks 完全指南',
        type: 'tutorial',
        typeLabel: '进阶教程',
        excerpt: '从 useState 到 useMemo，涵盖所有内置 Hooks 的使用场景、常见陷阱和最佳实践，配合 CodeSandbox 在线示例…',
        wordCount: 6200,
        materialCount: 4,
        status: 'draft',
        progress: 45,
        updatedAt: '编辑中'
      },
      {
        _id: 'doc-6',
        title: 'TypeScript 类型体操',
        type: 'article',
        typeLabel: '技术文章',
        excerpt: '深入探讨 TypeScript 高级类型系统，包括条件类型、映射类型、模板字面量类型等进阶用法…',
        wordCount: 2800,
        materialCount: 2,
        status: 'draft',
        progress: 60,
        updatedAt: '编辑中'
      },
      {
        _id: 'doc-7',
        title: 'Redis 性能优化实践',
        type: 'practice',
        typeLabel: '项目实践记录',
        excerpt: '生产环境 Redis 性能调优经验总结，包括内存优化、集群配置、热点Key处理等…',
        wordCount: 1200,
        materialCount: 3,
        status: 'published',
        updatedAt: '3周前'
      },
      {
        _id: 'doc-8',
        title: 'Docker 容器化最佳实践',
        type: 'tutorial',
        typeLabel: '进阶教程',
        excerpt: '从 Dockerfile 编写到镜像优化，再到容器网络配置的完整指南…',
        wordCount: 4500,
        materialCount: 4,
        status: 'published',
        updatedAt: '1个月前'
      }
    ],
    scraps: [
      {
        _id: 'scrap-1',
        content: '"Service Mesh 选型可以用对比表格总结，一目了然"',
        suggestedType: '技术文章',
        status: 'raw',
        createdAt: '今天'
      },
      {
        _id: 'scrap-2',
        content: '"PRD 里提到的评审方法可以整理成模板给团队用"',
        suggestedType: '工作文档',
        status: 'raw',
        createdAt: '昨天'
      },
      {
        _id: 'scrap-3',
        content: '"Goroutine 泄漏排查方法可以写一篇 Debug 经验分享"',
        suggestedType: '技术文章',
        status: 'raw',
        createdAt: '3天前'
      },
      {
        _id: 'scrap-4',
        content: '"分布式锁的几种实现方案对比分析"',
        suggestedType: '技术文章',
        status: 'raw',
        createdAt: '1周前'
      },
      {
        _id: 'scrap-5',
        content: '"ELK 日志系统搭建完整指南"',
        suggestedType: '技术教程',
        status: 'raw',
        createdAt: '1周前'
      },
      {
        _id: 'scrap-6',
        content: '"K8s Pod 调度策略深入理解"',
        suggestedType: '技术文章',
        status: 'raw',
        createdAt: '2周前'
      },
      {
        _id: 'scrap-7',
        content: '"单元测试覆盖率提升技巧"',
        suggestedType: '技术文章',
        status: 'raw',
        createdAt: '2周前'
      }
    ],
    stats: {
      draftCount: 3,
      publishedCount: 5,
      totalWords: 28500,
      materialUtilization: 62
    },
    materials: [
      {
        id: 'mat-1',
        title: '《微服务设计模式》',
        tags: ['服务发现', '熔断器', 'API Gateway'],
        relevance: 92
      },
      {
        id: 'mat-2',
        title: '《API Gateway vs Service Mesh》',
        tags: ['网关对比', '选型建议'],
        relevance: 85
      },
      {
        id: 'mat-3',
        title: '《分布式追踪实践》',
        tags: ['Jaeger', 'OpenTelemetry'],
        relevance: 78
      }
    ]
  },
  
  // 系统设置模块数据
  settings: {
    theme: 'light',
    defaultModel: 'DeepSeek',
    monthlyBudget: 20,
    budgetUsed: 8,
    budgetAlert: true,
    budgetStop: true,
    notificationReview: true,
    notificationDeadline: true,
    notificationSystem: true,
    notificationTime: '09:00',
    doNotDisturbStart: '22:00',
    doNotDisturbEnd: '08:00',
    backupFrequency: 'daily',
    backupTarget: 'weiyun'
  },
  apiKeys: [
    {
      _id: 'key-1',
      provider: 'DeepSeek',
      key: 'sk-7a8b9c••••••••d4e5f6',
      enabled: true,
      statusText: '● 已启用'
    },
    {
      _id: 'key-2',
      provider: 'Kimi',
      key: 'sk-kimi••••••••••••xYz',
      enabled: true,
      statusText: '● 已启用'
    }
  ]
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