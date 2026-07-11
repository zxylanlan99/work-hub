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
  // T17 / V2-NEWS-003 —— POST /api/news/recommend 附加字段（可选，旧数据无）。
  score?: number; // 0..1 加权总分（维度权重计算，红线不参与）
  passed?: boolean; // 服务端红线再校验是否通过（R2/R3/R4）
  dropReason?: string[]; // 触发红线的原因列表（空 = 通过）
  // T08 / V2-NEWS-001/002 —— 入库管线回写字段（可选，旧数据无；兼容既有 undefined）。
  status?: string | null; // pending | imported | failed | rejected | error
  backend_collection_id?: string | null; // kb-service 回写的 collectionId
  chunk_count?: number | null; // kb-service 切片数
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

/** 单条联网搜索结果（crawler /api/crawler/search 的 data 元素）。 */
export interface CrawlerSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

/**
 * crawler /api/crawler/search 返回结构。
 * request() 已解包统一信封 {code,data,message}，因此 data 即结果数组本身
 * （后端返回裸数组，与同服务 /rss/fetch、/redline/check 的 data 字段同构）。
 * 旧类型曾多包一层 `data`，与后端真实响应不一致，已修正。
 */
export type CrawlerSearchResult = CrawlerSearchResultItem[];

// --------------------------------------------------------------------------- //
// T08 资讯入库（crawler /api/crawler/news/ingest，V2-NEWS-001/002）
// --------------------------------------------------------------------------- //
/** 入库请求体单条（对应后端 NewsIngestItem：title/url 必填，其余可选）。 */
export interface CrawlerIngestItem {
  title: string;
  url: string;
  source?: string;
  content?: string;
  summary?: string;
  published_at?: string | null;
}

/** 入库逐条结果（对应后端 ingest_news 的 results 元素）。 */
export interface CrawlerIngestResultItem {
  id?: number;
  title: string;
  url: string;
  status: "imported" | "failed" | "rejected" | "error";
  reasons?: string[];
  collectionId?: string;
  chunkCount?: number;
}

/** 入库汇总（对应后端 ingest_news 返回的 saga summary，request 解包后即为该结构）。 */
export interface CrawlerIngestResult {
  total: number;
  imported: number;
  failed: number;
  rejected: number;
  error: number;
  results: CrawlerIngestResultItem[];
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

// --------------------------------------------------------------------------- //
// T04 自定义智能体 / 自定义 Skill（V2-AGENT-002 / 003 / 005）
// 字段 snake_case 须与 data-service schemas.CustomAgentRead / AgentSkillRead 对齐。
// --------------------------------------------------------------------------- //
export interface AgentSkill {
  // 注意：后端 /api/db/agent_skills 返回混合 id —— 内置 Skill 为字符串 "builtin:xxx"，
  // 自定义 Skill 为整数；前端统一以 string 处理（custom agent 的 skill_ids 亦为 string[]）。
  id: number | string;
  name: string;
  prompt: string;
  tools: string[];
  scope: "builtin" | "user";
  builtin: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CustomAgent {
  id: number;
  name: string;
  prompt: string;
  skill_ids: string[];
  knowledge_scope: string;
  model: string;
  builtin: boolean;
  created_at?: string;
  updated_at?: string;
}

/** 创建自定义智能体请求体（agent-service POST /api/agent，字段用前端驼峰）。 */
export interface CustomAgentInput {
  name: string;
  prompt: string;
  skillIds: string[];
  knowledgeScope?: string;
  model?: string;
}

/** 创建自定义 Skill 请求体（agent-service POST /api/skill）。 */
export interface SkillInput {
  name: string;
  prompt: string;
  tools: Array<"web_search" | "knowledge_base" | "code_exec">;
}

// --------------------------------------------------------------------------- //
// T16 资讯推荐维度权重（V2-NEWS-003，调 POST /api/news/recommend）
// --------------------------------------------------------------------------- //
export interface RecommendWeights {
  relevance: number; // 相关度
  recency: number; // 时效性
  authority: number; // 权威性
  completeness: number; // 完整度
  dedup: number; // 去重
}
