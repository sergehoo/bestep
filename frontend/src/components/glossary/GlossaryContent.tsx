/**
 * GlossaryContent.tsx — Composant wrapper qui applique la détection du
 * lexique sur un contenu HTML (leçon, description, etc.) et affiche un
 * tooltip pour chaque terme reconnu.
 *
 * Usage typique :
 *   <GlossaryContent html={lesson.content} courseSlug={course.slug} />
 *
 * Le composant respecte la préférence utilisateur (mémorisée localStorage)
 * pour activer/désactiver la mise en évidence.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useGlossaryCourseTerms,
  useGlossaryLessonTerms,
} from '@/hooks/glossary';
import { annotateGlossary } from '@/lib/glossary-detector';
import { sanitizeRichHtml } from '@/lib/sanitize';
import { GlossaryTooltip } from './GlossaryTooltip';

const PREF_KEY = 'be-glossary-detection';

export function useGlossaryDetectionEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      return raw === null ? true : raw === '1';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, enabled ? '1' : '0');
    } catch {
      /* noop */
    }
  }, [enabled]);
  return [enabled, setEnabled];
}

interface Props {
  html: string;
  /** Cours cible pour la détection (slug prioritaire). */
  courseSlug?: string | null;
  /** Fallback : leçon cible (le backend résout le cours parent). */
  lessonId?: number | null;
  className?: string;
  /** Désactive le tooltip (rendu HTML brut) — utile pour prévisualisation. */
  disabled?: boolean;
  skipHeadings?: boolean;
}

export function GlossaryContent({
  html,
  courseSlug,
  lessonId,
  className,
  disabled = false,
  skipHeadings = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const useSlug = !disabled && !!courseSlug;
  const courseQuery = useGlossaryCourseTerms(useSlug ? courseSlug : null);
  const lessonQuery = useGlossaryLessonTerms(
    !useSlug && !disabled ? lessonId ?? null : null,
  );
  const terms = courseQuery.data?.terms ?? lessonQuery.data?.terms ?? [];
  const [enabled] = useGlossaryDetectionEnabled();

  // SEC : on assainit APRÈS l'annotation, pas avant. `annotateGlossary`
  // réinjecte du balisage autour des termes détectés ; assainir en amont
  // laisserait sa sortie non contrôlée. Le helper autorise les `data-term*`
  // que pose l'annotateur.
  const annotated = useMemo(() => {
    if (disabled || !enabled) return sanitizeRichHtml(html);
    if (!terms.length) return sanitizeRichHtml(html);
    try {
      return sanitizeRichHtml(annotateGlossary(html, terms, { skipHeadings }));
    } catch {
      return sanitizeRichHtml(html);
    }
  }, [html, terms, enabled, disabled, skipHeadings]);

  return (
    <>
      <div
        ref={containerRef}
        className={
          'glossary-scope ' + (className ?? '')
        }
        // Assaini par `sanitizeRichHtml` juste au-dessus.
        //
        // L'ancien commentaire invoquait ici « l'éditeur Tiptap + policy
        // CSP ». Les deux justifications étaient fausses : Tiptap assainit
        // dans le navigateur de l'auteur (contournable en postant sur
        // l'API), et la CSP de Django ne couvrait pas le SPA servi par
        // nginx. Voir lib/sanitize.ts.
        dangerouslySetInnerHTML={{ __html: annotated }}
      />
      {enabled && !disabled && (
        <GlossaryTooltip containerRef={containerRef} />
      )}
    </>
  );
}
