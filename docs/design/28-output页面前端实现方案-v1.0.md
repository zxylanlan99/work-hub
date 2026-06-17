# StudyMind output（知识沉淀）页面前端实现方案

> 文档编号：SM-DESIGN-OUTPUT  
> 版本：v1.0  
> 日期：2026-06-17  
> 状态：已确认  
> 参考原型：`prototypes/prototype-output.html`  
> 参考规范：`docs/design/13-技术规范总览.md`

---

## 一、功能需求分析

### 1.1 页面概述

知识沉淀（output）模块是 StudyMind 的核心输出模块，用于将学习的知识转化为可复用的输出文档。该页面包含两个主要视图：

| 视图 | 功能描述 |
|------|---------|
| **输出列表页** | 展示所有输出文档概览、统计数据、灵感碎片 |
| **编辑器页** | Markdown 编辑器，支持 AI 辅助写作、素材推荐 |

### 1.2 核心功能清单

| 功能模块 | 功能点 | 原型位置 |
|---------|--------|---------|
| **概览统计** | 草稿数、已发布数、总字数、素材利用率 | 第228-233行 |
| **文档列表** | 文档卡片展示、状态筛选、点击进入编辑 | 第243-323行 |
| **灵感碎片** | 碎片列表、展开写作、忽略碎片、快速记录 | 第327-356行 |
| **Markdown编辑器** | 编辑/预览分屏、工具栏、字数统计 | 第362-475行 |
| **AI辅助面板** | 素材推荐、AI操作（润色/续写/扩写/缩写/总结/评审） | 第419-473行 |

### 1.3 弹窗功能清单

| 弹窗名称 | 功能描述 | 尺寸类型 | 原型位置 |
|---------|---------|---------|---------|
| **新建输出** | 选择文档类型、输入标题、关联知识、AI生成初稿 | `.modal-lg` | 第479-507行 |
| **AI质量评审** | 综合评分、维度评分、改进建议、一键优化 | `.modal-lg` | 第509-538行 |
| **快速灵感录入** | 输入想法、AI自动归类 | `.modal-sm` | 第540-556行 |
| **实践连接器** | 关联项目、选择应用场景、生成实践计划 | `.modal-lg` | 第558-582行 |
| **素材匹配详情** | 查看素材详情、引用选段/摘要 | `.modal`（中等） | 第584-607行 |

---

## 二、布局结构设计

### 2.1 页面层级结构

```
┌─────────────────────────────────────────────────────────────────┐
│                        顶栏 (.topbar)                           │
│  ├── .topbar-title: ✍️ 知识沉淀                                │
│  └── .topbar-right: [快速灵感按钮] [新建输出按钮]                │
├─────────────────────────────────────────────────────────────────┤
│                        内容区 (.content)                         │
│  ├── .overview-grid（概览统计卡片）                              │
│  │     └── .overview-card × 4                                   │
│  │                                                              │
│  └── .output-layout（主内容布局）                                │
│        ├── .output-main（左侧：文档列表）                        │
│        │     ├── .sub-tabs（筛选标签）                          │
│        │     └── .doc-grid（文档卡片网格）                       │
│        │           └── .doc-card × N                            │
│        │                                                        │
│        └── .scrap-panel（右侧：灵感碎片）                        │
│              ├── .scrap-header                                 │
│              ├── .scrap-list                                   │
│              │     └── .scrap-item × N                         │
│              └── .scrap-add                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 编辑器页面结构

```
┌─────────────────────────────────────────────────────────────────┐
│                    编辑器顶栏 (.editor-topbar)                   │
│  ├── .editor-back: 返回列表                                    │
│  ├── .editor-doc-title: 文档标题                               │
│  └── [保存草稿按钮] [发布按钮]                                  │
├─────────────────────────────────────────────────────────────────┤
│                    编辑器布局 (.editor-layout)                   │
│  ├── .editor-main（左侧：编辑区）                               │
│  │     ├── .editor-toolbar（工具栏）                            │
│  │     ├── .editor-area（编辑区域）                             │
│  │     │     ├── .editor-input-pane（输入区 55%）              │
│  │     │     └── .editor-preview-pane（预览区 45%）            │
│  │     └── .editor-footer（底部信息）                           │
│  │                                                              │
│  └── .ai-panel（右侧：AI辅助面板）                              │
│        ├── .panel-section: 素材推荐                            │
│        ├── .panel-section: AI操作                              │
│        └── .panel-section: 文档信息                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 布局尺寸规范

