/**
 * GlossaryQuickAddDialog.tsx — Modal léger "Ajouter au lexique".
 *
 * Utilisation typique depuis l'éditeur de leçon :
 *
 *   const [openGloss, setOpenGloss] = useState(false);
 *   const [initialWord, setInitialWord] = useState('');
 *
 *   const onAddToGlossary = () => {
 *     const w = editorRef.current?.getSelectedText() ?? '';
 *     setInitialWord(w);
 *     setOpenGloss(true);
 *   };
 *
 *   <GlossaryQuickAddDialog
 *     open={openGloss}
 *     initialWord={initialWord}
 *     courseId={course.id}
 *     onClose={() => setOpenGloss(false)}
 *   />
 */
import { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  useCreateGlossaryTerm,
  useGlossaryCategories,
  useGlossarySearch,
  type GlossaryTermWritePayload,
} from '@/hooks/glossary';

interface Props {
  open: boolean;
  onClose: () => void;
  initialWord: string;
  /** Contexte cours : si fourni, propose scope="course" par défaut. */
  courseId?: number | null;
}

export function GlossaryQuickAddDialog({
  open,
  onClose,
  initialWord,
  courseId,
}: Props) {
  const [word, setWord] = useState(initialWord);
  const [shortDef, setShortDef] = useState('');
  const [longDef, setLongDef] = useState('');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    'beginner',
  );
  const [scope, setScope] = useState<'global' | 'course'>(
    courseId ? 'course' : 'global',
  );
  const [variantsText, setVariantsText] = useState('');
  const [submitForValidation, setSubmitForValidation] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-hydrate le mot initial quand la modal s'ouvre avec un nouveau mot.
  useEffect(() => {
    if (open) {
      setWord(initialWord.trim());
      setShortDef('');
      setLongDef('');
      setCategory('');
      setLevel('beginner');
      setScope(courseId ? 'course' : 'global');
      setVariantsText('');
      setError(null);
    }
  }, [open, initialWord, courseId]);

  const { data: categories } = useGlossaryCategories();
  const trimmedWord = word.trim();
  // Vérifie si le mot existe déjà — l'API retourne un match par
  // startswith / icontains (voir GlossaryTermSearchView).
  const { data: matches } = useGlossarySearch(
    open && trimmedWord.length >= 2 ? trimmedWord : '',
  );
  const exactMatch = useMemo(() => {
    const w = trimmedWord.toLowerCase();
    return (matches || []).find(
      (m) => m.word.toLowerCase() === w,
    );
  }, [matches, trimmedWord]);

  const createMut = useCreateGlossaryTerm();

  const submit = async () => {
    if (!trimmedWord) {
      setError('Le mot ou l\'expression est requis.');
      return;
    }
    if (!shortDef.trim()) {
      setError('La définition courte est requise.');
      return;
    }
    const variants = variantsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((v) => ({ variant: v, variant_type: 'synonym' as const }));
    const payload: GlossaryTermWritePayload = {
      word: trimmedWord,
      short_definition: shortDef.trim(),
      long_definition: longDef.trim(),
      category: category ? Number(category) : null,
      level,
      scope,
      status: submitForValidation ? 'pending' : 'draft',
      variants,
    };
    try {
      await createMut.mutateAsync(payload);
      onClose();
    } catch (e) {
      const anyErr = e as { response?: { data?: { detail?: string } } };
      setError(
        anyErr?.response?.data?.detail
          || 'Erreur : impossible de créer le terme.',
      );
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-2xl shadow-lift overflow-y-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-extrabold text-neutral-900 dark:text-white flex-1">
            Ajouter au lexique
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5 space-y-3 text-sm">
          {exactMatch && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-xs">
              <strong>Attention :</strong> « {exactMatch.word} » existe
              déjà dans le lexique. Voulez-vous créer un doublon ou l'associer
              à votre cours plutôt ?
            </div>
          )}

          <label className="block">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Mot ou expression <span className="text-rose-500">*</span>
            </span>
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              maxLength={200}
              autoFocus
            />
          </label>

          <label className="block">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Définition courte <span className="text-rose-500">*</span>
              <span className="ml-2 text-xs text-neutral-500">
                ({shortDef.length}/400)
              </span>
            </span>
            <textarea
              value={shortDef}
              onChange={(e) => setShortDef(e.target.value.slice(0, 400))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              rows={2}
              maxLength={400}
              placeholder="Une phrase claire pour la tooltip dans les leçons."
            />
          </label>

          <label className="block">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              Définition complète (facultatif)
            </span>
            <textarea
              value={longDef}
              onChange={(e) => setLongDef(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              rows={3}
              placeholder="HTML autorisé."
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Catégorie
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              >
                <option value="">—</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Niveau
              </span>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as typeof level)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              >
                <option value="beginner">Débutant</option>
                <option value="intermediate">Intermédiaire</option>
                <option value="advanced">Avancé</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Synonymes (1 par ligne)
            </span>
            <textarea
              value={variantsText}
              onChange={(e) => setVariantsText(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 dark:text-white"
              rows={2}
              placeholder="ex. diversifier"
            />
          </label>

          <div className="text-xs">
            <p className="font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
              Portée
            </p>
            <label className="inline-flex items-center gap-1.5 mr-4">
              <input
                type="radio"
                checked={scope === 'course'}
                onChange={() => setScope('course')}
                disabled={!courseId}
              />
              Ce cours uniquement
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
              />
              Global (toute la plateforme)
            </label>
          </div>

          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={submitForValidation}
              onChange={(e) => setSubmitForValidation(e.target.checked)}
            />
            <span>
              Soumettre pour validation par l'équipe (sinon, brouillon).
            </span>
          </label>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
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
            disabled={createMut.isPending || !trimmedWord || !shortDef.trim()}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-bold"
          >
            {createMut.isPending ? 'Ajout…' : 'Ajouter au lexique'}
          </button>
        </footer>
      </div>
    </div>
  );
}
