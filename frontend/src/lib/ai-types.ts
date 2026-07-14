/**
 * ai-types.ts — Types partagés du module IA (Phase 1).
 */

export type AIRole = 'user' | 'assistant' | 'system' | 'tool';

export type AIPurpose =
  | 'chat_fast'
  | 'chat_advanced'
  | 'analysis'
  | 'image'
  | 'embedding';

export interface AIMessage {
  id: number;
  role: AIRole;
  content: string;
  metadata?: Record<string, unknown>;
  page_context?: Record<string, unknown>;
  model_used?: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  feedback_score?: number;
  feedback_note?: string;
  created_at: string;
}

export interface AIConversationSummary {
  id: number;
  title: string;
  default_purpose: AIPurpose;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  message_count: number;
}

export interface AIConversationDetail extends AIConversationSummary {
  context: Record<string, unknown>;
  messages: AIMessage[];
}

export interface AIConfigPayload {
  purposes: Array<{ key: AIPurpose; label: string }>;
  default_purpose: AIPurpose;
  features: {
    streaming: boolean;
    attachments: boolean;
    web_search: boolean;
    tools: boolean;
    image_generation: boolean;
  };
}

export interface AIStreamEventUserMessage {
  type: 'user_message';
  message: {
    id: number;
    role: 'user';
    content: string;
    created_at: string;
  };
}
export interface AIStreamEventAssistantStart {
  type: 'assistant_start';
  message_id: number;
  model: string;
}
export interface AIStreamEventDelta {
  type: 'delta';
  text: string;
}
export interface AIStreamEventAssistantDone {
  type: 'assistant_done';
  message: AIMessage;
  usage: {
    input_tokens: number;
    output_tokens: number;
    provider: string;
  };
}
export interface AIStreamEventError {
  type: 'error';
  detail: string;
}
/** BEST-AI T5 — Claude a émis un bloc <action>…</action> proposant
 * l'exécution d'un tool wired-in DB. Le frontend affiche un bouton
 * "Voir l'aperçu + exécuter" qui lance le flow /api/ai/tools/execute/. */
export interface AIStreamEventActionProposed {
  type: 'action_proposed';
  assistant_message_id: number;
  tool: string;
  params: Record<string, unknown>;
}

export type AIStreamEvent =
  | AIStreamEventUserMessage
  | AIStreamEventAssistantStart
  | AIStreamEventDelta
  | AIStreamEventAssistantDone
  | AIStreamEventError
  | AIStreamEventActionProposed;

// ─────────────────────────────────────────────────────────────
// Course generator (AI Phase 2)
// ─────────────────────────────────────────────────────────────

export type AICourseGenStatus =
  | 'DRAFT'
  | 'PLAN_READY'
  | 'CONTENT_READY'
  | 'QUIZ_READY'
  | 'FINALIZED'
  | 'FAILED';

export interface AICourseBrief {
  topic: string;
  audience?: string;
  level?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  language?: string;
  duration_hours?: number;
  style?: string;
  depth?: string;
  with_certificate?: boolean;
  extra_instructions?: string;
}

export interface AICourseLessonMeta {
  title: string;
  duration_min?: number;
  objectives?: string[];
}

export interface AICourseSectionMeta {
  title: string;
  summary?: string;
  lessons: AICourseLessonMeta[];
}

export interface AICoursePlan {
  title?: string;
  subtitle?: string;
  description?: string;
  objectives?: string[];
  audience?: string;
  prerequisites?: string[];
  level?: string;
  language?: string;
  duration_hours?: number;
  sections?: AICourseSectionMeta[];
  keywords?: string[];
  [key: string]: unknown;
}

export interface AICourseLessonContent {
  title?: string;
  html?: string;
  key_points?: string[];
  resources?: Array<{ label: string; url: string }>;
}

export interface AICourseQuizQuestion {
  type: 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE' | 'TEXT';
  prompt: string;
  choices: string[];
  correct: number[];
  explanation?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  score?: number;
}

