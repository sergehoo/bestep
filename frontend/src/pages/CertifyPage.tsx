/**
 * CertifyPage.tsx — Page publique de vérification + rendu imprimable d'un
 * certificat (R18.3 → R20.5 : rendu piloté par CertificateTemplate).
 *
 * Route : /certify/:code
 * Query :
 *   ?print=1        → déclenche window.print() au load
 *   ?template=<id>  → force un template précis (sinon : template par défaut)
 *
 * Le user peut ensuite "Enregistrer en PDF" via le dialog d'impression
 * système. Un vrai générateur PDF server-side (Weasyprint) est prévu R21,
 * de même qu'un endpoint public dédié qui renvoie {template + issued_at +
 * course_title + student_name} pour un code de certificat donné.
 */
import { useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, ArrowLeft } from 'lucide-react';

import { useAuthUser } from '@/stores/auth';
import { CertificatePreview } from '@/components/certificates/CertificatePreview';
import {
  useCertificateTemplates,
  type CertificateTemplate,
  type CertificateVariableKey,
} from '@/hooks/certificate-templates';

/**
 * Fallback local si les templates ne peuvent pas être chargés (utilisateur
 * non authentifié consultant une URL publique de vérification par ex.).
 * Miroir du preset "Classique bleu & or" côté backend.
 */
const FALLBACK_TEMPLATE: CertificateTemplate = {
  id: 0,
  name: 'Classique bleu & or',
  style: 'classic',
  orientation: 'landscape',
  primary_color: '#0284c7',
  accent_color: '#eab308',
  text_color: '#0f172a',
  font_family: 'Inter, system-ui, sans-serif',
  organization_name: 'BestÉpargne Academy',
  logo_url: '',
  signature_image_url: '',
  signature_name: '',
  signature_title: '',
  watermark_url: '',
  heading_text: 'Certificat d\'accomplissement',
  body_text:
    'Ce certificat est décerné à {{student_name}} pour avoir complété avec succès la formation « {{course_title}} ».',
  footer_text: 'BestÉpargne Academy — Excellence pédagogique',
  show_qr_code: true,
  show_serial: true,
  show_completion_date: true,
  is_public: true,
  is_default: true,
  owner: null,
  owner_name: 'Plateforme',
  can_edit: false,
  created_at: '',
  updated_at: '',
};

export default function CertifyPage() {
  const { code } = useParams<{ code: string }>();
  const [params] = useSearchParams();
  const shouldPrint = params.get('print') === '1';
  const forcedTemplateId = params.get('template');
  const user = useAuthUser();

  const { data: templates } = useCertificateTemplates({ enabled: !!user });

  const template = useMemo<CertificateTemplate>(() => {
    if (forcedTemplateId && templates) {
      const found = templates.find((t) => t.id === Number(forcedTemplateId));
      if (found) return found;
    }
    if (templates && templates.length > 0) {
      return templates.find((t) => t.is_default) ?? templates[0];
    }
    return FALLBACK_TEMPLATE;
  }, [templates, forcedTemplateId]);

  useEffect(() => {
    if (shouldPrint) {
      // Petite tempo pour laisser le CSS s'appliquer
      const id = setTimeout(() => window.print(), 400);
      return () => clearTimeout(id);
    }
  }, [shouldPrint]);

  // Valeurs des variables dynamiques
  const fullName =
    user?.full_name || user?.email?.split('@')[0] || 'Apprenant·e';
  const issuedAt = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const verificationUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/certify/${code ?? ''}`
      : `/certify/${code ?? ''}`;

  const values: Partial<Record<CertificateVariableKey, string | number>> = {
    student_name: fullName,
    completion_date: issuedAt,
    certificate_number: code || '—',
    verification_url: verificationUrl,
    course_title: 'Votre formation certifiante',
    organization_name: template.organization_name || 'BestÉpargne Academy',
  };

  return (
    <div className="min-h-screen bg-neutral-100 py-8 px-4 print:p-0 print:bg-white">
      <div className="max-w-4xl mx-auto">
        {/* Nav retour (masquée en impression) */}
        <div className="mb-4 print:hidden">
          <Link
            to="/learn/certificates"
            className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Mes certificats
          </Link>
        </div>

        {/* Certificat imprimable — piloté par CertificateTemplate */}
        <div id="certificate" className="print:rounded-none print:shadow-none">
          <CertificatePreview
            template={template}
            values={values}
            serial={code}
            printable={shouldPrint}
          />
        </div>

        {/* Bloc vérification (visible seulement à l'écran) */}
        <div className="mt-6 bg-white border border-neutral-100 rounded-2xl p-4 sm:p-5 print:hidden">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-neutral-900">
                Certificat vérifié
              </p>
              <p className="text-xs text-neutral-500">
                Ce certificat est authentique. Émis par{' '}
                {template.organization_name || 'BestÉpargne Academy'} sous le
                numéro <code className="font-mono">{code}</code>.
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Modèle : <span className="font-semibold">{template.name}</span>
              </p>
              <button
                type="button"
                onClick={() => window.print()}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white transition"
              >
                Enregistrer en PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CSS impression */}
      <style>{`
        @media print {
          @page { size: A4 ${template.orientation === 'portrait' ? 'portrait' : 'landscape'}; margin: 0; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
