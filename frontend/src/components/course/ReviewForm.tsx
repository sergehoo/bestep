/**
 * ReviewForm.tsx — Formulaire d'avis apprenant (R17.3).
 *
 * Comportement :
 *  - Charge l'avis courant via `useMyReview(courseId)`
 *  - Si existant → mode édition avec sélecteur d'étoiles hover, textarea,
 *    boutons Enregistrer / Supprimer
 *  - Si absent   → mode création (rating + comment)
 *  - Non-connecté → CTA Connexion
 *  - Non-inscrit  → 403 backend affiché en message
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, Send, Trash2, PenSquare, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useIsAuthenticated } from '@/stores/auth';
import {
  useMyReview,
  useCreateReview,
  useUpdateReview,
  useDeleteReview,
} from '@/hooks/reviews';
import { extractApiError, cn } from '@/lib/utils';

interface Props {
  courseId: number | string;
  courseSlug?: string;
  className?: string;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Très décevant',
  2: 'Décevant',
  3: 'Correct',
  4: 'Bien',
  5: 'Excellent',
};

export function ReviewForm({ courseId, courseSlug, className }: Props) {
  const isAuthed = useIsAuthenticated();
  const { data, isLoading } = useMyReview(isAuthed ? courseId : undefined);
  const create = useCreateReview(courseId);
  const update = useUpdateReview(courseId);
  const remove = useDeleteReview(courseId);

  const existing = data?.review ?? null;
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [flash, setFlash] = useState<
    { kind: 'ok' | 'err'; msg: string } | null
  >(null);
  const [editing, setEditing] = useState(false);

  // Hydratation initiale depuis l'existant
  useEffect(() => {
    if (existing) {
      setRating(existing.rating);
      setComment(existing.comment || '');
    } else {
      setRating(0);
      setComment('');
    }
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthed) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-primary-100 bg-primary-50/40 p-5',
          className,
        )}
      >
        <p className="font-bold text-neutral-900 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary-600" />
          Envie de laisser votre avis ?
        </p>
        <p className="text-sm text-neutral-600 mt-1">
          Connectez-vous et suivez ce cours pour partager votre expérience.
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            to={`/login?next=/courses/${courseSlug ?? ''}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700"
          >
            Se connecter
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border border-neutral-200 hover:bg-neutral-50"
          >
            Créer un compte
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="py-6 flex justify-center">
        <Spinner label="Chargement…" />
      </div>
    );
  }

  const hasExistingReview = !!existing;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFlash(null);
    if (rating < 1 || rating > 5) {
      setFlash({ kind: 'err', msg: 'Sélectionnez une note (1 à 5 étoiles).' });
      return;
    }
    try {
      if (hasExistingReview) {
        await update.mutateAsync({ rating, comment });
        setFlash({ kind: 'ok', msg: 'Votre avis a été mis à jour.' });
      } else {
        await create.mutateAsync({ rating, comment });
        setFlash({ kind: 'ok', msg: 'Merci pour votre avis !' });
      }
      setEditing(false);
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: extractApiError(
          err,
          'Impossible d\'enregistrer votre avis. Vérifiez que vous êtes inscrit·e au cours.',
        ),
      });
    }
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer votre avis ?')) return;
    setFlash(null);
    try {
      await remove.mutateAsync();
      setRating(0);
      setComment('');
      setEditing(false);
      setFlash({ kind: 'ok', msg: 'Avis supprimé.' });
    } catch (err) {
      setFlash({
        kind: 'err',
        msg: extractApiError(err, 'Suppression impossible.'),
      });
    }
  }

  const submitting = create.isPending || update.isPending;

  // ─── Vue synthèse (avis déjà posté, pas en édition)
  if (hasExistingReview && !editing) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-neutral-100 bg-white p-4 sm:p-5 shadow-soft',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs font-bold text-primary-600 uppercase tracking-wider">
              Votre avis
            </p>
            <div className="mt-1 flex items-center gap-2">
              <StarsDisplay value={existing.rating} />
              <p className="text-sm font-semibold">
                {existing.rating}/5 — {RATING_LABELS[existing.rating]}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-neutral-200 hover:bg-neutral-50"
            >
              <PenSquare className="w-3.5 h-3.5" />
              Modifier
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
          </div>
        </div>
        {existing.comment && (
          <p className="mt-3 text-sm text-neutral-700 whitespace-pre-line">
            {existing.comment}
          </p>
        )}
        {flash && <FlashLine flash={flash} />}
      </div>
    );
  }

  // ─── Vue formulaire (création ou édition)
  return (
    <form
      onSubmit={submit}
      className={cn(
        'rounded-2xl border border-primary-200 bg-primary-50/30 p-4 sm:p-5 space-y-3',
        className,
      )}
    >
      <div>
        <p className="text-xs font-bold text-primary-700 uppercase tracking-wider">
          {hasExistingReview ? 'Modifier votre avis' : 'Laisser un avis'}
        </p>
        <p className="text-sm text-neutral-600 mt-1">
          Votre retour aide les autres apprenants à choisir.
        </p>
      </div>

      {/* Rating */}
      <fieldset>
        <legend className="text-xs font-semibold text-neutral-700 mb-1.5">
          Note *
        </legend>
        <div
          role="radiogroup"
          aria-label="Note"
          className="inline-flex items-center gap-1"
          onMouseLeave={() => setHoverRating(0)}
        >
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = (hoverRating || rating) >= star;
            return (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} sur 5`}
                onMouseEnter={() => setHoverRating(star)}
                onFocus={() => setHoverRating(star)}
                onClick={() => setRating(star)}
                className="p-1 rounded transition hover:scale-110"
              >
                <Star
                  className={cn(
                    'w-7 h-7 transition',
                    filled
                      ? 'fill-accent-500 text-accent-500'
                      : 'text-neutral-300',
                  )}
                />
              </button>
            );
          })}
          <span className="ml-2 text-xs font-semibold text-neutral-600">
            {hoverRating || rating
              ? RATING_LABELS[hoverRating || rating]
              : 'Sélectionnez'}
          </span>
        </div>
      </fieldset>

      <Textarea
        label="Commentaire (optionnel)"
        placeholder="Partagez ce qui vous a plu, ce qui pourrait être amélioré, à qui vous recommandez ce cours…"
        rows={4}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={2000}
        helper={`${comment.length}/2000 caractères`}
      />

      {flash && <FlashLine flash={flash} />}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-neutral-400">
          Un seul avis par cours. Vous pouvez le modifier à tout moment.
        </p>
        <div className="flex gap-2">
          {hasExistingReview && editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                if (existing) {
                  setRating(existing.rating);
                  setComment(existing.comment);
                }
              }}
            >
              Annuler
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={rating < 1}
          >
            <Send className="w-3.5 h-3.5" />
            {hasExistingReview ? 'Mettre à jour' : 'Publier mon avis'}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────

function StarsDisplay({ value }: { value: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            'w-4 h-4',
            s <= value
              ? 'fill-accent-500 text-accent-500'
              : 'text-neutral-300',
          )}
        />
      ))}
    </span>
  );
}

function FlashLine({
  flash,
}: {
  flash: { kind: 'ok' | 'err'; msg: string };
}) {
  return (
    <p
      role="status"
      className={
        flash.kind === 'ok'
          ? 'text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2'
          : 'text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2'
      }
    >
      {flash.msg}
    </p>
  );
}