export interface AICourseSectionQuiz {
  section_title?: string;
  questions: AICourseQuizQuestion[];
}

export interface AICourseCertification {
  recommended_mode?: 'PARTICIPATION' | 'COURSE_CERTIFICATE' | 'CERTIFICATE';
  reasoning?: string;
  score_min?: number;
  issues_badge?: boolean;
}

export interface AICourseGeneration {
  id: number;
  status: AICourseGenStatus;
  brief: AICourseBrief;
  plan: AICoursePlan;
  lessons_content: { lessons?: Record<string, AICourseLessonContent> };
  quizzes: { quizzes?: Record<string, AICourseSectionQuiz> };
  certification: AICourseCertification;
  error_detail?: string;
  finalized_course_id: number | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Text transform (AI Phase 3)
// ─────────────────────────────────────────────────────────────

export type AITextAction =
  | 'write'
  | 'continue'
  | 'improve'
  | 'correct'
  | 'reformulate'
  | 'summarize'
  | 'expand'
  | 'simplify'
  | 'professional'
  | 'to_list'
  | 'to_table'
  | 'example'
  | 'case_study'
  | 'exercise'
  | 'translate'
  | 'adapt_beginner'
  | 'adapt_intermediate'
  | 'adapt_advanced';

export interface AITextTransformInput {
  action: AITextAction;
  text: string;
  context?: Record<string, unknown>;
  target_language?: string;
}

export interface AITextTransformResult {
  action: AITextAction;
  label: string;
  result: string;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
}

export interface AITextActionMeta {
  key: AITextAction;
  label: string;
  instruction: string;
}

// ─────────────────────────────────────────────────────────────
// Recommendations (AI Phase 3)
// ─────────────────────────────────────────────────────────────

export type AIRecoCategory =
  | 'for_you'
  | 'continue'
  | 'strengthen'
  | 'discover'
  | 'popular'
  | 'certifying'
  | 'short'
  | 'path';

export type AIRecoFeedback =
  | 'interested'
  | 'not_interested'
  | 'already_known'
  | 'too_easy'
  | 'too_hard'
  | 'later';

export interface AIRecoCourse {
  id: number;
  title: string;
  slug: string;
  level: string | null;
  language: string | null;
  course_type: string | null;
  subtitle: string;
  thumbnail_url: string;
}

export interface AIRecommendationItem {
  course: AIRecoCourse;
  match_score: number;
  reason: string;
  category: AIRecoCategory;
}

export interface AIRecommendationsPayload {
  categories: Record<AIRecoCategory, AIRecommendationItem[]>;
}

// ─────────────────────────────────────────────────────────────
// Agent outillé (AI Phase 4)
// ─────────────────────────────────────────────────────────────

export interface AIToolDescriptor {
  key: string;
  title: string;
  description: string;
  confirmation_level: 0 | 1 | 2;
  params_schema: Record<string, unknown>;
  allowed_roles: string[];
}

export type AIToolExecutionStatus =
  | 'PENDING_APPROVAL'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'DENIED';

export interface AIToolExecution {
  id: number;
  tool_key: string;
  status: AIToolExecutionStatus;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown>;
  latency_ms: number;
  error_detail: string;
  created_at: string;
  completed_at: string | null;
}

export type AIApprovalStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface AIActionApproval {
  id: number;
  tool_key: string;
  level: 0 | 1 | 2;
  status: AIApprovalStatus;
  summary: string;
  impact: string;
  affected_items: Array<Record<string, unknown>>;
  permissions_used: string[];
  input_payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface AIToolExecuteResponse {
  status: 'executed' | 'pending_approval' | 'denied' | 'cancelled';
  execution?: AIToolExecution;
  approval?: AIActionApproval | null;
  result?: {
    ok: boolean;
    detail: string;
    data: Record<string, unknown>;
  } | null;
  detail?: string;
}

// ─────────────────────────────────────────────────────────────
// Knowledge base + web search (AI Phase 5)
// ─────────────────────────────────────────────────────────────

export type KBSpaceScope =
  | 'GLOBAL'
  | 'ORG'
  | 'COURSE'
  | 'INSTRUCTOR'
  | 'PRIVATE'
  | 'ADMIN';

export interface AIKnowledgeSpace {
  id: number;
  name: string;
  scope: KBSpaceScope;
  owner: number | null;
  organization_id: number | null;
  course_id: number | null;
  description: string;
  created_at: string;
  updated_at: string;
  documents_count: number;
}

export type KBDocStatus = 'PENDING' | 'INDEXING' | 'INDEXED' | 'FAILED';
export type KBDocType =
  | 'TEXT'
  | 'MARKDOWN'
  | 'HTML'
  | 'PDF'
  | 'DOCX'
  | 'COURSE'
  | 'LESSON'
  | 'FAQ'
  | 'POLICY';

export interface AIKnowledgeDocument {
  id: number;
  space: number;
  space_name: string;
  space_scope: KBSpaceScope;
  title: string;
  source_url: string;
  doc_type: KBDocType;
  language: string;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  status: KBDocStatus;
  error_detail: string;
  chunks_count: number;
  embedding_dim: number;
  created_at: string;
  updated_at: string;
  indexed_at: string | null;
}

export interface AIKnowledgeSearchHit {
  document_id: number;
  document_title: string;
  space_id: number;
  space_name: string;
  space_scope: KBSpaceScope;
  chunk_id: number;
  chunk_idx: number;
  text: string;
  score: number;
  source_url: string;
}

export interface AIWebSearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  score: number;
  date: string;
  source_kind: 'web' | 'official' | 'academic' | 'regulator';
}

export interface AIWebSearchPayload {
  query: string;
  provider: string;
  results: AIWebSearchResult[];
  filtered_out?: number;
}

// ─────────────────────────────────────────────────────────────
// Centre admin IA (AI Phase 6)
// ─────────────────────────────────────────────────────────────

export type AIProviderKind = 'openai' | 'anthropic' | 'gemini' | 'stub';

export interface AIProviderRow {
  id: number;
  name: string;
  kind: AIProviderKind;
  base_url: string;
  api_key_masked: string;
  is_active: boolean;
  priority: number;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
  models_count: number;
}

export type AIModelPurpose =
  | 'chat_fast'
  | 'chat_advanced'
  | 'analysis'
  | 'image'
  | 'embedding';

export interface AIModelRow {
  id: number;
  provider: number;
  provider_name: string;
  purpose: AIModelPurpose;
  model_name: string;
  max_tokens: number;
  temperature: string;
  cost_input_per_1k: string;
  cost_output_per_1k: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export type AIQuotaTargetType = 'GLOBAL' | 'ROLE' | 'USER' | 'ORG';
export type AIQuotaPeriod = 'DAILY' | 'MONTHLY';

export interface AIQuotaRow {
  id: number;
  target_type: AIQuotaTargetType;
  target_role: string;
  target_user: number | null;
  target_org_id: number | null;
  period: AIQuotaPeriod;
  max_calls: number;
  max_input_tokens: number;
  max_output_tokens: number;
  max_cost_usd: string;
  is_active: boolean;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface AIAdminOverviewPayload {
  generated_at: string;
  month: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  week: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  total: { calls: number; cost_usd: number };
  top_users: Array<{
    user_id: number;
    user__email: string;
    calls: number;
    tokens: number;
  }>;
  top_models: Array<{
    provider: string;
    model_name: string;
    calls: number;
  }>;
  providers: { active: number; total: number };
  quotas_active: number;
  approvals_pending: number;
  kb: { documents: number; indexed: number };
}

export interface AIAuditLogRow {
  id: number;
  user: number | null;
  user_email: string;
  organization_id: number | null;
  conversation_id_snapshot: number | null;
  kind: string;
  payload: Record<string, unknown>;
  ip: string | null;
  ok: boolean;
  error_type: string;
  created_at: string;
}