| 区域 | 尺寸 | CSS属性 |
|------|------|---------|
| 顶栏 | 56px | `height: 56px` |
| 内容区 | 自适应 | `flex: 1; padding: 24px` |
| 概览卡片网格 | 4列 | `grid-template-columns: repeat(4, 1fr)` |
| 主内容布局 | 1fr + 280px | `grid-template-columns: 1fr 280px` |
| 文档卡片网格 | 自适应 | `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` |
| 编辑器布局 | 1fr + 340px | `grid-template-columns: 1fr 340px` |
| 编辑区 | 55% / 45% | `editor-input-pane: 55%; editor-preview-pane: 45%` |

---

## 三、样式规范

### 3.1 颜色规范

| 颜色变量 | 值 | 使用场景 |
|---------|-----|---------|
| `--primary` | #6366f1 | 主按钮、选中状态、素材引用 |
| `--success` | #22c55e | 已发布状态、成功提示 |
| `--warning` | #f59e0b | 草稿状态、灵感碎片标识 |
| `--purple` | #7c3aed | 素材利用率数字 |
| `--info` | #3b82f6 | 评分条颜色 |

### 3.2 字体规范

| 元素 | 字号 | 字重 | 颜色 | CSS类名 |
|------|------|------|------|---------|
| 页面标题 | 17px | 600 | `--gray-900` | `.topbar-title` |
| 概览数字 | 28px | 700 | 多色 | `.overview-num` |
| 概览标签 | 13px | 400 | `--gray-500` | `.overview-label` |
| 文档标题 | 15px | 600 | `--gray-900` | `.doc-card-title` |
| 文档类型 | 12px | 400 | `--gray-400` | `.doc-card-type` |
| 文档摘要 | 13px | 400 | `--gray-500` | `.doc-card-excerpt` |
| 状态标签 | 11px | 500 | 对应状态色 | `.status-tag` |

### 3.3 卡片样式规范

#### 3.3.1 概览卡片

```css
.overview-card {
  background: #fff;
  border-radius: var(--radius-lg);
  border: 1px solid var(--gray-200);
  padding: 20px;
  box-shadow: var(--shadow);
  text-align: center;
}
```

#### 3.3.2 文档卡片

```css
.doc-card {
  background: #fff;
  border-radius: var(--radius-lg);
  border: 1px solid var(--gray-200);
  padding: 20px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: all 0.2s;
}

.doc-card:hover {
  border-color: var(--primary);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.12);
  transform: translateY(-1px);
}
```

#### 3.3.3 灵感碎片

```css
.scrap-item {
  background: var(--gray-50);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 10px;
  border-left: 3px solid var(--warning);
}
```

### 3.4 弹窗尺寸规范

| 尺寸类型 | CSS类名 | 最大宽度 | 适用场景 |
|---------|---------|---------|---------|
| 小弹窗 | `.modal-sm` | 440px | 快速灵感录入 |
| 中弹窗 | `.modal` | 600px | 素材匹配详情 |
| 大弹窗 | `.modal-lg` | 700px | 新建输出、AI评审、实践连接器 |

---

## 四、接口设计

### 4.1 接口清单

