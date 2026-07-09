/**
 * InstructorCertificateTemplatesPage.tsx — R20.3
 *
 * Page de gestion des modèles de certificat pour l'instructeur.
 * Route : /instructor/certificate-templates
 *
 * Fonctionnalités :
 * - Liste des templates visibles (les miens + presets globaux + publics)
 * - Filtre par style (Classique / Moderne / Premium / …)
 * - Création d'un template perso à partir de zéro
 * - Duplication d'un template pour l'éditer
 * - Édition des propriétés (couleurs, textes, options, images) avec preview
 *   live à droite
 * - Suppression (owner ou platform_admin)
 *
 * L'éditeur DnD complet type Canva (repositionnement libre) est planifié
 * en R21 — nécessite Konva/Fabric.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Save,
  Star,
  Sparkles,
  FileText,
  Filter,
  Info,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { CertificatePreview } from '@/components/certificates/CertificatePreview';
import {
  useCertificateTemplates,
  useCreateCertificateTemplate,
  useUpdateCertificateTemplate,
  useDeleteCertificateTemplate,
  useDuplicateCertificateTemplate,
  STYLE_LABELS,
  CERTIFICATE_VARIABLES,
  type CertificateTemplate,
  type CertificateTemplateStyle,
  type CertificateOrientation,
  type CertificateTemplateWritable,
} from '@/hooks/certificate-templates';
import { extractApiError } from '@/lib/utils';

const STYLE_KEYS: (CertificateTemplateStyle | 'all')[] = [
  'all',
  'classic',
  'modern',
  'premium',
  'academic',
  'enterprise',
  'minimal',
  'luxury',
];

const ORIENTATIONS: { value: CertificateOrientation; label: string }[] = [
  { value: 'landscape', label: 'Paysage' },
  { value: 'portrait', label: 'Portrait' },
];

/** Payload par défaut pour "Créer un template". */
function blankTemplate(): CertificateTemplateWritable {
  return {
    name: 'Nouveau template',
    style: 'classic',
    orientation: 'landscape',
    primary_color: '#0284c7',
    accent_color: '#eab308',
    text_color: '#0f172a',
    font_family: 'Inter, system-ui, sans-serif',
    organization_name: 'BestÉpargne Academy',
    heading_text: 'Certificat d\'accomplissement',
    body_text:
      'Ce certificat est décerné à {{student_name}} pour avoir complété avec succès la formation « {{course_title}} ».',
    footer_text: '',
    show_qr_code: true,
    show_serial: true,
    show_completion_date: true,
  };
}

