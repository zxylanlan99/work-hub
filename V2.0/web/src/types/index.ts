// Shared TypeScript types — MUST mirror the data-service Pydantic schemas
// (app/schemas.py) field-for-field. The frontend calls these for real
// (C1 forbids mocks), so the contract must be identical.

export type CardType = "choice" | "fill" | "qa";

/** Unified API response envelope (see data-service app/response.py). */
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

// --------------------------------------------------------------------------- //
// #1 分类
// --------------------------------------------------------------------------- //
export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
  children?: Category[];
}

// --------------------------------------------------------------------------- //
// #2 知识条目
// --------------------------------------------------------------------------- //
export interface KnowledgeItem {
  id: number;
  title: string;
  content: string;
  summary: string;
  category_id: number | null;
  source_type: string;
  source_ref: string;
  backend_collection_id: string | null;
  created_at: string;
  updated_at: string;
}

// --------------------------------------------------------------------------- //
// #3 复习卡
// --------------------------------------------------------------------------- //
export interface ReviewCard {
  id: number;
  knowledge_item_id: number | null;
  question: string;
  answer: string;
  card_type: CardType;
  sm2_ease: number;
  sm2_interval: number;
  sm2_repetitions: number;
  due_date: string | null;
  last_reviewed_at: string | null;
  created_at: string;
}

// --------------------------------------------------------------------------- //
// #4 学习计划
// --------------------------------------------------------------------------- //
export interface StudyGoal {
  id: number;
  title: string;
  description: string;
  target_date: string | null;
  status: string;
  created_at: string;
}

export interface StudyMilestone {
  id: number;
  goal_id: number;
  title: string;
  due_date: string | null;
  done: boolean;
}

export interface StudyTask {
  id: number;
  milestone_id: number;
  title: string;
  done: boolean;
  due_date: string | null;
}

// --------------------------------------------------------------------------- //
// #9 模型配置
// --------------------------------------------------------------------------- //
export interface ModelConfig {
  id: number;
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string;
  is_default: boolean;
  created_at: string;
}

// --------------------------------------------------------------------------- //
// #13 RSS 源
// --------------------------------------------------------------------------- //
export interface RssSource {
  id: number;
  url: string;
  title: string;
  category: string;
  enabled: boolean;
  last_fetched_at: string | null;
  created_at: string;
}

// --------------------------------------------------------------------------- //
// #6 资讯 / #7 收藏
// --------------------------------------------------------------------------- //
export interface NewsItem {
  id: number;
  title: string;
  url: string;
  source: string;
  content: string;
  summary: string;
  published_at: string | null;
  has_read: boolean;
  is_favorited: boolean;
  imported_to_kb: boolean;
  created_at: string;
}