| 接口编号 | 接口名称 | 功能描述 | 调用方式 |
|---------|---------|---------|---------|
| **DB-R-031** | 文档列表 | 获取输出文档列表 | `output_docs.where({status}).orderBy('updatedAt','desc').get()` |
| **DB-R-032** | 文档内容 | 获取文档详情 | `output_docs.doc(docId).get()` |
| **DB-W-011** | 创建文档 | 创建新文档 | `output_docs.add({title, type, status:'draft'})` |
| **DB-U-035** | 保存文档 | 自动保存文档 | `output_docs.doc(docId).update({content, ...})` |
| **DB-U-036** | 发布文档 | 发布文档 | `output_docs.doc(docId).update({status:'published'})` |
| **DB-D-009** | 删除文档 | 删除文档 | `output_docs.doc(docId).remove()` |
| **DB-R-033** | 碎片列表 | 获取灵感碎片 | `scraps.orderBy('createdAt','desc').limit(10).get()` |
| **DB-W-012** | 创建碎片 | 创建灵感碎片 | `scraps.add({content, status:'raw'})` |
| **DB-U-037** | 更新碎片 | 更新碎片状态 | `scraps.doc(scrapId).update({status: 'converted'})` |
| **DB-D-010** | 删除碎片 | 删除碎片 | `scraps.doc(scrapId).remove()` |
| **DB-W-013** | 展开写作 | 从碎片创建文档 | `output_docs.add()` + `scraps.update()` |
| **DB-U-038** | 忽略碎片 | 忽略碎片 | `scraps.doc(scrapId).update({status:'ignored'})` |
| **AGG-005** | 知识沉淀统计 | 获取统计数据 | `output_docs.count()` + 聚合 |
| **AI-001** | AI润色 | 润色选中文字 | `app.callFunction('ai-proxy', { action: 'polish' })` |
| **AI-002** | AI续写 | 续写内容 | `app.callFunction('ai-proxy', { action: 'continue' })` |
| **AI-003** | AI扩写 | 扩写内容 | `app.callFunction('ai-proxy', { action: 'expand' })` |
| **AI-004** | AI缩写 | 缩写内容 | `app.callFunction('ai-proxy', { action: 'summarize' })` |
| **AI-005** | AI总结 | 总结全文 | `app.callFunction('ai-proxy', { action: 'summary' })` |
| **AI-006** | AI评审 | 质量评审 | `app.callFunction('ai-proxy', { action: 'review' })` |
| **AI-007** | AI生成初稿 | 生成文档初稿 | `app.callFunction('ai-proxy', { action: 'generate' })` |

### 4.2 数据模型

#### 4.2.1 `output_docs` 集合

| 字段名 | 类型 | 含义 | 默认值 |
|-------|------|------|--------|
| `_id` | string | 文档ID | 自动生成 |
| `title` | string | 文档标题 | - |
| `type` | string | 文档类型 | article/speech/note/practice/tutorial |
| `content` | string | Markdown内容 | '' |
| `status` | string | 状态 | draft/published |
| `wordCount` | number | 字数 | 0 |
| `materialCount` | number | 引用素材数 | 0 |
| `relatedKnowledge` | array | 关联知识ID列表 | [] |
| `createdAt` | timestamp | 创建时间 | 自动 |
| `updatedAt` | timestamp | 更新时间 | 自动 |

#### 4.2.2 `scraps` 集合

| 字段名 | 类型 | 含义 | 默认值 |
|-------|------|------|--------|
| `_id` | string | 碎片ID | 自动生成 |
| `content` | string | 碎片内容 | - |
| `status` | string | 状态 | raw/converted/ignored |
| `suggestedType` | string | AI推荐类型 | - |
| `outputDocId` | string | 关联文档ID | null |
| `createdAt` | timestamp | 创建时间 | 自动 |

---

## 五、组件设计

### 5.1 文档类型图标

| 类型 | 图标 | CSS类名 | 背景色 |
|------|------|---------|--------|
| 文章 | 📄 | `.type-article` | `var(--primary-light)` |
| 演讲 | 🎤 | `.type-speech` | `var(--warning-light)` |
| 笔记 | 📝 | `.type-note` | `var(--success-light)` |
| 实践 | 🔧 | `.type-practice` | `var(--danger-light)` |
| 教程 | 📘 | `.type-tutorial` | `var(--purple-light)` |

### 5.2 状态标签

| 状态 | CSS类名 | 背景色 | 文字色 |
|------|---------|--------|--------|
| 草稿 | `.status-draft` | `var(--warning-light)` | `#b45309` |
| 已发布 | `.status-published` | `var(--success-light)` | `#16a34a` |

### 5.3 评分维度颜色

