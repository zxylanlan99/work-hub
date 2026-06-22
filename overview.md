# 知识库后端处理能力实现

## 完成内容

为知识库模块搭建了完整的 Python 后端处理流水线，替代之前的浏览器端解析方案。

## 架构

```
前端 SPA ──HTTP API──> Python FastAPI 后端
                            ├── file_parser.py  (PDF/PPT/Word/MD/TXT 解析)
                            ├── chunker.py      (PRD 5G 切片策略)
                            ├── embedder.py     (all-MiniLM-L6-v2 向量化)
                            └── vector_store.py (ChromaDB 存储 + 余弦相似度搜索)
```

## 新增文件

| 文件 | 说明 |
|------|------|
| `backend/app.py` | FastAPI 主应用，6 个 API 路由，后台异步处理 |
| `backend/config.py` | 配置 (模型路径/ChromaDB/上传目录/搜索参数) |
| `backend/file_parser.py` | 文件解析 (PyMuPDF/python-pptx/python-docx) |
| `backend/chunker.py` | 文档切片 (PRD 5G C-001~C-006) |
| `backend/embedder.py` | 向量化 (sentence-transformers, 384维) |
| `backend/vector_store.py` | ChromaDB CRUD (余弦相似度, 阈值过滤) |
| `backend/requirements.txt` | Python 依赖 |
| `backend/start.sh` | 启动脚本 |

## 修改文件

| 文件 | 改动 |
|------|------|
| `src/js/config.js` | 增加 `kbBackend.baseURL` 配置 |
| `src/js/db.js` | 删除浏览器端解析方法, 新增 7 个后端 API 调用方法 |
| `src/pages/knowledge.html` | 上传流程改为异步轮询, 删除联动后端 |
| `.gitignore` | 排除 backend/.venv, uploads, chroma_data |

## API 接口

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/knowledge/upload` | POST | 上传文件，立即返回 taskId，后台异步处理 |
| `/api/knowledge/status/{taskId}` | GET | 查询处理状态（前端轮询） |
| `/api/knowledge/search` | POST | 向量搜索（余弦相似度，过滤低相关性） |
| `/api/knowledge/{itemId}` | DELETE | 删除（文件+向量+记录一起删） |
| `/api/knowledge/chunks/{itemId}` | GET | 获取文档切片列表 |
| `/api/knowledge/stats` | GET | 统计信息 |

## 启动方式

```bash
cd backend && ./start.sh
# 监听: http://localhost:8765
# API文档: http://localhost:8765/docs
```

## 待办

- 等待 pip install 完成后验证后端启动
- 前端联调测试
