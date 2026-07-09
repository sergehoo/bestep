/**
 * CourseCertificationSection.tsx — R20.4
 *
 * Section "Certification" affichée dans l'onglet Métadonnées du Course
 * Builder.
 *
 * Fonctions :
 * - Activer / désactiver la délivrance d'un certificat (via choix de template
 *   ou "aucun")
 * - Choisir un template parmi les visibles (perso + presets)
 * - Prévisualiser le certificat sélectionné avec des données fictives
 * - Lien direct vers l'éditeur de templates
 */
import { useEffect, useMemo, useState } from 'react';
import { Award, ExternalLink, Save, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CertificatePreview } from '@/components/certificates/CertificatePreview';
import {
  useCertificateTemplates,
  useAssignCourseCertificateTemplate,
  STYLE_LABELS,
  type CertificateTemplate,
} from '@/hooks/certificate-templates';
import { extractApiError } from '@/lib/utils';

interface Props {
  courseId: number;
  courseTitle: string;
  currentTemplateId: number | null | undefined;
  canEdit: boolean;
}

export function CourseCertificationSection({
  courseId,
  courseTitle,
  currentTemplateId,
  canEdit,
}: Props) {
  const { data: templates, isLoading } = useCertificateTemplates();
  const assign = useAssignCourseCertificateTemplate();

  const [draftId, setDraftId] = useState<number | null>(
    currentTemplateId ?? null,
  );
  const [flash, setFlash] = useState<
    { kind: 'ok' | 'err'; msg: string } | null
  >(null);

  useEffect(() => {
    setDraftId(currentTemplateId ?? null);
  }, [currentTemplateId]);

  const selected = useMemo<CertificateTemplate | null>(
    () => templates?.find((t) => t.id === draftId) ?? null,
    [templates, draftId],
  );

  const defaultTemplate = templates?.find((t) => t.is_default) ?? null;
  const previewTemplate = selected ?? defaultTemplate;
  const dirty = (currentTemplateId ?? null) !== (draftId ?? null);

  async function handleSave() {
    try {
      await assign.mutateAsync({ courseId, templateId: draftId });
      setFlash({ kind: 'ok', msg: 'Modèle de certificat mis à jour.' });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg text-neutral-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-accent-500" />
              Certification
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              Choisissez le modèle utilisé lorsqu'un apprenant termine ce
              cours.
            </p>
          </div>
          <Link
            to="/instructor/certificate-templates"
            className="text-xs font-semibold text-primary-700 hover:text-primary-800 inline-flex items-center gap-1"
          >
            Gérer les modèles
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardBody>
        {isLoading && !templates ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : (
          <div className="space-y-4">
            {/* Flash */}
            {flash && (
              <div
                className={
                  'rounded-lg px-4 py-2 text-sm ' +
                  (flash.kind === 'ok'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200')
                }
                role="status"
              >
                {flash.msg}
              </div>
            )}

            {/* Radio : aucun / templates */}
            <fieldset disabled={!canEdit} className="space-y-2">
              <label className="flex items-start gap-2 p-3 rounded-lg border border-neutral-200 cursor-pointer hover:bg-neutral-50">
                <input
                  type="radio"
                  name="cert-template"
                  className="mt-0.5"
                  checked={draftId === null}
                  onChange={() => setDraftId(null)}
                />
                <div>
                  <p className="font-semibold text-neutral-900 text-sm">
                    Utiliser le modèle par défaut de la plateforme
                    {defaultTemplate && (
                      <span className="ml-2 text-xs text-neutral-500">
                        ({defaultTemplate.name})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Aucune personnalisation particulière pour ce cours.
                  </p>
                </div>
              </label>

              {(templates ?? []).map((t) => (
                <label
                  key={t.id}
                  className={
                    'flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ' +
                    (draftId === t.id
                      ? 'border-primary-500 bg-primary-50/40 ring-1 ring-primary-200'
                      : 'border-neutral-200 hover:bg-neutral-50')
                  }
                >
                  <input
                    type="radio"
                    name="cert-template"
                    className="mt-0.5"
                    checked={draftId === t.id}
                    onChange={() => setDraftId(t.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-neutral-900 text-sm truncate">
                        {t.name}
                      </p>
                      <Badge variant="neutral" size="sm">
                        {STYLE_LABELS[t.style]}
                      </Badge>
                      {!t.owner && (
                        <Badge variant="info" size="sm">
                          Plateforme
                        </Badge>
                      )}
                      {t.can_edit && t.owner && (
                        <Badge variant="accent" size="sm">
                          Personnel
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                      {t.body_text}
                    </p>
                  </div>
                </label>
              ))}
            </fieldset>

            {/* Preview */}
            {previewTemplate && (
              <div>
                <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-1.5">
                  Aperçu
                </p>
                <CertificatePreview
                  template={previewTemplate}
                  values={{ course_title: courseTitle }}
                />
                <p className="mt-2 text-xs text-neutral-500 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Les variables (nom apprenant, date…) seront remplies
                  automatiquement lors de la délivrance.
                </p>
              </div>
            )}

            {/* Bouton save */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
              <p className="text-xs text-neutral-500">
                {dirty
                  ? 'Vous avez des modifications non enregistrées.'
                  : 'Aucun changement à enregistrer.'}
              </p>
              <Button
                onClick={handleSave}
                disabled={!canEdit || !dirty || assign.isPending}
                size="sm"
              >
                <Save className="w-4 h-4" />
                {assign.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default CourseCertificationSection;
