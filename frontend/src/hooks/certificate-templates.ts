/**
 * hooks/certificate-templates.ts — R20.2
 *
 * Hooks TanStack Query pour le Certificate Template Builder.
 *
 * Endpoints backend :
 *   GET    /api/instructor/certificate-templates/                    Liste (owner + publics)
 *   POST   /api/instructor/certificate-templates/                    Créer perso
 *   GET    /api/instructor/certificate-templates/:id/                Détail
 *   PATCH  /api/instructor/certificate-templates/:id/                Update
 *   DELETE /api/instructor/certificate-templates/:id/                Supprimer
 *   POST   /api/instructor/certificate-templates/:id/duplicate/      Dupliquer
 *
 *   Assignation d'un template à un cours :
 *   PATCH  /api/instructor/courses/:id/update/  { certificate_template: id | null }
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

// ─────────────────────────────────────────────────────────────
// Types (miroir du serializer backend)
// ─────────────────────────────────────────────────────────────

export type CertificateTemplateStyle =
  | 'classic'
  | 'modern'
  | 'premium'
  | 'academic'
  | 'enterprise'
  | 'minimal'
  | 'luxury';

export type CertificateOrientation = 'landscape' | 'portrait';

/** Miroir de `certifications.CertificateTemplate` (renforcé R20.1). */
export interface CertificateTemplate {
  id: number;
  name: string;
  style: CertificateTemplateStyle;
  orientation: CertificateOrientation;
  primary_color: string;
  accent_color: string;
  text_color: string;
  font_family: string;
  organization_name: string;
  logo_url: string;
  signature_image_url: string;
  signature_name: string;
  signature_title: string;
  watermark_url: string;
  heading_text: string;
  /** Peut contenir des variables : {{student_name}}, {{course_title}}, ... */
  body_text: string;
  footer_text: string;
  show_qr_code: boolean;
  show_serial: boolean;
  show_completion_date: boolean;
  is_public: boolean;
  is_default: boolean;
  owner: number | null;
  owner_name: string;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
}

/** Champs autorisés en écriture (le backend impose owner + is_public). */
export type CertificateTemplateWritable = Partial<
  Omit<
    CertificateTemplate,
    | 'id'
    | 'owner'
    | 'owner_name'
    | 'can_edit'
    | 'created_at'
    | 'updated_at'
  >
>;

/** Variables dynamiques supportées par le body_text / heading_text. */
export const CERTIFICATE_VARIABLES = [
  { key: 'student_name', label: 'Nom de l\'apprenant', example: 'Aïcha Diallo' },
  { key: 'course_title', label: 'Titre du cours', example: 'Fondamentaux de l\'épargne' },
  { key: 'instructor_name', label: 'Nom du formateur', example: 'Serge Ogah' },
  { key: 'completion_date', label: 'Date d\'obtention', example: '9 juillet 2026' },
  { key: 'certificate_number', label: 'Numéro du certificat', example: 'BE-2026-000123' },
  { key: 'organization_name', label: 'Organisation', example: 'BestÉpargne Academy' },
  { key: 'hours', label: 'Durée (heures)', example: '12 heures' },
  { key: 'score', label: 'Score obtenu (%)', example: '92' },
  { key: 'verification_url', label: 'URL de vérification', example: 'https://…/certify/BE-2026-000123' },
] as const;

export type CertificateVariableKey =
  (typeof CERTIFICATE_VARIABLES)[number]['key'];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Remplace les variables `{{key}}` par leurs valeurs.
 * Les variables inconnues sont laissées telles quelles.
 */
export function renderCertificateText(
  text: string,
  values: Partial<Record<CertificateVariableKey, string | number>>,
): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, key) => {
    const v = (values as Record<string, unknown>)[key];
    if (v === undefined || v === null || v === '') return `{{${key}}}`;
    return String(v);
  });
}

/** Palette rapide utilisable pour prévisualisation par style. */
export const STYLE_LABELS: Record<CertificateTemplateStyle, string> = {
  classic: 'Classique',
  modern: 'Moderne',
  premium: 'Premium',
  academic: 'Académique',
  enterprise: 'Entreprise',
  minimal: 'Minimaliste',
  luxury: 'Luxe',
};

// ─────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────

export const certificateTemplateKeys = {
  all: ['certificate-templates'] as const,
  list: (style?: string) =>
    [...certificateTemplateKeys.all, 'list', style ?? 'all'] as const,
  detail: (id: number) =>
    [...certificateTemplateKeys.all, 'detail', id] as const,
};

// ─────────────────────────────────────────────────────────────
// Hooks Queries
// ─────────────────────────────────────────────────────────────

interface UseCertificateTemplatesOptions {
  style?: CertificateTemplateStyle;
  enabled?: boolean;
}

export function useCertificateTemplates(
  opts: UseCertificateTemplatesOptions = {},
) {
  const { style, enabled = true } = opts;
  return useQuery({
    queryKey: certificateTemplateKeys.list(style),
    queryFn: async () => {
      const res = await api.get<CertificateTemplate[]>(
        '/instructor/certificate-templates/',
        { params: style ? { style } : {} },
      );
      return res.data;
    },
    enabled,
    staleTime: 60_000,
  });
}

export function useCertificateTemplate(id: number | undefined | null) {
  return useQuery({
    queryKey: certificateTemplateKeys.detail(Number(id) || 0),
    queryFn: async () => {
      const res = await api.get<CertificateTemplate>(
        `/instructor/certificate-templates/${id}/`,
      );
      return res.data;
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────
// Hooks Mutations
// ─────────────────────────────────────────────────────────────

export function useCreateCertificateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CertificateTemplateWritable) => {
      const res = await api.post<CertificateTemplate>(
        '/instructor/certificate-templates/',
        payload,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: certificateTemplateKeys.all });
    },
  });
}

export function useUpdateCertificateTemplate(templateId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CertificateTemplateWritable) => {
      const res = await api.patch<CertificateTemplate>(
        `/instructor/certificate-templates/${templateId}/`,
        payload,
      );
      return res.data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: certificateTemplateKeys.all });
      qc.setQueryData(certificateTemplateKeys.detail(templateId), data);
    },
  });
}

export function useDeleteCertificateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: number) => {
      await api.delete(`/instructor/certificate-templates/${templateId}/`);
      return templateId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: certificateTemplateKeys.all });
    },
  });
}

export function useDuplicateCertificateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: number) => {
      const res = await api.post<CertificateTemplate>(
        `/instructor/certificate-templates/${templateId}/duplicate/`,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: certificateTemplateKeys.all });
    },
  });
}

/**
 * Assigne un template à un cours via l'endpoint standard de mise à jour cours.
 * `templateId = null` détache le template (retour au template par défaut).
 */
export function useAssignCourseCertificateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      courseId,
      templateId,
    }: {
      courseId: number;
      templateId: number | null;
    }) => {
      const res = await api.patch(
        `/instructor/courses/${courseId}/update/`,
        { certificate_template: templateId },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      // Invalide les hooks de détail cours instructor (R6/R16)
      void qc.invalidateQueries({ queryKey: ['instructor-course', vars.courseId] });
      void qc.invalidateQueries({ queryKey: ['instructor', 'courses'] });
    },
  });
}
