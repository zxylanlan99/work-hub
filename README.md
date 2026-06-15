# StudyMind

个人学习管理系统

## 项目简介

StudyMind（学思）是一款帮助用户系统化管理个人学习的工具，聚焦于学习计划、知识管理、AI辅助和复习巩固四大核心功能。

## 技术栈

- **前端**：纯 HTML/CSS/JavaScript（无框架）
- **后端**：腾讯 CloudBase（NoSQL + 云函数 + Auth）
- **AI**：MiMo + DeepSeek + Kimi + 豆包

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 测试
npm run test
```

## 项目结构

```
StudyMind_TRAE_V1.1/
├── docs/          # 项目文档
├── src/           # 源代码
├── prototypes/    # 原型文件
├── tests/         # 测试文件
├── scripts/       # 构建脚本
└── config/        # 配置文件
```

## 功能模块

1. **首页** - 仪表盘、暖身引擎、智能续接
2. **学习计划** - 目标/里程碑/任务管理
3. **知识库** - 三级分类、知识条目CRUD
4. **AI对话** - 多模型对话、收藏入库
5. **复习计划** - SM-2算法自适应复习
6. **知识沉淀** - 输出文档、碎片收集
7. **资讯** - AI筛选、入库确认
8. **系统设置** - AI配置、通知管理

## 文档

- [需求文档](docs/requirements/)
- [设计文档](docs/design/)
- [规划文档](docs/plan/)
- [项目规则](docs/project-rules.md)

## 版本历史

详见 [CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT
