"""
AI 智能体（验收标准 5 · 引用知识库 + 记忆）

- AGENTS：5 个预定义智能体，各自独立系统提示
- retrieve_context：检索知识库相关切片（生产走向量库，测试可注入 search_fn）
- build_agent_messages：拼装 system(含引用指令) + 历史记忆 + 当前问题
- generate_with_citations：编排 检索→拼装→调用代理→持久化记忆→回传引用
- _call_ai_proxy：调用 functions/ai-proxy 云函数（F2 已鉴权），密钥仅经 env 注入
"""
import os
import json
import urllib.request
from datetime import datetime

from agent_memory import get_agent_memory

# 5 个智能体定义（id → 名称 + 系统提示）
AGENTS = {
    'planner': {
        'name': '学习规划师',
        'prompt': '你是 StudyMind 的学习规划师，擅长根据学习目标制定阶段性计划与里程碑。',
    },
    'tutor': {
        'name': '知识讲解员',
        'prompt': '你是 StudyMind 的知识讲解员，善于用通俗类比把复杂概念讲清楚。',
    },
    'coach': {
        'name': '出题教练',
        'prompt': '你是 StudyMind 的出题教练，能基于资料设计高质量的练习题与自测题。',
    },
    'reviewer': {
        'name': '复习助手',
        'prompt': '你是 StudyMind 的复习助手，帮助归纳重点、构建知识卡片与记忆线索。',
    },
    'writer': {
        'name': '写作助手',
        'prompt': '你是 StudyMind 的写作助手，能基于参考资料撰写结构清晰的文章与笔记。',
    },
}


def default_search(query: str, top_k: int = 5, min_similarity: float = 0.3):
    """生产检索：向量化查询后调用 ChromaDB 相似度搜索（懒加载重依赖）"""
    from embedder import embed_query
    from vector_store import search
    return search(embed_query(query), top_k=top_k, min_similarity=min_similarity)


def retrieve_context(query: str, search_fn=None, top_k: int = 5):
    """检索知识库上下文。search_fn(query, top_k) -> list[chunk]"""
    fn = search_fn or default_search
    return fn(query, top_k=top_k)


def build_agent_messages(agent_id: str, query: str, context_chunks: list, history: list) -> list:
    """
    拼装发送给 LLM 的 messages：
      - system：智能体人设 + 引用指令 + 参考资料片段
      - history：该 agent 的历史记忆（已隔离）
      - user：当前问题
    """
    agent = AGENTS.get(agent_id, {'name': '助手', 'prompt': '你是一个有帮助的助手。'})

    refs = '\n'.join(
        f"- 《{c.get('metadata', {}).get('title', '')}》: {c.get('content', '')[:300]}"
        for c in context_chunks
    ) or '（无相关参考资料）'

    system = (
        f"你是{agent['name']}。{agent['prompt']}\n\n"
        f"请优先基于下方【参考资料】回答用户问题，并在回答中通过 "
        f"`[source: 资料标题]` 的形式标注所引用的来源；若资料不足，请如实说明。\n\n"
        f"【参考资料】\n{refs}"
    )

    messages = [{'role': 'system', 'content': system}]
    for h in history:
        messages.append({'role': h.get('role', 'user'), 'content': h.get('content', '')})
    messages.append({'role': 'user', 'content': query})
    return messages


def _call_ai_proxy(messages: list, model: str = 'silicon') -> dict:
    """
    调用 functions/ai-proxy 云函数。
    鉴权 token 与环境变量 AI_PROXY_TOKEN 一并下发；密钥仅由云函数从 env 读取。
    """
    url = os.environ.get('AI_PROXY_URL')
    token = os.environ.get('AI_PROXY_TOKEN', '')
    if not url:
        raise RuntimeError('AI_PROXY_URL 未配置（部署时需设置）')
    payload = json.dumps({
        'messages': messages,
        'model': model,
        'callerToken': token,
    }).encode('utf-8')
    req = urllib.request.Request(
        url, data=payload,
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    return {'content': data.get('content', '')}


def generate_with_citations(agent_id: str, query: str, *,
                            embed_fn=None, search_fn=None, call_fn=None,
                            memory=None, top_k: int = 5, model: str = 'silicon') -> dict:
    """
    端到端生成：检索知识库 → 拼装带记忆的 prompt → 调用代理 → 持久化记忆 → 回传引用。

    依赖均可注入，便于测试：
      - search_fn(query, top_k)       检索函数
      - call_fn(messages, model)      代理调用函数
      - memory                         AgentMemory 实例（默认进程单例）
    """
    mem = memory or get_agent_memory()
    history = mem.get_history(agent_id)

    context = retrieve_context(query, search_fn=search_fn, top_k=top_k)
    messages = build_agent_messages(agent_id, query, context, history)

    if call_fn is None:
        call_fn = _call_ai_proxy
    reply = call_fn(messages, model=model)
    content = reply.get('content', '') if isinstance(reply, dict) else str(reply)

    # 持久化记忆（不同 agent 各自隔离）
    mem.add(agent_id, 'user', query)
    mem.add(agent_id, 'assistant', content)

    # 引用：直接来自检索到的知识库切片（与 LLM 输出无关，确保"引用可用"可判定）
    citations = [{
        'source_doc_id': c.get('metadata', {}).get('source_doc_id'),
        'title': c.get('metadata', {}).get('title'),
        'snippet': c.get('content', '')[:200],
    } for c in context]

    return {
        'content': content,
        'citations': citations,
        'agent_id': agent_id,
        'context_count': len(context),
    }
