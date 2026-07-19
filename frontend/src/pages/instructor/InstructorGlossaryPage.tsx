/**
 * InstructorGlossaryPage.tsx — /formateur/lexique.
 *
 * Le formateur peut :
 *   - Voir la liste de ses termes (avec statut : draft/pending/validated…).
 *   - Créer un terme via un modal (word, short_def, long_def, catégorie).
 *   - Modifier un terme existant.
 *   - Soumettre un brouillon pour validation admin.
 *   - Archiver / retirer un terme.
 */
import { useMemo, useState } from 'react';
import {
  BookOpen,
  Plus,
  Send,
  Edit3,
  Trash2,
  Filter,
  Search,
  Sparkles,
} from 'lucide-react';
import { InstructorShell } from '@/components/instructor/InstructorShell';
import { Spinner } from '@/components/ui/Spinner';
import {
  useCreateGlossaryTerm,
  useDeleteGlossaryTerm,
  useGlossaryCategories,
  useInstructorGlossaryTerms,
  useSubmitGlossaryTerm,
  useUpdateGlossaryTerm,
  type GlossaryTermWritePayload,
} from '@/hooks/glossary';
import type { GlossaryTermListItem } from '@/lib/glossary-types';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  validated: 'Validé',
  rejected: 'Rejeté',
  archived: 'Archivé',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-neutral-200 text-neutral-700',
  pending: 'bg-amber-100 text-amber-800',
  validated: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  archived: 'bg-neutral-100 text-neutral-500',
};

interface TermFormState {
  id?: number;
  word: string;
  short_definition: string;
  long_definition: string;
  category: string; // stocké en id string pour le <select>
  level: 'beginner' | 'intermediate' | 'advanced';
  domain: string;
  variantsText: string; // 1 par ligne
  status: 'draft' | 'pending';
}

const EMPTY_FORM: TermFormState = {
  word: '',
  short_definition: '',
  long_definition: '',
  category: '',
  level: 'beginner',
  domain: '',
  variantsText: '',
  status: 'draft',
};

