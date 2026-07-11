// StudyMind V2.0 — 共享 TypeScript 类型
//
// 这些类型须与后端 Pydantic schema / 接口契约字段逐一对齐。
// 字段命名以 team-lead 交接的「真实接口契约」为准（data-service 返回 snake_case：
// has_read / is_favorited / backend_collection_id 等）。

export type CardType = "choice" | "fill" | "qa";

/** 统一 API 响应信封（见各服务 app 的响应封装）。 */
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

// --------------------------------------------------------------------------- //
// #1 分类（categories，契约 /api/db/categories）
// --------------------------------------------------------------------------- //
export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  sort?: number;
  created_at: string;
  children?: Category[];
}

// --------------------------------------------------------------------------- //
// #2 知识条目（knowledge_items，契约 /api/kb/items）
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
// #3 复习卡（review_cards，契约 /api/review/cards）
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

/** SM-2 评分请求体（契约 POST /api/review/sm2）。 */
export interface Sm2Request {
  card_id: number;
  quality: number; // 0-5
}

/** 基础出题生成请求体（契约 POST /api/review/quiz/generate）。 */
export interface QuizGenerateRequest {
  type: CardType;
  knowledge_item_id?: number;
}

/** 单道题目（前端假设结构，实际以后端返回为准）。 */
export interface QuizQuestion {
  id?: number;
  type: CardType;
  question: string;
  answer: string;
  options?: string[]; // choice 题型备选项
}

export interface QuizGenerateResponse {
  questions: QuizQuestion[];
}

// --------------------------------------------------------------------------- //
// #4 学习计划（plans，契约 /api/plans，含 goals/milestones/tasks）
// --------------------------------------------------------------------------- //
export interface StudyGoal {
  id: number;
  title: string;
  description: string;
  target_date: string | null;
  status: string;
  created_at: string;
  milestones?: StudyMilestone[];
}

export interface StudyMilestone {
  id: number;
  goal_id: number;
  title: string;
  due_date: string | null;
  done: boolean;
  tasks?: StudyTask[];
}

export interface StudyTask {
  id: number;
  milestone_id: number;
  title: string;
  done: boolean;
  due_date: string | null;
}

// --------------------------------------------------------------------------- //
// #9 模型配置（settings/models，契约 /api/settings/models）
// --------------------------------------------------------------------------- //
export interface ModelConfig {
  id: number;
  provider: string;
  model_name: string;
  api_key: string;
  base_url: string;
  is_default: boolean;
  created_at: string;
  display_name?: string;
  plan_type?: string;
  status?: string;
}

// --------------------------------------------------------------------------- //
// #13 RSS 源（rss，契约 /api/rss，含 enabled）
// --------------------------------------------------------------------------- //
export interface RssSource {
  id: number;
  url: string;
  title: string;
  category: string;
  enabled: boolean;
  last_fetched_at: string | null;
  created_at: string;
  status?: "ok" | "warn" | "err";
}

// --------------------------------------------------------------------------- //
// #6/#7 资讯 / 收藏（news，契约 /api/news）
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

/** crawler /api/crawler/rss/fetch 返回结构（前端假设 rejected 形态）。 */
export interface RssFetchResult {
  passed: NewsItem[];
  rejected: Array<{
    title?: string;
    url?: string;
    reason: string;
    item?: Record<string, unknown>;
  }>;
}

/** crawler /api/crawler/redline/check 返回结构。 */
export interface RedlineCheckResult {
  passed: boolean;
  reasons: string[];
}

export interface CrawlerSearchResult {
  data: Array<{ title: string; url: string; snippet: string }>;
}

// --------------------------------------------------------------------------- //
// 智能体（agent-service，契约 /api/agents, /api/agents/{id}/chat）
// --------------------------------------------------------------------------- //
export interface Agent {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  skill_ids?: string[];
}

export interface Citation {
  title: string;
  source_doc_id?: string;
  snippet?: string;
}

export interface ChatMessage {
  role: "user" | "agent";
  content: string;
  citations?: Citation[];
}

export interface ChatResponse {
  conversation_id: string;
  reply: string;
  citations?: Citation[];
}

export interface ConversationHistory {
  conversation_id: string;
  messages: ChatMessage[];
}

// --------------------------------------------------------------------------- //
// 知识库网关（kb-service，契约 /api/kb/*）
// --------------------------------------------------------------------------- //
export interface KbDataset {
  id?: number;
  name: string;
  backend_collection_id: string;
}

export interface KbDocument {
  document_id: string;
  dataset_id?: string;
}

export interface KbSearchResult {
  content: string;
  score: number;
  source_doc_id?: string;
  title?: string;
}

// --------------------------------------------------------------------------- //
// 首页聚合（home，契约 /api/home/*）
// --------------------------------------------------------------------------- //
export interface HeatmapItem {
  date: string;
  count: number;
  level: number; // 0-3
}
export interface HeatmapResponse {
  items: HeatmapItem[];
}
export interface TodayReviewResponse {
  count: number;
  items: ReviewCard[];
}
export interface WeakTopic {
  name: string;
  mastery: number; // 0-1
}
export interface WeakTopicsResponse {
  topics: WeakTopic[];
}
export interface PlanStatsResponse {
  total: number;
  completed: number;
  active: number;
  completion_rate: number; // 0-1
}
