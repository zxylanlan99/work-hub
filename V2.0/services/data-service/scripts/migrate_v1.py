"""StudyMind V1.x → V2.0 数据迁移脚本（T17 / 上线加固）。

================================================================================
本脚本做两件事，且均幂等、可重复执行：
  ① ALTER news_items 补齐 T08 新增列（status / backend_collection_id / chunk_count）。
     create_all 不会 ALTER 既有表，故必须显式迁移；先探测列是否存在，已存在则跳过。
  ② 将 V1.x CloudBase 集合导出 → 写入本地 Postgres（data-service 记录源）。
     读取端使用 CloudBase Python SDK（需凭证）；写入端复用本服务 ORM（默认 Postgres）。
     按各集合自然键 upsert，已存在则跳过，不删源数据。

运行前提（本环境无 CloudBase 凭证，勿硬跑）：
  * 依赖：pip install cloudbase psycopg2-binary sqlalchemy python-dotenv
  * 环境变量：
      CLOUDBASE_ENV_ID / CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY
      SQLALCHEMY_DATABASE_URL  （缺省 postgresql://postgres:postgres@localhost:5432/studymind）
  * --dry-run 不需要任何连接：仅打印迁移计划后退出（安全预演）。

用法：
  python scripts/migrate_v1.py --dry-run            # 安全预演（打印计划，不连库）
  python scripts/migrate_v1.py --only-alter         # 仅执行 ALTER（连本地 Postgres）
  python scripts/migrate_v1.py                      # 全量：ALTER + CloudBase→Postgres
  python scripts/migrate_v1.py --skip-cloudbase     # 仅 ALTER，跳过 CloudBase 导入
================================================================================
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import Dict, List, Optional

# 让脚本可直接以 `python scripts/migrate_v1.py` 运行（无需 pip install -e）。
# 脚本位于 services/data-service/scripts/，上两级即 data-service 包目录（含 app/）。
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from sqlalchemy import inspect, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.db import Base, SQLALCHEMY_DATABASE_URL  # noqa: E402
from app import models  # noqa: E402  (确保表注册到 Base.metadata)


# --------------------------------------------------------------------------- #
# ① ALTER news_items（幂等）
# --------------------------------------------------------------------------- #
NEW_COLUMNS: List[Dict[str, str]] = [
    {"name": "status", "ddl": "VARCHAR(32) NOT NULL DEFAULT 'new'"},
    {"name": "backend_collection_id", "ddl": "VARCHAR(255)"},
    {"name": "chunk_count", "ddl": "INTEGER"},
]


def alter_news_items(engine, dry_run: bool = False) -> None:
    """为 news_items 补齐 T08 列；幂等（已存在则跳过）。"""
    inspector = inspect(engine)
    existing = {c["name"] for c in inspector.get_columns("news_items")}
    with engine.begin() as conn:
        for col in NEW_COLUMNS:
            if col["name"] in existing:
                print(f"  [alter] news_items.{col['name']} 已存在，跳过")
                continue
            ddl = f'ALTER TABLE news_items ADD COLUMN {col["name"]} {col["ddl"]}'
            if dry_run:
                print(f"  [alter][DRY-RUN] 将执行: {ddl}")
            else:
                conn.execute(text(ddl))
                print(f"  [alter] 已添加 news_items.{col['name']}")


# --------------------------------------------------------------------------- #
# ② CloudBase → Postgres（幂等 upsert，--dry-run 仅统计）
# --------------------------------------------------------------------------- #
# V1.x CloudBase 集合 → V2.0 Postgres 表（仅迁移保留清单集合）。
# natural_key：用于幂等判重的字段（V2 列名）。写库按 (table, natural_key) 存在则跳过。
COLLECTION_MAP: Dict[str, Dict[str, object]] = {
    "goals": {"table": "study_goals", "natural_key": ["title"]},
    "milestones": {"table": "study_milestones", "natural_key": ["goal_id", "title"]},
    "tasks": {"table": "study_tasks", "natural_key": ["milestone_id", "title"]},
    "review_cards": {"table": "review_cards", "natural_key": ["knowledge_item_id", "question"]},
    "knowledge_items": {"table": "knowledge_items", "natural_key": ["source_ref"]},
    "categories": {"table": "categories", "natural_key": ["name", "parent_id"]},
    "news_items": {"table": "news_items", "natural_key": ["url"]},
    "output_docs": {"table": "output_docs", "natural_key": ["title"]},
    "agent_skills": {"table": "agent_skills", "natural_key": ["name"]},
    "custom_agents": {"table": "custom_agents", "natural_key": ["name"]},
}

# V1.x 字段（多为驼峰）→ V2.0 列（snake_case）映射；未列者按同名小写回退处理。
FIELD_MAP: Dict[str, str] = {
    "_id": None,  # 主键不迁移（V2 用 serial id）
    "id": None,
    "title": "title",
    "name": "name",
    "description": "description",
    "content": "content",
    "summary": "summary",
    "url": "url",
    "source": "source",
    "question": "question",
    "answer": "answer",
    "cardType": "card_type",
    "card_type": "card_type",
    "categoryId": "category_id",
    "category_id": "category_id",
    "sourceType": "source_type",
    "source_type": "source_type",
    "sourceRef": "source_ref",
    "source_ref": "source_ref",
    "goalId": "goal_id",
    "goal_id": "goal_id",
    "milestoneId": "milestone_id",
    "milestone_id": "milestone_id",
    "parentId": "parent_id",
    "parent_id": "parent_id",
    "hasRead": "has_read",
    "has_read": "has_read",
    "isFavorited": "is_favorited",
    "is_favorited": "is_favorited",
    "importedToKb": "imported_to_kb",
    "imported_to_kb": "imported_to_kb",
    "status": "status",
    "backendCollectionId": "backend_collection_id",
    "backend_collection_id": "backend_collection_id",
    "chunkCount": "chunk_count",
    "chunk_count": "chunk_count",
    "prompt": "prompt",
    "tools": "tools",
    "scope": "scope",
    "builtin": "builtin",
    "skillIds": "skill_ids",
    "skill_ids": "skill_ids",
    "knowledgeScope": "knowledge_scope",
    "knowledge_scope": "knowledge_scope",
    "model": "model",
    "targetDate": "target_date",
    "target_date": "target_date",
    "dueDate": "due_date",
    "due_date": "due_date",
    "done": "done",
    "publishedAt": "published_at",
    "published_at": "published_at",
    "createdAt": "created_at",
    "created_at": "created_at",
    "updatedAt": "updated_at",
    "updated_at": "updated_at",
}


def _snake(key: str) -> Optional[str]:
    """V1 驼峰字段 → V2 snake 列名；返回 None 表示忽略。"""
    if key in FIELD_MAP:
        return FIELD_MAP[key]
    # 未显式映射：驼峰转蛇形后回退（V1 多数已是驼峰，V2 为蛇形）
    s = "".join("_" + c.lower() if c.isupper() else c for c in key)
    return s.lstrip("_")


def _coerce(value: object, col_type: str) -> object:
    """按目标列类型做基础清洗（布尔默认 / 列表序列化 / None 透传）。"""
    if value is None:
        return None
    if col_type in ("Boolean", "boolean"):
        return bool(value)
    if col_type in ("JSON", "json"):
        import json

        return json.dumps(value) if not isinstance(value, str) else value
    return value


def _read_cloudbase(collection: str) -> List[dict]:
    """从 CloudBase 读取集合全部文档（惰性导入 SDK，无凭证时在调用处抛错）。"""
    try:
        from cloudbase import CloudBase  # 官方 Python SDK（pip install cloudbase）
    except ImportError:
        raise RuntimeError(
            "未安装 CloudBase SDK：请 `pip install cloudbase` 后重试（仅迁移 CloudBase 时需要）。"
        )
    env_id = os.getenv("CLOUDBASE_ENV_ID")
    secret_id = os.getenv("CLOUDBASE_SECRET_ID")
    secret_key = os.getenv("CLOUDBASE_SECRET_KEY")
    if not (env_id and secret_id and secret_key):
        raise RuntimeError(
            "缺少 CloudBase 凭证：请设置 CLOUDBASE_ENV_ID / CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY。"
        )
    app = CloudBase(env_id, secret_id, secret_key)
    db = app.database()
    docs: List[dict] = []
    # CloudBase 分页拉取（每页 100）。
    offset = 0
    while True:
        page = db.collection(collection).limit(100).skip(offset).get()
        records = page.get("data", []) if isinstance(page, dict) else page
        if not records:
            break
        docs.extend(records)
        if len(records) < 100:
            break
        offset += 100
    return docs


def _upsert_collection(session, collection: str, dry_run: bool) -> int:
    """将单个 CloudBase 集合 upsert 进 Postgres；返回新增行数。"""
    meta = COLLECTION_MAP[collection]
    table = meta["table"]
    natural_key = meta["natural_key"]
    table_obj = Base.metadata.tables.get(table)
    if table_obj is None:
        print(f"  [migrate] 跳过未知表 {table}（集合 {collection}）")
        return 0

    docs = _read_cloudbase(collection)
    col_types = {c.name: str(c.type) for c in table_obj.columns}
    inserted = 0
    for doc in docs:
        values: Dict[str, object] = {}
        for k, v in doc.items():
            col = _snake(k)
            if not col or col not in col_types:
                continue
            values[col] = _coerce(v, col_types[col])
        # 自然键判重
        filters = {nk: values.get(nk) for nk in natural_key}
        exists = session.query(table_obj).filter_by(**filters).first() if all(
            f is not None for f in filters.values()
        ) else None
        if exists:
            continue
        if dry_run:
            inserted += 1
            continue
        session.execute(table_obj.insert().values(**values))
        inserted += 1
    if not dry_run:
        session.commit()
    return inserted


def migrate_cloudbase_to_postgres(engine, dry_run: bool) -> None:
    """遍历 COLLECTION_MAP，将 V1.x 集合 upsert 进 Postgres。"""
    SessionLocal = sessionmaker(bind=engine, future=True)
    session = SessionLocal()
    try:
        for collection in COLLECTION_MAP:
            try:
                n = _upsert_collection(session, collection, dry_run)
            except Exception as exc:  # 单集合失败不阻断其它集合
                print(f"  [migrate] 集合 {collection} 失败：{exc}")
                session.rollback()
                continue
            label = "将导入" if dry_run else "已导入"
            print(f"  [migrate] {collection} -> {COLLECTION_MAP[collection]['table']}: {label} {n} 行")
    finally:
        session.close()


# --------------------------------------------------------------------------- #
# 入口
# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(description="StudyMind V1.x → V2.0 迁移")
    parser.add_argument("--dry-run", action="store_true", help="仅打印迁移计划，不连任何数据库")
    parser.add_argument("--only-alter", action="store_true", help="仅执行 ALTER news_items")
    parser.add_argument("--skip-cloudbase", action="store_true", help="跳过 CloudBase 导入")
    args = parser.parse_args()

    print("=== StudyMind 迁移（V1.x → V2.0）===")
    if args.dry_run:
        print("[DRY-RUN] 不连接任何数据库，仅打印计划。")
        print("  ① ALTER news_items 将补齐列：")
        for col in NEW_COLUMNS:
            print(f"     - {col['name']} ({col['ddl']})")
        print("  ② CloudBase → Postgres 将迁移集合（需凭证，预演不连接）：")
        for c, m in COLLECTION_MAP.items():
            print(f"     - {c} -> {m['table']} (natural_key={m['natural_key']})")
        print("[DRY-RUN] 完成。使用无 --dry-run 的真实运行需在具备 Postgres/CloudBase 凭证环境执行。")
        return 0

    from sqlalchemy import create_engine

    engine = create_engine(SQLALCHEMY_DATABASE_URL, future=True)

    print("  ① ALTER news_items（幂等）")
    alter_news_items(engine, dry_run=False)

    if args.only_alter or args.skip_cloudbase:
        print("  ② 跳过 CloudBase 导入（--only-alter / --skip-cloudbase）。")
        print("完成。")
        return 0

    print("  ② CloudBase → Postgres（幂等 upsert）")
    migrate_cloudbase_to_postgres(engine, dry_run=False)
    print("完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
