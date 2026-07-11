"""StudyMind V1.x → V2.0 知识库向量重建（T17 / 上线加固）。

================================================================================
V1.x 使用 all-MiniLM 的 ChromaDB 切片因模型更换（BGE-M3）无法无损迁移，
必须丢弃旧向量、重新切片/向量化（架构 §7 T17 明确：旧 ChromaDB 向量直接丢弃）。

流程（幂等）：
  ① 从 Postgres 读取 knowledge_items（id / title / content / summary / backend_collection_id）。
  ② 逐条经 kb-service 的 FastGPT 后端（get_kb_backend）重新切片/向量化（BGE-M3）。
  ③ 写回 backend_collection_id（FastGPT 数据集 id）与 chunk_count 估计。
  ④ 旧 ChromaDB 向量不读取、直接丢弃（仅重建）。

运行前提（需 FastGPT + Qdrant 运行，本环境无，勿硬跑）：
  * 依赖：pip install fastapi uvicorn pydantic httpx sqlalchemy psycopg2-binary python-dotenv
  * 环境变量：
      FASTGPT_API_KEY / FASTGPT_API_URL   （kb-service 配置，见 app/config）
      SQLALCHEMY_DATABASE_URL            （共享 Postgres，缺省 studymind）
  * --dry-run 不需要 FastGPT / Postgres 写入：仅统计将重建的条目数并打印计划。

用法：
  python scripts/reembed_v1.py --dry-run
  python scripts/reembed_v1.py
  python scripts/reembed_v1.py --dataset-name studymind_kb_v2 --force
================================================================================
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import List, Optional

# 让脚本可直接以 `python scripts/reembed_v1.py` 运行（无需 pip install -e）。
# 脚本位于 services/kb-service/scripts/，上两级即 kb-service 包目录（含 app/）。
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from sqlalchemy import create_engine, text  # noqa: E402

# 注意：FastGPT 后端（get_kb_backend）在 reembed() 内惰性导入，
# 使 --dry-run 在缺少 httpx / FastGPT 依赖时也能安全预演。

DEFAULT_DB_URL = os.getenv(
    "SQLALCHEMY_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/studymind",
)
# chunk 长度估计（FastGPT 默认 ~500 字符/片，仅用于回填 chunk_count 展示）。
CHUNK_SIZE_CHARS = 500


def read_knowledge_items(engine, only_missing: bool) -> List[dict]:
    """读取 knowledge_items 文本（只读，不修改）。"""
    with engine.connect() as conn:
        if only_missing:
            rows = conn.execute(
                text(
                    "SELECT id, title, content, summary, backend_collection_id "
                    "FROM knowledge_items WHERE backend_collection_id IS NULL OR backend_collection_id = ''"
                )
            ).fetchall()
        else:
            rows = conn.execute(
                text(
                    "SELECT id, title, content, summary, backend_collection_id "
                    "FROM knowledge_items"
                )
            ).fetchall()
    return [
        {
            "id": r[0],
            "title": r[1],
            "content": r[2],
            "summary": r[3],
            "backend_collection_id": r[4],
        }
        for r in rows
    ]


def estimate_chunk_count(content: str) -> int:
    text_len = len((content or "").strip())
    if text_len == 0:
        return 0
    return max(1, (text_len + CHUNK_SIZE_CHARS - 1) // CHUNK_SIZE_CHARS)


async def reembed(
    engine,
    items: List[dict],
    dataset_name: str,
    dry_run: bool,
) -> dict:
    """重建向量：创建 FastGPT 数据集 → 逐条上传 → 写回 backend_collection_id。

    返回统计 {total, embedded, skipped, failed}。
    """
    stats = {"total": len(items), "embedded": 0, "skipped": 0, "failed": 0}
    if not items:
        return stats

    # 惰性导入 FastGPT 后端（C3：仅数据集/文档/检索，无 Agent）。
    from app.fastgpt_client import get_kb_backend

    backend = get_kb_backend()
    dataset_id = await backend.create_dataset(dataset_name) if not dry_run else "DRY-RUN"

    for it in items:
        if dry_run:
            stats["embedded"] += 1
            continue
        try:
            content = it["content"] or it["summary"] or ""
            if not content.strip():
                stats["skipped"] += 1
                continue
            await backend.upload_document(dataset_id, it["title"] or "", content)
            chunk_count = estimate_chunk_count(content)
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "UPDATE knowledge_items "
                        "SET backend_collection_id = :cid, chunk_count = :cc WHERE id = :id"
                    ),
                    {"cid": dataset_id, "cc": chunk_count, "id": it["id"]},
                )
            stats["embedded"] += 1
        except Exception as exc:  # 单条失败不阻断其余
            print(f"  [reembed] knowledge_item {it['id']} 失败：{exc}")
            stats["failed"] += 1
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="StudyMind 知识库向量重建（BGE-M3）")
    parser.add_argument("--dry-run", action="store_true", help="仅统计将重建的条目数，不调用 FastGPT/写入")
    parser.add_argument("--dataset-name", default="studymind_kb_v2", help="FastGPT 数据集名称")
    parser.add_argument(
        "--force",
        action="store_true",
        help="强制重建全部（默认仅重建 backend_collection_id 为空的条目）",
    )
    args = parser.parse_args()

    print("=== StudyMind 知识库向量重建（V1.x all-MiniLM → V2.0 BGE-M3）===")

    if args.dry_run:
        # 安全预演：不连接 Postgres / 不调用 FastGPT。
        scope = "全部 knowledge_items" if args.force else "backend_collection_id 为空的 knowledge_items"
        print(f"[DRY-RUN] 将重建 {scope}（数据集名={args.dataset_name}）。")
        print("[DRY-RUN] 不连接 Postgres，不调用 FastGPT，不写入。完成。")
        return 0

    engine = create_engine(DEFAULT_DB_URL, future=True)
    items = read_knowledge_items(engine, only_missing=not args.force)

    stats = asyncio.run(reembed(engine, items, args.dataset_name, dry_run=False))
    print(
        f"完成：total={stats['total']} embedded={stats['embedded']} "
        f"skipped={stats['skipped']} failed={stats['failed']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
