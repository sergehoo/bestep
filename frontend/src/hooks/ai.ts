/**
 * hooks/ai.ts — Hooks TanStack pour le module IA (Phase 1).
 *
 * Le streaming est géré hors TanStack (via streamAssistantMessage) —
 * seuls le CRUD conversations + fetch config/history sont cachés ici.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import api from '@/lib/api';
import type {
  AIConfigPayload,
  AIConversationDetail,
  AIConversationSummary,
  AICourseBrief,
  AICourseGeneration,
  AICoursePlan,
  AIMessage,
  AIPurpose,
  AIRecoCategory,
  AIRecoFeedback,
  AIRecommendationsPayload,
  AITextActionMeta,
  AITextTransformInput,
  AITextTransformResult,
} from '@/lib/ai-types';
import type { Paginated } from '@/lib/types';

const KEYS = {
  config: () => ['ai-config'] as const,
  conversations: () => ['ai-conversations'] as const,
  conversation: (id: number) => ['ai-conversation', id] as const,
  usage: () => ['ai-usage'] as const,
};

export function useAIConfig() {
  return useQuery({
    queryKey: KEYS.config(),
    queryFn: async () => {
      const { data } = await api.get<AIConfigPayload>('/ai/config/');
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useAIConversations() {
  return useQuery({
    queryKey: KEYS.conversations(),
    queryFn: async () => {
      const { data } = await api.get<Paginated<AIConversationSummary>>(
        '/ai/conversations/',
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAIConversationDetail(id: number | null) {
  return useQuery({
    queryKey: KEYS.conversation(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<AIConversationDetail>(
        `/ai/conversations/${id}/`,
      );
      return data;
    },
    enabled: !!id,
    staleTime: 5_000,
  });
}

export function useCreateAIConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title?: string;
      default_purpose?: AIPurpose;
      context?: Record<string, unknown>;
    }) => {
      const { data } = await api.post<AIConversationDetail>(
        '/ai/conversations/',
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.conversations() });
    },
  });
}

export function usePatchAIConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: number;
      title?: string;
      is_archived?: boolean;
      default_purpose?: AIPurpose;
    }) => {
      const { id, ...body } = input;
      const { data } = await api.patch<AIConversationDetail>(
        `/ai/conversations/${id}/`,
        body,
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.conversations() });
      qc.invalidateQueries({ queryKey: KEYS.conversation(vars.id) });
    },
  });
}

export function useDeleteAIConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/ai/conversations/${id}/`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.conversations() });
    },
  });
}

export function useAIFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      messageId: number;
      conversationId: number;
      score: 1 | -1 | 0;
      note?: string;
    }) => {
      const { data } = await api.post<AIMessage>(
        `/ai/messages/${input.messageId}/feedback/`,
        { score: input.score, note: input.note ?? '' },
      );
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: KEYS.conversation(vars.conversationId),
      });
    },
  });
}

export function useAIUsage() {
  return useQuery({
    queryKey: KEYS.usage(),
    queryFn: async () => {
      const { data } = await api.get<{
        calls: number;
        input_tokens: number;
        output_tokens: number;
      }>('/ai/usage/');
      return data;
    },
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────
// Course generator (AI Phase 2)
// ─────────────────────────────────────────────────────────────

const COURSE_KEYS = {
  list: () => ['ai-course-generations'] as const,
  detail: (id: number) => ['ai-course-generation', id] as const,
};

export function useAICourseGenerations() {
  return useQuery({
    queryKey: COURSE_KEYS.list(),
    queryFn: async () => {
      const { data } = await api.get<Paginated<AICourseGeneration>>(
        '/ai/course-generations/',
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useAICourseGeneration(id: number | null) {
  return useQuery({
    queryKey: COURSE_KEYS.detail(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<AICourseGeneration>(
        `/ai/course-generations/${id}/`,
      );
      return data;
    },
    enabled: !!id,
    staleTime: 5_000,
  });
}

export function useCreateAICourseGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (brief: AICourseBrief) => {
      const { data } = await api.post<AICourseGeneration>(
        '/ai/course-generations/',
        brief,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.list() });
    },
  });
}

export function usePatchAICourseGeneration(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      brief?: AICourseBrief;
      plan?: AICoursePlan;
      certification?: Record<string, unknown>;
    }) => {
      const { data } = await api.patch<AICourseGeneration>(
        `/ai/course-generations/${id}/`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: COURSE_KEYS.list() });
    },
  });
}

export function useDeleteAICourseGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/ai/course-generations/${id}/`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.list() });
    },
  });
}

export function useGeneratePlan(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<AICourseGeneration>(
        `/ai/course-generations/${id}/plan/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.detail(id) });
    },
  });
}

export function useGenerateLessonContent(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { section_idx: number; lesson_idx: number }) => {
      const { data } = await api.post<AICourseGeneration>(
        `/ai/course-generations/${id}/lesson/`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.detail(id) });
    },
  });
}

export function useGenerateQuiz(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { section_idx: number }) => {
      const { data } = await api.post<AICourseGeneration>(
        `/ai/course-generations/${id}/quiz/`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.detail(id) });
    },
  });
}

export function useRecommendCertification(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<AICourseGeneration>(
        `/ai/course-generations/${id}/certification/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.detail(id) });
    },
  });
}

export function useFinalizeCourseGeneration(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        detail: string;
        course_id: number;
        generation: AICourseGeneration;
      }>(`/ai/course-generations/${id}/finalize/`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COURSE_KEYS.detail(id) });
      qc.invalidateQueries({ queryKey: COURSE_KEYS.list() });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Text transform (AI Phase 3)
// ─────────────────────────────────────────────────────────────

export function useAITextTransformActions() {
  return useQuery({
    queryKey: ['ai-text-transform-actions'],
    queryFn: async () => {
      const { data } = await api.get<{ actions: AITextActionMeta[] }>(
        '/ai/text-transform/actions/',
      );
      return data.actions;
    },
    staleTime: 10 * 60_000,
  });
}

export function useTextTransform() {
  return useMutation({
    mutationFn: async (input: AITextTransformInput) => {
      const { data } = await api.post<AITextTransformResult>(
        '/ai/text-transform/',
        input,
      );
      return data;
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Recommendations (AI Phase 3)
// ─────────────────────────────────────────────────────────────

export function useAIRecommendations() {
  return useQuery({
    queryKey: ['ai-recommendations'],
    queryFn: async () => {
      const { data } = await api.get<AIRecommendationsPayload>(
        '/ai/recommendations/',
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useAIRecommendationFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      course_id: number;
      feedback: AIRecoFeedback;
      category?: AIRecoCategory;
    }) => {
      const { data } = await api.post<{ detail: string; updated: number }>(
        '/ai/recommendations/feedback/',
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-recommendations'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Agent outillé (AI Phase 4)
// ─────────────────────────────────────────────────────────────

import type {
  AIActionApproval,
  AIToolDescriptor,
  AIToolExecuteResponse,
  AIToolExecution,
} from '@/lib/ai-types';

const TOOL_KEYS = {
  list: () => ['ai-tools'] as const,
  approvals: (status?: string) => ['ai-tool-approvals', status ?? 'PENDING'] as const,
  executions: () => ['ai-tool-executions'] as const,
};

export function useAITools() {
  return useQuery({
    queryKey: TOOL_KEYS.list(),
    queryFn: async () => {
      const { data } = await api.get<{ tools: AIToolDescriptor[] }>(
        '/ai/tools/',
      );
      return data.tools;
    },
    staleTime: 5 * 60_000,
  });
}

export function useAIToolExecute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tool_key: string;
      params?: Record<string, unknown>;
      conversation_id?: number;
    }) => {
      const { data } = await api.post<AIToolExecuteResponse>(
        '/ai/tools/execute/',
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOOL_KEYS.approvals() });
      qc.invalidateQueries({ queryKey: TOOL_KEYS.executions() });
    },
  });
}

export function useAIToolApprovals(statusFilter: 'PENDING' | 'CONFIRMED' | 'CANCELLED' = 'PENDING') {
  return useQuery({
    queryKey: TOOL_KEYS.approvals(statusFilter),
    queryFn: async () => {
      const { data } = await api.get<Paginated<AIActionApproval>>(
        '/ai/tools/approvals/',
        { params: { status: statusFilter } },
      );
      return data;
    },
    staleTime: 20_000,
  });
}

export function useAIToolApprovalConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (approvalId: number) => {
      const { data } = await api.post<AIToolExecuteResponse>(
        `/ai/tools/approvals/${approvalId}/confirm/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOOL_KEYS.approvals() });
      qc.invalidateQueries({ queryKey: TOOL_KEYS.executions() });
    },
  });
}

export function useAIToolApprovalCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (approvalId: number) => {
      const { data } = await api.post<AIToolExecuteResponse>(
        `/ai/tools/approvals/${approvalId}/cancel/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOOL_KEYS.approvals() });
      qc.invalidateQueries({ queryKey: TOOL_KEYS.executions() });
    },
  });
}

export function useAIToolExecutions() {
  return useQuery({
    queryKey: TOOL_KEYS.executions(),
    queryFn: async () => {
      const { data } = await api.get<Paginated<AIToolExecution>>(
        '/ai/tools/executions/',
      );
      return data;
    },
    staleTime: 20_000,
  });
}

// ─────────────────────────────────────────────────────────────
// Knowledge base + web search (AI Phase 5)
// ─────────────────────────────────────────────────────────────

import type {
  AIKnowledgeDocument,
  AIKnowledgeSearchHit,
  AIKnowledgeSpace,
  AIWebSearchPayload,
  KBDocType,
  KBSpaceScope,
} from '@/lib/ai-types';

const KB_KEYS = {
  spaces: () => ['ai-kb-spaces'] as const,
  documents: () => ['ai-kb-documents'] as const,
  documentDetail: (id: number) => ['ai-kb-document', id] as const,
};

export function useKBSpaces() {
  return useQuery({
    queryKey: KB_KEYS.spaces(),
    queryFn: async () => {
      const { data } = await api.get<{ spaces: AIKnowledgeSpace[] }>(
        '/ai/knowledge/spaces/',
      );
      return data.spaces;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateKBSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      scope: KBSpaceScope;
      organization_id?: number | null;
      course_id?: number | null;
      description?: string;
    }) => {
      const { data } = await api.post<AIKnowledgeSpace>(
        '/ai/knowledge/spaces/',
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KB_KEYS.spaces() });
    },
  });
}

export function useKBDocuments() {
  return useQuery({
    queryKey: KB_KEYS.documents(),
    queryFn: async () => {
      const { data } = await api.get<Paginated<AIKnowledgeDocument>>(
        '/ai/knowledge/documents/',
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useKBDocument(id: number | null) {
  return useQuery({
    queryKey: KB_KEYS.documentDetail(id ?? 0),
    queryFn: async () => {
      const { data } = await api.get<AIKnowledgeDocument>(
        `/ai/knowledge/documents/${id}/`,
      );
      return data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateKBDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      space_id: number;
      title: string;
      content: string;
      source_url?: string;
      doc_type?: KBDocType;
      language?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const { data } = await api.post<AIKnowledgeDocument>(
        '/ai/knowledge/documents/',
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KB_KEYS.documents() });
      qc.invalidateQueries({ queryKey: KB_KEYS.spaces() });
    },
  });
}

export function useReindexKBDocument(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<AIKnowledgeDocument>(
        `/ai/knowledge/documents/${id}/reindex/`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KB_KEYS.documents() });
      qc.invalidateQueries({ queryKey: KB_KEYS.documentDetail(id) });
    },
  });
}

export function useDeleteKBDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/ai/knowledge/documents/${id}/`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KB_KEYS.documents() });
    },
  });
}

export function useKBSearch() {
  return useMutation({
    mutationFn: async (input: { query: string; limit?: number }) => {
      const { data } = await api.post<{
        query: string;
        results: AIKnowledgeSearchHit[];
      }>('/ai/knowledge/search/', input);
      return data;
    },
  });
}

export function useAIWebSearch() {
  return useMutation({
    mutationFn: async (input: { query: string; limit?: number }) => {
      const { data } = await api.post<AIWebSearchPayload>(
        '/ai/web-search/',
        input,
      );
      return data;
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Admin center (AI Phase 6)
// ─────────────────────────────────────────────────────────────

import type {
  AIAdminOverviewPayload,
  AIAuditLogRow,
  AIModelRow,
  AIProviderRow,
  AIQuotaRow,
} from '@/lib/ai-types';

const ADMIN_KEYS = {
  overview: () => ['ai-admin-overview'] as const,
  providers: () => ['ai-admin-providers'] as const,
  models: () => ['ai-admin-models'] as const,
  quotas: () => ['ai-admin-quotas'] as const,
  audit: (filters: Record<string, string>) => ['ai-admin-audit', filters] as const,
};

export function useAIAdminOverview() {
  return useQuery({
    queryKey: ADMIN_KEYS.overview(),
    queryFn: async () => {
      const { data } = await api.get<AIAdminOverviewPayload>(
        '/ai/admin/overview/',
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useAIProviders() {
  return useQuery({
    queryKey: ADMIN_KEYS.providers(),
    queryFn: async () => {
      const { data } = await api.get<{ providers: AIProviderRow[] }>(
        '/ai/admin/providers/',
      );
      return data.providers;
    },
    staleTime: 60_000,
  });
}

export function useCreateAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AIProviderRow> & { api_key?: string }) => {
      const { data } = await api.post<AIProviderRow>('/ai/admin/providers/', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.providers() });
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.overview() });
    },
  });
}

export function useUpdateAIProvider(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AIProviderRow> & { api_key?: string }) => {
      const { data } = await api.patch<AIProviderRow>(
        `/ai/admin/providers/${id}/`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.providers() });
    },
  });
}

export function useDeleteAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/ai/admin/providers/${id}/`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.providers() });
    },
  });
}

export function useTestAIProvider() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post<{
        ok: boolean;
        detail: string;
        latency_ms: number;
      }>(`/ai/admin/providers/${id}/test/`);
      return data;
    },
  });
}

export function useAIModels() {
  return useQuery({
    queryKey: ADMIN_KEYS.models(),
    queryFn: async () => {
      const { data } = await api.get<{ models: AIModelRow[] }>(
        '/ai/admin/models/',
      );
      return data.models;
    },
    staleTime: 60_000,
  });
}

export function useCreateAIModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AIModelRow> & { provider: number }) => {
      const { data } = await api.post<AIModelRow>('/ai/admin/models/', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.models() });
    },
  });
}

export function useDeleteAIModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/ai/admin/models/${id}/`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.models() });
    },
  });
}

export function useAIQuotas() {
  return useQuery({
    queryKey: ADMIN_KEYS.quotas(),
    queryFn: async () => {
      const { data } = await api.get<{ quotas: AIQuotaRow[] }>('/ai/admin/quotas/');
      return data.quotas;
    },
    staleTime: 60_000,
  });
}

export function useCreateAIQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AIQuotaRow>) => {
      const { data } = await api.post<AIQuotaRow>('/ai/admin/quotas/', input);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.quotas() });
    },
  });
}

export function useDeleteAIQuota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/ai/admin/quotas/${id}/`);
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ADMIN_KEYS.quotas() });
    },
  });
}

export function useAIAuditLogs(filters: { kind?: string; q?: string; ok?: string } = {}) {
  const key = { kind: filters.kind ?? '', q: filters.q ?? '', ok: filters.ok ?? '' };
  return useQuery({
    queryKey: ADMIN_KEYS.audit(key),
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.kind) params.kind = filters.kind;
      if (filters.q) params.q = filters.q;
      if (filters.ok) params.ok = filters.ok;
      const { data } = await api.get<Paginated<AIAuditLogRow>>(
        '/ai/admin/audit-logs/',
        { params },
      );
      return data;
    },
    staleTime: 30_000,
  });
}
