"""
验收标准 5 · 后端 AI：引用知识库 + 5 智能体记忆隔离
覆盖：
- AI 检索引用可用：generate_with_citations 返回基于知识库检索的 citations
- 5 个智能体各自的对话历史持久化且相互隔离
- 记忆持久化（落盘后重新加载可读回）
"""
import os
import tempfile

from agent_memory import AgentMemory
from ai_agent import AGENTS, generate_with_citations


def _tmp_memory():
    path = os.path.join(tempfile.mkdtemp(), 'agent_memory.json')
    return AgentMemory(path=path)


def test_five_agents_defined():
    assert set(AGENTS.keys()) == {'planner', 'tutor', 'coach', 'reviewer', 'writer'}
    assert len(AGENTS) == 5


def test_memory_isolation_across_five_agents():
    mem = _tmp_memory()
    # 每个智能体写入各自专属消息
    for aid in AGENTS:
        mem.add(aid, 'user', f'msg-from-{aid}')

    hist = {aid: mem.get_history(aid) for aid in AGENTS}
    for aid in AGENTS:
        assert len(hist[aid]) == 1
        assert hist[aid][0]['content'] == f'msg-from-{aid}'

    # 隔离验证：任何 agent 的历史都不应包含其他 agent 的消息
    for aid in AGENTS:
        for other in AGENTS:
            if other != aid:
                assert all(h['content'] != f'msg-from-{aid}' for h in hist[other])


def test_memory_persistence():
    path = os.path.join(tempfile.mkdtemp(), 'persist.json')
    m1 = AgentMemory(path=path)
    m1.add('tutor', 'user', '持久化测试消息')
    # 重新加载（模拟重启）
    m2 = AgentMemory(path=path)
    assert len(m2.get_history('tutor')) == 1
    assert m2.get_history('tutor')[0]['content'] == '持久化测试消息'


def test_ai_retrieval_citation_usable():
    # 注入检索：返回一条知识库切片
    def fake_search(query, top_k=5):
        return [{
            'content': '量子纠缠是指两个粒子存在关联，测量一个会瞬时影响另一个。',
            'metadata': {'source_doc_id': 'kb_quantum', 'title': '量子力学笔记'}
        }]

    # 注入代理调用：返回包含引用标记的内容
    def fake_call(messages, model='silicon'):
        return {'content': '根据资料[source: 量子力学笔记]，量子纠缠是指两个粒子存在关联。'}

    mem = _tmp_memory()
    result = generate_with_citations(
        'tutor', '什么是量子纠缠',
        search_fn=fake_search, call_fn=fake_call, memory=mem
    )

    # 引用来自知识库检索结果（与 LLM 输出无关，确保"引用可用"可判定）
    assert len(result['citations']) == 1
    assert result['citations'][0]['title'] == '量子力学笔记'
    assert result['citations'][0]['source_doc_id'] == 'kb_quantum'
    # 生成内容可用且包含引用
    assert '量子纠缠' in result['content']
    assert '量子力学笔记' in result['content']
    # 记忆已持久化该轮对话（user + assistant 两条）
    assert len(mem.get_history('tutor')) == 2
    # 其他智能体不受影响（隔离）
    assert mem.get_history('planner') == []


def test_agent_history_limit():
    mem = _tmp_memory()
    for i in range(5):
        mem.add('reviewer', 'user', f'q{i}')
    # limit 截取最近 N 条
    recent = mem.get_history('reviewer', limit=2)
    assert len(recent) == 2
    assert recent[-1]['content'] == 'q4'