function TermFormDialog({
  open,
  initial,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  initial: TermFormState;
  onClose: () => void;
  onSubmit: (payload: GlossaryTermWritePayload, id?: number) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<TermFormState>(initial);
  const { data: categories } = useGlossaryCategories();

  // Re-hydrate le form quand initial change (edit → create).
  useMemo(() => {
    setForm(initial);
  }, [initial]);

  if (!open) return null;

  const submit = () => {
    const variants = form.variantsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((v) => ({ variant: v, variant_type: 'synonym' as const }));
    const payload: GlossaryTermWritePayload = {
      word: form.word.trim(),
      short_definition: form.short_definition.trim(),
      long_definition: form.long_definition.trim(),
      category: form.category ? Number(form.category) : null,
      level: form.level,
      domain: form.domain.trim(),
      status: form.status,
      variants,
    };
    onSubmit(payload, form.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-lift overflow-y-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white">
            {form.id ? 'Modifier le terme' : 'Nouveau terme du lexique'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="p-5 space-y-4 text-sm">
          <label className="block">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Mot ou expression <span className="text-rose-500">*</span>
            </span>
            <input
              value={form.word}
              onChange={(e) => setForm((f) => ({ ...f, word: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              maxLength={200}
              placeholder="Ex. Diversification"
            />
          </label>

          <label className="block">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Définition courte <span className="text-rose-500">*</span>
              <span className="ml-2 text-xs text-neutral-500">
                ({form.short_definition.length}/400)
              </span>
            </span>
            <textarea
              value={form.short_definition}
              onChange={(e) => setForm((f) => ({ ...f, short_definition: e.target.value.slice(0, 400) }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              rows={2}
              maxLength={400}
              placeholder="Résumé en une phrase pour la tooltip."
            />
          </label>

          <label className="block">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Définition complète
            </span>
            <textarea
              value={form.long_definition}
              onChange={(e) => setForm((f) => ({ ...f, long_definition: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              rows={5}
              placeholder="HTML autorisé (h3, p, ul, strong, em…)."
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Catégorie</span>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              >
                <option value="">— Aucune —</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Niveau</span>
              <select
                value={form.level}
                onChange={(e) =>
                  setForm((f) => ({ ...f, level: e.target.value as TermFormState['level'] }))
                }
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              >
                <option value="beginner">Débutant</option>
                <option value="intermediate">Intermédiaire</option>
                <option value="advanced">Avancé</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Domaine</span>
              <input
                value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value.slice(0, 80) }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
                placeholder="finance, épargne…"
              />
            </label>
          </div>

          <label className="block">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Synonymes / variantes
              <span className="ml-2 text-xs text-neutral-500">(1 par ligne)</span>
            </span>
            <textarea
              value={form.variantsText}
              onChange={(e) => setForm((f) => ({ ...f, variantsText: e.target.value }))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              rows={3}
              placeholder={'Ex. :\ndiversifier\nrépartition\n'}
            />
          </label>

          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.status === 'pending'}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.checked ? 'pending' : 'draft',
                }))
              }
            />
            <span>
              Soumettre immédiatement pour validation par l'équipe (sinon,
              le terme reste en brouillon).
            </span>
          </label>
        </div>
        <footer className="px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={isPending || !form.word || !form.short_definition}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-bold"
          >
            {isPending ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Créer'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function InstructorGlossaryPage() {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<TermFormState>(EMPTY_FORM);

  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      status: statusFilter || undefined,
    }),
    [q, statusFilter],
  );
  const { data, isLoading } = useInstructorGlossaryTerms(filters);
  const createMut = useCreateGlossaryTerm();
  const updateMut = useUpdateGlossaryTerm();
  const deleteMut = useDeleteGlossaryTerm();
  const submitMut = useSubmitGlossaryTerm();

  const openCreate = () => {
    setFormInitial({ ...EMPTY_FORM });
    setFormOpen(true);
  };
  const openEdit = (t: GlossaryTermListItem) => {
    setFormInitial({
      id: t.id,
      word: t.word,
      short_definition: t.short_definition,
      long_definition: '',
      category: t.category ? String(t.category) : '',
      level: t.level,
      domain: t.domain,
      variantsText: '',
      status: 'draft',
    });
    setFormOpen(true);
  };

  const handleSubmit = async (payload: GlossaryTermWritePayload, id?: number) => {
    if (id) {
      await updateMut.mutateAsync({ id, payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    setFormOpen(false);
  };

  const isMutating = createMut.isPending || updateMut.isPending;

  return (
    <InstructorShell title="Lexique">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-primary-600 mb-1">
              <BookOpen className="w-4 h-4" />
              LEXIQUE PÉDAGOGIQUE
            </div>
            <h1 className="text-2xl font-extrabold text-neutral-900 dark:text-white">
              Mes termes
            </h1>
            <p className="text-sm text-neutral-500">
              Créez, modifiez et soumettez à validation les entrées du
              lexique pour enrichir vos formations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold"
            >
              <Plus className="w-4 h-4" /> Nouveau terme
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher dans mes termes…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-neutral-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 dark:text-white"
            >
              <option value="">Tous statuts</option>
              <option value="draft">Brouillon</option>
              <option value="pending">En attente</option>
              <option value="validated">Validé</option>
              <option value="rejected">Rejeté</option>
              <option value="archived">Archivé</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          {isLoading && !data && (
            <div className="py-16 flex justify-center">
              <Spinner label="Chargement…" />
            </div>
          )}
          {data && data.results.length === 0 && (
            <div className="py-16 text-center">
              <Sparkles className="w-8 h-8 mx-auto text-neutral-400 mb-3" />
              <p className="text-sm text-neutral-500">
                Vous n'avez pas encore créé de terme.
              </p>
              <button
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-bold"
              >
                <Plus className="w-3 h-3" /> Créer mon premier terme
              </button>
            </div>
          )}
          {data && data.results.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="text-left px-4 py-3">Terme</th>
                  <th className="text-left px-4 py-3">Définition</th>
                  <th className="text-left px-4 py-3">Catégorie</th>
                  <th className="text-left px-4 py-3">Statut</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((t) => (
                  <tr
                    key={t.id}
                    className="border-t border-neutral-100 dark:border-neutral-800"
                  >
                    <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-white">
                      {t.word}
                      {t.variants_count > 0 && (
                        <span className="ml-2 text-[10px] text-neutral-400">
                          +{t.variants_count}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 max-w-md truncate">
                      {t.short_definition}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {t.category_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'px-2 py-0.5 rounded-full text-[11px] font-bold ' +
                          (STATUS_COLOR[
                            (t as unknown as { status?: string }).status
                              || 'draft'
                          ] || STATUS_COLOR.draft)
                        }
                      >
                        {STATUS_LABEL[
                          (t as unknown as { status?: string }).status
                            || 'draft'
                        ] || 'Brouillon'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => submitMut.mutate(t.id)}
                          className="p-1.5 rounded-md hover:bg-primary-50 text-primary-600 dark:hover:bg-primary-900/20"
                          title="Soumettre pour validation"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(t)}
                          className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          title="Modifier"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Archiver le terme « ${t.word} » ? Il ne sera plus détecté dans les leçons.`,
                              )
                            ) {
                              deleteMut.mutate(t.id);
                            }
                          }}
                          className="p-1.5 rounded-md hover:bg-rose-50 text-rose-600 dark:hover:bg-rose-900/20"
                          title="Archiver"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <TermFormDialog
        open={formOpen}
        initial={formInitial}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
        isPending={isMutating}
      />
    </InstructorShell>
  );
}
