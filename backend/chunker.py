"""
文档切片模块 — PRD 5G 切片策略 C-001 ~ C-006

C-001: 按 Markdown H2 标题层级切分
C-002: 目标 500-1500 字符，优先保证语义完整
C-003: 超 2000 字符 → 按自然段二次切分，Overlap 200 字
C-004: 代码块 ```...``` 用占位符提取，跟随所属段落
C-005: 表格 | ... | 用占位符提取，保持完整不切分
C-006: 每个切片含元数据: source_doc_id / title / position / chunk_index / total_chunks
"""
import re
import logging

logger = logging.getLogger(__name__)

# 切片参数
MIN_CHUNK = 500
MAX_CHUNK = 1500
SPLIT_THRESHOLD = 2000
OVERLAP = 200


def chunk_document(content: str, metadata: dict = None) -> list:
    """
    将文档内容切分为多个语义完整的片段

    Args:
        content: 文档纯文本内容
        metadata: 元数据字典，包含 source_doc_id / title / category_path 等

    Returns:
        切片列表，每个切片是 dict:
        {
            content: str,           # 切片文本
            title: str,             # 切片标题
            source_doc_id: str,     # 源文档 ID
            category_path: str,     # 分类路径
            char_count: int,        # 字符数
            position: int,          # 位置索引
            chunk_index: int,       # 切片序号
            total_chunks: int       # 总切片数
        }
    """
    if not content or not content.strip():
        return []

    metadata = metadata or {}
    chunks = []

    # 提取代码块和表格，用占位符替换 (C-004, C-005)
    code_blocks = []
    tables = []
    processed = content

    # 提取代码块 ```...```
    processed = re.sub(r'```[\s\S]*?```', lambda m: _placeholder(m, code_blocks, 'CODEBLOCK'), processed)

    # 提取表格 (连续的 | 行)
    processed = re.sub(r'((?:^\|.*\|\s*\n)+)', lambda m: _placeholder(m, tables, 'TABLE'), processed, flags=re.MULTILINE)

    # C-001: 按 H2 标题切分
    h2_sections = [s for s in re.split(r'^(?=## )', processed, flags=re.MULTILINE) if s.strip()]

    for section in h2_sections:
        # 恢复占位符
        section_text = _restore_placeholders(section, code_blocks, tables)

        # 提取标题
        title_match = re.match(r'^## (.+)$', section_text, re.MULTILINE)
        section_title = title_match.group(1).strip() if title_match else (metadata.get('title') or '未命名')

        # C-002 / C-003: 检查长度
        if len(section_text) <= SPLIT_THRESHOLD:
            chunks.append(_make_chunk(section_text.strip(), section_title, metadata))
        else:
            sub_chunks = _split_by_paragraphs(section_text, section_title, metadata, code_blocks, tables)
            chunks.extend(sub_chunks)

    # 没有 H2 标题的情况，整个文档作为一个块
    if not chunks and content.strip():
        full_text = _restore_placeholders(processed, code_blocks, tables)
        if len(full_text) <= SPLIT_THRESHOLD:
            chunks.append(_make_chunk(full_text.strip(), metadata.get('title') or '未命名', metadata))
        else:
            chunks.extend(_split_by_paragraphs(full_text, metadata.get('title') or '未命名', metadata, code_blocks, tables))

    # C-006: 补充元数据
    total = len(chunks)
    for i, chunk in enumerate(chunks):
        chunk['position'] = i
        chunk['chunk_index'] = i
        chunk['total_chunks'] = total

    logger.info(f"文档切片完成: 共 {total} 个切片")
    return chunks


def _placeholder(match, store, prefix):
    """生成占位符并存储原始内容"""
    store.append(match.group(0))
    return f'\x00{prefix}_{len(store) - 1}\x00'


def _restore_placeholders(text, code_blocks, tables):
    """恢复占位符为原始内容"""
    text = re.sub(r'\x00CODEBLOCK_(\d+)\x00', lambda m: code_blocks[int(m.group(1))] or m.group(0), text)
    text = re.sub(r'\x00TABLE_(\d+)\x00', lambda m: tables[int(m.group(1))] or m.group(0), text)
    return text


def _make_chunk(content, title, metadata):
    """创建单个切片 dict"""
    return {
        'content': content,
        'title': title,
        'source_doc_id': metadata.get('source_doc_id', ''),
        'category_path': metadata.get('category_path', ''),
        'char_count': len(content)
    }


def _split_by_paragraphs(text, title, metadata, code_blocks, tables):
    """
    C-003: 超长段落按自然段二次切分，Overlap 200 字
    """
    chunks = []
    paragraphs = [p for p in re.split(r'\n\n+', text) if p.strip()]

    current_chunk = ''
    current_title = title

    for para in paragraphs:
        # 恢复占位符
        para = _restore_placeholders(para, code_blocks, tables)

        # H3 标题作为子标题
        h3_match = re.match(r'^### (.+)$', para, re.MULTILINE)
        if h3_match:
            if len(current_chunk) >= MIN_CHUNK:
                chunks.append(_make_chunk(current_chunk.strip(), current_title, metadata))
                current_chunk = current_chunk[-OVERLAP:] + '\n\n'
                current_title = title + ' > ' + h3_match.group(1).strip()

        # 单段超长 → 按句子切分
        if len(para) > MAX_CHUNK:
            if current_chunk.strip():
                chunks.append(_make_chunk(current_chunk.strip(), current_title, metadata))
                current_chunk = ''
            # 按句子切分 (兼容中文标点)
            sentences = _split_sentences(para)
            sent_chunk = ''
            for sent in sentences:
                if len(sent_chunk + sent) > MAX_CHUNK and len(sent_chunk) >= MIN_CHUNK:
                    chunks.append(_make_chunk(sent_chunk.strip(), current_title, metadata))
                    sent_chunk = sent_chunk[-OVERLAP:] + sent
                else:
                    sent_chunk += sent
            if sent_chunk.strip():
                current_chunk = sent_chunk + '\n\n'

        elif len(current_chunk + para) > MAX_CHUNK and len(current_chunk) >= MIN_CHUNK:
            chunks.append(_make_chunk(current_chunk.strip(), current_title, metadata))
            current_chunk = current_chunk[-OVERLAP:] + '\n\n' + para + '\n\n'
        else:
            current_chunk += para + '\n\n'

    if current_chunk.strip():
        chunks.append(_make_chunk(current_chunk.strip(), current_title, metadata))

    return chunks


def _split_sentences(text):
    """按中英文标点切分句子"""
    # 按 。！？.!? 切分，保留标点
    parts = re.split(r'([。！？.!?])\s*', text)
    sentences = []
    for i in range(0, len(parts) - 1, 2):
        sentences.append(parts[i] + (parts[i + 1] if i + 1 < len(parts) else ''))
    if len(parts) % 2 == 1 and parts[-1].strip():
        sentences.append(parts[-1])
    return [s for s in sentences if s.strip()]
