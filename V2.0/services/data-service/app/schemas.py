"""Pydantic v2 schemas.

Field names are snake_case and MUST match:
  1. the SQLAlchemy models in ``app/models.py`` (ORM <-> schema correspondence)
  2. the TypeScript interfaces in ``web/src/types/index.ts``
     (frontend calls these for real — C1 forbids mocks, so the contract
     must be identical).

Create / Update variants are provided for every entity. ``*Read`` schemas use
``from_attributes=True`` so ORM instances can be validated directly.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


# --------------------------------------------------------------------------- #
# #1 分类（含树形 children）
# --------------------------------------------------------------------------- #
class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    children: List["CategoryRead"] = []


CategoryRead.model_rebuild()


# --------------------------------------------------------------------------- #
# #2 知识条目
# --------------------------------------------------------------------------- #
class KnowledgeItemBase(BaseModel):
    title: str = ""
    content: str = ""
    summary: str = ""
    category_id: Optional[int] = None
    source_type: str = "manual"
    source_ref: str = ""
    backend_collection_id: Optional[str] = None


class KnowledgeItemCreate(KnowledgeItemBase):
    pass


class KnowledgeItemUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    category_id: Optional[int] = None
    source_type: Optional[str] = None
    source_ref: Optional[str] = None
    backend_collection_id: Optional[str] = None


class KnowledgeItemRead(KnowledgeItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# #3 复习卡
# --------------------------------------------------------------------------- #
class ReviewCardBase(BaseModel):
    knowledge_item_id: Optional[int] = None
    question: str = ""
    answer: str = ""
    card_type: Literal["choice", "fill", "qa"] = "qa"


class ReviewCardCreate(ReviewCardBase):
    sm2_ease: float = 2.5
    sm2_interval: int = 0
    sm2_repetitions: int = 0
    due_date: Optional[datetime] = None


class ReviewCardUpdate(BaseModel):
    knowledge_item_id: Optional[int] = None
    question: Optional[str] = None
    answer: Optional[str] = None
    card_type: Optional[Literal["choice", "fill", "qa"]] = None
    sm2_ease: Optional[float] = None
    sm2_interval: Optional[int] = None
    sm2_repetitions: Optional[int] = None
    due_date: Optional[datetime] = None


class ReviewCardRead(ReviewCardBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sm2_ease: float
    sm2_interval: int
    sm2_repetitions: int
    due_date: Optional[datetime]
    last_reviewed_at: Optional[datetime]
    created_at: datetime


# --------------------------------------------------------------------------- #
# #4 学习计划
# --------------------------------------------------------------------------- #
class StudyGoalBase(BaseModel):
    title: str = ""
    description: str = ""
    target_date: Optional[date] = None
    status: str = "active"


class StudyGoalCreate(StudyGoalBase):
    pass


class StudyGoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_date: Optional[date] = None
    status: Optional[str] = None


class StudyGoalRead(StudyGoalBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


class StudyMilestoneBase(BaseModel):
    goal_id: int
    title: str = ""
    due_date: Optional[date] = None
    done: bool = False


class StudyMilestoneCreate(StudyMilestoneBase):
    pass


class StudyMilestoneUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[date] = None
    done: Optional[bool] = None


class StudyMilestoneRead(StudyMilestoneBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class StudyTaskBase(BaseModel):
    milestone_id: int
    title: str = ""
    done: bool = False
    due_date: Optional[date] = None


class StudyTaskCreate(StudyTaskBase):
    pass


class StudyTaskUpdate(BaseModel):
    title: Optional[str] = None
    done: Optional[bool] = None
    due_date: Optional[date] = None


class StudyTaskRead(StudyTaskBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# --------------------------------------------------------------------------- #
# #9 模型配置
# --------------------------------------------------------------------------- #
class ModelConfigBase(BaseModel):
    provider: str = ""
    model_name: str = ""
    api_key: str = ""
    base_url: str = ""
    is_default: bool = False


class ModelConfigCreate(ModelConfigBase):
    pass


class ModelConfigUpdate(BaseModel):
    provider: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    is_default: Optional[bool] = None


class ModelConfigRead(ModelConfigBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# --------------------------------------------------------------------------- #
# #13 RSS 源
# --------------------------------------------------------------------------- #
class RssSourceBase(BaseModel):
    url: str = ""
    title: str = ""
    category: str = ""
    enabled: bool = True


class RssSourceCreate(RssSourceBase):
    pass


class RssSourceUpdate(BaseModel):
    url: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    enabled: Optional[bool] = None


class RssSourceRead(RssSourceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    last_fetched_at: Optional[datetime]
    created_at: datetime


# --------------------------------------------------------------------------- #
# #6 资讯（已读） / #7 资讯（收藏）
# --------------------------------------------------------------------------- #
class NewsItemBase(BaseModel):
    title: str = ""
    url: str = ""
    source: str = ""
    content: str = ""
    summary: str = ""
    published_at: Optional[datetime] = None
    has_read: bool = False
    is_favorited: bool = False
    imported_to_kb: bool = False
    # T08 资讯入库知识库管线状态机：new | pending | imported | failed
    status: str = "new"
    backend_collection_id: Optional[str] = None
    chunk_count: Optional[int] = None


class NewsItemCreate(NewsItemBase):
    pass


class NewsItemUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    source: Optional[str] = None
    content: Optional[str] = None
    summary: Optional[str] = None
    published_at: Optional[datetime] = None
    has_read: Optional[bool] = None
    is_favorited: Optional[bool] = None
    imported_to_kb: Optional[bool] = None
    status: Optional[str] = None
    backend_collection_id: Optional[str] = None
    chunk_count: Optional[int] = None


class NewsItemRead(NewsItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# --------------------------------------------------------------------------- #
# T04 自定义智能体 / 自定义 Skill（V2-AGENT-002 / 003）
# --------------------------------------------------------------------------- #
class AgentSkillBase(BaseModel):
    name: str = ""
    prompt: str = ""
    tools: List[str] = []
    scope: str = "user"


class AgentSkillCreate(AgentSkillBase):
    pass


class AgentSkillRead(AgentSkillBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    builtin: bool = False
    created_at: datetime
    updated_at: datetime


class CustomAgentBase(BaseModel):
    name: str = ""
    prompt: str = ""
    skill_ids: List[str] = []
    knowledge_scope: str = ""
    model: str = ""


class CustomAgentCreate(CustomAgentBase):
    pass


class CustomAgentRead(CustomAgentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    builtin: bool = False
    created_at: datetime
    updated_at: datetime