export default function InstructorCertificateTemplatesPage() {
  const [styleFilter, setStyleFilter] =
    useState<(typeof STYLE_KEYS)[number]>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [flash, setFlash] = useState<
    { kind: 'ok' | 'err'; msg: string } | null
  >(null);

  const { data: templates, isLoading } = useCertificateTemplates({
    style: styleFilter === 'all' ? undefined : styleFilter,
  });

  const selected = useMemo(
    () => templates?.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const createMutation = useCreateCertificateTemplate();
  const duplicateMutation = useDuplicateCertificateTemplate();
  const deleteMutation = useDeleteCertificateTemplate();

  /** Sélectionne le premier template par défaut. */
  useEffect(() => {
    if (!selectedId && templates && templates.length > 0) {
      setSelectedId(templates[0].id);
    }
  }, [templates, selectedId]);

  async function handleCreate() {
    try {
      const created = await createMutation.mutateAsync(blankTemplate());
      setSelectedId(created.id);
      setFlash({ kind: 'ok', msg: 'Template créé.' });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  async function handleDuplicate(id: number) {
    try {
      const copy = await duplicateMutation.mutateAsync(id);
      setSelectedId(copy.id);
      setFlash({ kind: 'ok', msg: 'Template dupliqué.' });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Supprimer ce template ? Cette action est irréversible.')) return;
    try {
      await deleteMutation.mutateAsync(id);
      if (selectedId === id) setSelectedId(null);
      setFlash({ kind: 'ok', msg: 'Template supprimé.' });
    } catch (e) {
      setFlash({ kind: 'err', msg: extractApiError(e) });
    }
  }

  return (
    <InstructorShell
      title="Modèles de certificats"
      subtitle="Personnalisez l'apparence des certificats délivrés à vos apprenants."
    >
      {/* Flash */}
      {flash && (
        <div
          className={
            'mb-4 rounded-lg px-4 py-3 text-sm ' +
            (flash.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200')
          }
          role="status"
        >
          {flash.msg}
        </div>
      )}

      {/* Toolbar : filtres + création */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-neutral-500" />
          {STYLE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStyleFilter(k)}
              className={
                'rounded-full px-3 py-1 text-xs font-semibold border transition-colors ' +
                (styleFilter === k
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50')
              }
            >
              {k === 'all' ? 'Tous' : STYLE_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="sm:ml-auto">
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending}
          >
            <Plus className="w-4 h-4" />
            Nouveau template
          </Button>
        </div>
      </div>

      {isLoading && !templates ? (
        <div className="py-16 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : (templates?.length ?? 0) === 0 ? (
        <Card>
          <CardBody className="text-center py-10">
            <FileText className="w-10 h-10 text-neutral-300 mx-auto" />
            <p className="mt-3 text-lg font-bold text-neutral-900">
              Aucun template disponible
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              Créez votre premier template pour personnaliser vos certificats.
            </p>
            <Button onClick={handleCreate} className="mt-4">
              <Plus className="w-4 h-4" />
              Créer un template
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Colonne 1 : liste des templates */}
          <div className="xl:col-span-1 space-y-3 max-h-[80vh] overflow-y-auto pr-1">
            {templates?.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                selected={t.id === selectedId}
                onSelect={() => setSelectedId(t.id)}
                onDuplicate={() => handleDuplicate(t.id)}
                onDelete={() => handleDelete(t.id)}
              />
            ))}
          </div>

          {/* Colonne 2-3 : éditeur + preview */}
          <div className="xl:col-span-2 space-y-4">
            {selected ? (
              <TemplateEditor
                key={selected.id}
                template={selected}
                onSaved={() =>
                  setFlash({ kind: 'ok', msg: 'Template mis à jour.' })
                }
                onError={(m) => setFlash({ kind: 'err', msg: m })}
              />
            ) : (
              <Card>
                <CardBody className="text-center py-16 text-neutral-500">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                  Sélectionnez un template dans la liste pour l'éditer.
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}

// ────────────────────────────────────────────────────────────
// Sous-composant : carte de template dans la liste
// ────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: CertificateTemplate;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TemplateCard({
  template,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
}: TemplateCardProps) {
  return (
    <article
      onClick={onSelect}
      className={
        'group rounded-xl border cursor-pointer transition-all p-3 ' +
        (selected
          ? 'border-primary-600 ring-2 ring-primary-200 bg-white'
          : 'border-neutral-200 hover:border-neutral-300 bg-white')
      }
    >
      {/* Preview miniature */}
      <div className="rounded-lg overflow-hidden mb-3 border border-neutral-100">
        <CertificatePreview template={template} className="!rounded-lg" />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-neutral-900 truncate">
            {template.name}
          </h3>
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            <Badge variant="neutral">{STYLE_LABELS[template.style]}</Badge>
            {template.is_default && (
              <Badge variant="warning">
                <Star className="w-3 h-3" />
                Défaut
              </Badge>
            )}
            {template.is_public && (
              <Badge variant="info">Public</Badge>
            )}
            {!template.owner && (
              <Badge variant="neutral">Plateforme</Badge>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            par {template.owner_name}
          </p>
        </div>
      </div>

      <div
        className="mt-3 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onDuplicate}
          title="Dupliquer"
        >
          <Copy className="w-4 h-4" />
          Dupliquer
        </Button>
        {template.can_edit && !template.is_default && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            title="Supprimer"
            className="text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </article>
  );
}

// ────────────────────────────────────────────────────────────
// Sous-composant : éditeur d'un template avec preview live
// ────────────────────────────────────────────────────────────

interface TemplateEditorProps {
  template: CertificateTemplate;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function TemplateEditor({ template, onSaved, onError }: TemplateEditorProps) {
  const [draft, setDraft] = useState<CertificateTemplate>(template);
  const update = useUpdateCertificateTemplate(template.id);

  // Reset draft si on change de template
  useEffect(() => {
    setDraft(template);
  }, [template]);

  const canEdit = template.can_edit;

  function set<K extends keyof CertificateTemplate>(
    key: K,
    value: CertificateTemplate[K],
  ) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function handleSave() {
    // On extrait les champs modifiables (le serializer ignore le reste)
    const {
      id: _id,
      owner: _owner,
      owner_name: _ownerName,
      can_edit: _canEdit,
      created_at: _createdAt,
      updated_at: _updatedAt,
      ...writable
    } = draft;
    try {
      await update.mutateAsync(writable);
      onSaved();
    } catch (e) {
      onError(extractApiError(e));
    }
  }

  return (
    <>
      {/* Preview live */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg text-neutral-900">
              Aperçu — {draft.name}
            </h2>
            <Badge variant="neutral">{STYLE_LABELS[draft.style]}</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <CertificatePreview template={draft} />
          <p className="mt-3 text-xs text-neutral-500 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            L'aperçu utilise des données fictives. Les variables{' '}
            <code className="bg-neutral-100 px-1 rounded">{'{{student_name}}'}</code>{' '}
            etc. seront remplacées automatiquement lors de la délivrance.
          </p>
        </CardBody>
      </Card>

      {/* Formulaire d'édition */}
      <Card>
        <CardHeader>
          <h2 className="font-bold text-lg text-neutral-900">
            Édition
            {!canEdit && (
              <Badge variant="neutral" className="ml-2">
                Lecture seule
              </Badge>
            )}
          </h2>
        </CardHeader>
        <CardBody>
          <fieldset disabled={!canEdit} className="space-y-4">
            {/* Nom & style & orientation */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Nom du template
                </label>
                <Input
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Orientation
                </label>
                <select
                  value={draft.orientation}
                  onChange={(e) =>
                    set(
                      'orientation',
                      e.target.value as CertificateOrientation,
                    )
                  }
                  className="w-full border rounded-md h-10 px-2 text-sm border-neutral-300"
                >
                  {ORIENTATIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Style visuel
              </label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(STYLE_LABELS) as CertificateTemplateStyle[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set('style', s)}
                      className={
                        'px-3 py-1 rounded-full text-xs font-semibold border transition-colors ' +
                        (draft.style === s
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50')
                      }
                    >
                      {STYLE_LABELS[s]}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Palette couleurs */}
            <div className="grid grid-cols-3 gap-3">
              <ColorField
                label="Couleur principale"
                value={draft.primary_color}
                onChange={(v) => set('primary_color', v)}
              />
              <ColorField
                label="Couleur accent"
                value={draft.accent_color}
                onChange={(v) => set('accent_color', v)}
              />
              <ColorField
                label="Couleur texte"
                value={draft.text_color}
                onChange={(v) => set('text_color', v)}
              />
            </div>

            {/* Textes */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Organisation
              </label>
              <Input
                value={draft.organization_name}
                onChange={(e) => set('organization_name', e.target.value)}
                placeholder="BestÉpargne Academy"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Titre du certificat
              </label>
              <Input
                value={draft.heading_text}
                onChange={(e) => set('heading_text', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Corps du certificat
              </label>
              <textarea
                value={draft.body_text}
                onChange={(e) => set('body_text', e.target.value)}
                rows={3}
                className="w-full border rounded-md p-2 text-sm border-neutral-300 focus:ring-2 focus:ring-primary-200 focus:border-primary-500"
              />
              <VariableHelpers
                onInsert={(v) =>
                  set('body_text', `${draft.body_text} {{${v}}}`)
                }
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Pied de page (optionnel)
              </label>
              <Input
                value={draft.footer_text}
                onChange={(e) => set('footer_text', e.target.value)}
              />
            </div>

            {/* Images */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  URL logo
                </label>
                <Input
                  value={draft.logo_url}
                  onChange={(e) => set('logo_url', e.target.value)}
                  placeholder="https://…/logo.png"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  URL signature (image)
                </label>
                <Input
                  value={draft.signature_image_url}
                  onChange={(e) =>
                    set('signature_image_url', e.target.value)
                  }
                  placeholder="https://…/signature.png"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  URL filigrane
                </label>
                <Input
                  value={draft.watermark_url}
                  onChange={(e) => set('watermark_url', e.target.value)}
                  placeholder="https://…/watermark.png"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Nom du signataire
                </label>
                <Input
                  value={draft.signature_name}
                  onChange={(e) => set('signature_name', e.target.value)}
                  placeholder="Serge Ogah"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Titre du signataire
                </label>
                <Input
                  value={draft.signature_title}
                  onChange={(e) => set('signature_title', e.target.value)}
                  placeholder="Directeur pédagogique"
                />
              </div>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-neutral-100">
              <CheckboxOption
                checked={draft.show_qr_code}
                onChange={(v) => set('show_qr_code', v)}
                label="Afficher QR de vérification"
              />
              <CheckboxOption
                checked={draft.show_serial}
                onChange={(v) => set('show_serial', v)}
                label="Afficher le numéro unique"
              />
              <CheckboxOption
                checked={draft.show_completion_date}
                onChange={(v) => set('show_completion_date', v)}
                label="Afficher la date de délivrance"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                onClick={handleSave}
                disabled={update.isPending || !canEdit}
              >
                <Save className="w-4 h-4" />
                {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              {!canEdit && (
                <span className="text-xs text-neutral-500 italic">
                  Ce template est en lecture seule — dupliquez-le pour le
                  personnaliser.
                </span>
              )}
            </div>
          </fieldset>
        </CardBody>
      </Card>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Micro-composants
// ────────────────────────────────────────────────────────────

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-neutral-700 mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded border border-neutral-300 cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="!h-10 text-xs"
        />
      </div>
    </div>
  );
}

interface CheckboxOptionProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}
function CheckboxOption({ checked, onChange, label }: CheckboxOptionProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-neutral-300"
      />
      <span>{label}</span>
    </label>
  );
}

interface VariableHelpersProps {
  onInsert: (variable: string) => void;
}
function VariableHelpers({ onInsert }: VariableHelpersProps) {
  return (
    <div className="mt-2">
      <p className="text-[11px] text-neutral-500 mb-1">
        Cliquez pour insérer une variable dynamique :
      </p>
      <div className="flex flex-wrap gap-1">
        {CERTIFICATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => onInsert(v.key)}
            className="text-[11px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-primary-50 hover:text-primary-700 text-neutral-700 font-mono"
            title={v.label}
          >
            {'{{'}
            {v.key}
            {'}}'}
          </button>
        ))}
      </div>
    </div>
  );
}