| 分数范围 | 颜色 |
|---------|------|
| 80-100 | `var(--success)` |
| 60-79 | `var(--info)` |
| 40-59 | `var(--warning)` |
| 0-39 | `var(--danger)` |

---

## 六、交互设计

### 6.1 页面切换流程

```
输出列表页 ──点击文档卡片──→ 编辑器页
    ↑                              │
    └─────────返回列表──────────────┘
```

### 6.2 新建文档流程

```
点击「新建输出」→ 选择类型 → 输入标题 → 关联知识 → [生成初稿 / 手动创建]
```

### 6.3 碎片处理流程

```
灵感碎片 ──展开写作──→ 新建文档（关联碎片）
    │
    └──忽略──→ 标记为ignored状态
```

### 6.4 AI操作流程

```
编辑器输入 → 选择AI操作 → 调用AI接口 → 预览结果 → 确认插入
```

---

## 七、Mock数据设计

### 7.1 文档列表 Mock

```javascript
{
  docs: [
    {
      _id: 'doc-1',
      title: '微服务架构实战总结',
      type: 'article',
      typeLabel: '技术文章',
      excerpt: '过去半年，团队从单体架构迁移到微服务架构...',
      wordCount: 3200,
      materialCount: 3,
      status: 'published',
      updatedAt: '3天前'
    },
    {
      _id: 'doc-2',
      title: 'Go并发模型技术分享',
      type: 'speech',
      typeLabel: '技术演讲',
      excerpt: '准备在团队内做一次关于Go并发模型的技术分享...',
      wordCount: 5800,
      materialCount: 5,
      status: 'draft',
      progress: 80,
      updatedAt: '编辑中'
    }
  ],
  stats: {
    draftCount: 3,
    publishedCount: 5,
    totalWords: 28500,
    materialUtilization: 62
  }
}
```

### 7.2 灵感碎片 Mock

```javascript
{
  scraps: [
    {
      _id: 'scrap-1',
      content: '"Service Mesh 选型可以用对比表格总结，一目了然"',
      suggestedType: '技术文章',
      status: 'raw',
      createdAt: '今天'
    }
  ]
}
```

---

## 八、代码组织规范

### 8.1 文件结构

```
src/
├── pages/
│   └── output.html          # 页面HTML
├── css/
│   └── pages/
│       └── output.css       # 页面样式
├── js/
│   └── pages/
│       └── output.js        # 页面逻辑
```

### 8.2 函数命名规范

| 功能 | 函数名 |
|------|--------|
| 初始化页面 | `initOutputPage()` |
| 获取文档列表 | `fetchDocList(status)` |
| 获取统计数据 | `fetchStats()` |
| 打开编辑器 | `openEditor(docId)` |
| 关闭编辑器 | `closeEditor()` |
| 更新预览 | `updatePreview()` |
| 保存文档 | `saveDoc()` |
| 发布文档 | `publishDoc()` |
| 获取碎片列表 | `fetchScrapList()` |
| 创建碎片 | `createScrap(content)` |
| 展开写作 | `expandScrap(scrapId)` |
| AI操作 | `aiAction(action, content)` |

---

## 九、技术要点

### 9.1 Markdown 实时预览

使用简单的正则转换实现 Markdown 预览：

```javascript
function markdownToHtml(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\n/g, '<br>')
}
```

### 9.2 自动保存机制

使用防抖实现自动保存：

```javascript
let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDoc();
  }, 2000); // 2秒防抖
}
```

### 9.3 Toast 提示复用

复用项目现有 Toast 系统：

```javascript
window.toast('保存成功', 'success');
```

---

## 十、安全与性能

### 10.1 注意事项

| 风险点 | 说明 | 解决方案 |
|--------|------|---------|
| XSS攻击 | 编辑器输入可能包含恶意脚本 | 预览时进行HTML转义 |
| 数据丢失 | 编辑过程中意外关闭页面 | 自动保存 + localStorage备份 |
| 性能问题 | 大量文档列表渲染 | 虚拟滚动或分页 |
| API滥用 | AI接口调用频率限制 | 添加请求节流 |

---

*文档结束。本方案基于原型设计和技术规范，涵盖知识沉淀页面的功能、布局、样式、接口和交互设计。*
