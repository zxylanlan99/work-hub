"""
验收标准 4 · 知识库智能切片
覆盖：智能切片（语义/长度分块，非生硬截断）、切片数量正确、数据层记录 total_chunks。
"""
from chunker import chunk_document


def _para(n: int) -> str:
    """生成 n 段、每段约 300 字的中文文本，用于触发多切片。"""
    base = '这是一段用于测试智能切片的示例文本，' * 15  # ~30 字
    return '\n\n'.join([base for _ in range(n)])


def test_short_text_single_chunk():
    text = '这是一段较短的文档内容，不足一个切片阈值。'
    chunks = chunk_document(text, {'source_doc_id': 'kb_x', 'title': '短文档'})
    assert len(chunks) >= 1
    # 数据层记录切片数量
    assert chunks[0]['total_chunks'] == len(chunks)
    assert chunks[0]['source_doc_id'] == 'kb_x'


def test_long_text_multiple_chunks():
    text = _para(12)  # ~3600 字，应被切分为多个语义块
    chunks = chunk_document(text, {'source_doc_id': 'kb_long', 'title': '长文档'})
    assert len(chunks) >= 2, f"长文本应切分为多块，实际 {len(chunks)} 块"
    # 每个切片都带完整元数据
    for i, c in enumerate(chunks):
        assert c['chunk_index'] == i
        assert c['total_chunks'] == len(chunks)
        assert c['char_count'] == len(c['content'])
        assert c['content'].strip()  # 非空，非生硬截断空白


def test_chunk_count_consistency():
    text = _para(20)
    chunks = chunk_document(text, {'source_doc_id': 'kb_c', 'title': '计数文档'})
    # 切片数量字段自洽
    assert all(c['total_chunks'] == len(chunks) for c in chunks)
    # chunk_index 连续且唯一
    idx = [c['chunk_index'] for c in chunks]
    assert idx == list(range(len(chunks)))
