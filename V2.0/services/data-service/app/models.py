"""SQLAlchemy ORM models for StudyMind data-service.

These tables are the Postgres equivalent of the V1.x CloudBase collections and
cover the 13 retained baseline features from PRD §2.4:

  * Category            -> #1  分类管理
  * KnowledgeItem       -> #2  知识条目（元数据；向量由 kb-service 管理）
  * ReviewCard          -> #3  复习卡 + SM-2 字段
  * StudyGoal/Milestone/Task -> #4 学习计划
  * ModelConfig         -> #9  模型配置（密钥服务端存储）
  * RssSource           -> #13 RSS 源
  * NewsItem            -> #6  已读 / #7 收藏

``Base`` is imported from ``app.db`` (single metadata registry).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base

from app.db import Base


def _utcnow() -> datetime:
    """Timezone-naive UTC now (Postgres TIMESTAMP safe, py3.11+ compatible)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------------------------------- #
# #1 分类管理
# --------------------------------------------------------------------------- #
class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    parent_id = Column(
        Integer, ForeignKey("categories.id"), nullable=True, index=True
    )
    created_at = Column(DateTime, default=_utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# #2 知识条目（元数据；向量/切片由 FastGPT 经 kb-service 管理）
# --------------------------------------------------------------------------- #
class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False, default="")
    content = Column(Text, nullable=False, default="")
    summary = Column(Text, nullable=False, default="")
    category_id = Column(
        Integer, ForeignKey("categories.id"), nullable=True, index=True
    )
    source_type = Column(String(64), nullable=False, default="manual")
    source_ref = Column(String(1024), nullable=False, default="")
    backend_collection_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


# --------------------------------------------------------------------------- #
# #3 复习卡 + SM-2 间隔重复（服务端算法；V1.x _sm2 平移）
# --------------------------------------------------------------------------- #
class ReviewCard(Base):
    __tablename__ = "review_cards"

    id = Column(Integer, primary_key=True, index=True)
    knowledge_item_id = Column(
        Integer, ForeignKey("knowledge_items.id"), nullable=True, index=True
    )
    question = Column(Text, nullable=False, default="")
    answer = Column(Text, nullable=False, default="")
    card_type = Column(String(16), nullable=False, default="qa")  # choice|fill|qa
    sm2_ease = Column(Float, nullable=False, default=2.5)
    sm2_interval = Column(Integer, nullable=False, default=0)
    sm2_repetitions = Column(Integer, nullable=False, default=0)
    due_date = Column(DateTime, nullable=True)
    last_reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# #4 学习计划（目标 / 里程碑 / 任务）
# --------------------------------------------------------------------------- #
class StudyGoal(Base):
    __tablename__ = "study_goals"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    target_date = Column(Date, nullable=True)
    status = Column(String(32), nullable=False, default="active")
    created_at = Column(DateTime, default=_utcnow, nullable=False)


class StudyMilestone(Base):
    __tablename__ = "study_milestones"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(
        Integer, ForeignKey("study_goals.id"), nullable=False, index=True
    )
    title = Column(String(512), nullable=False, default="")
    due_date = Column(Date, nullable=True)
    done = Column(Boolean, nullable=False, default=False)


class StudyTask(Base):
    __tablename__ = "study_tasks"

    id = Column(Integer, primary_key=True, index=True)
    milestone_id = Column(
        Integer, ForeignKey("study_milestones.id"), nullable=False, index=True
    )
    title = Column(String(512), nullable=False, default="")
    done = Column(Boolean, nullable=False, default=False)
    due_date = Column(Date, nullable=True)


# --------------------------------------------------------------------------- #
# #9 模型配置（密钥仅服务端存储）
# --------------------------------------------------------------------------- #
class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(128), nullable=False, default="")
    model_name = Column(String(255), nullable=False, default="")
    api_key = Column(Text, nullable=False, default="")
    base_url = Column(String(1024), nullable=False, default="")
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# #13 RSS 源
# --------------------------------------------------------------------------- #
class RssSource(Base):
    __tablename__ = "rss_sources"

    id = Column(Integer, primary_key=True, index=True)
    url = Column(String(1024), nullable=False, default="")
    title = Column(String(512), nullable=False, default="")
    category = Column(String(128), nullable=False, default="")
    enabled = Column(Boolean, nullable=False, default=True)
    last_fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)


# --------------------------------------------------------------------------- #
# #6 资讯（已读） / #7 资讯（收藏）
# --------------------------------------------------------------------------- #
class NewsItem(Base):
    __tablename__ = "news_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False, default="")
    url = Column(String(1024), nullable=False, default="")
    source = Column(String(255), nullable=False, default="")
    content = Column(Text, nullable=False, default="")
    summary = Column(Text, nullable=False, default="")
    published_at = Column(DateTime, nullable=True)
    has_read = Column(Boolean, nullable=False, default=False)
    is_favorited = Column(Boolean, nullable=False, default=False)
    imported_to_kb = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
