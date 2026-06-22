const CONFIG = {
  cloudbase: {
    env: 'studymind-d7g06nv0de98a1f1b',
    region: 'ap-shanghai'
  },
  // 知识库后端 (Python FastAPI + ChromaDB + all-MiniLM-L6-v2)
  kbBackend: {
    baseURL: 'http://localhost:8765',
    // 搜索默认参数
    searchTopK: 10,
    minSimilarity: 0.3
  }
};