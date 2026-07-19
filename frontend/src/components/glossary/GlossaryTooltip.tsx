/**
 * GlossaryTooltip.tsx — Popover accessible pour afficher la définition
 * d'un terme du lexique. Écoute les clics sur les <button.glossary-term>
 * qui ont été injectés par le détecteur (`lib/glossary-detector.ts`).
 *
 * Accessibilité :
 *   - Ouverture au clic (mobile + desktop) et au focus clavier.
 *   - Fermeture avec Échap et clic extérieur.
 *   - role="dialog" + aria-labelledby pour lecteurs d'écran.
 *   - Lien vers la page détail /lexique/:slug.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink, BookOpen } from 'lucide-react';
import api from '@/lib/api';
import type { GlossaryTermDetail } from '@/lib/glossary-types';

interface TooltipState {
  slug: string;
  anchor: HTMLElement;
  x: number;
  y: number;
  above: boolean;
}

interface Props {
  /** Ref d'un container React qui contient les <button.glossary-term>. */
  containerRef: React.RefObject<HTMLElement | null>;
}

export function GlossaryTooltip({ containerRef }: Props) {
  const [state, setState] = useState<TooltipState | null>(null);
  const [term, setTerm] = useState<GlossaryTermDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Cache in-memory pour éviter les rerequêtes.
  const cacheRef = useRef<Record<string, GlossaryTermDetail>>({});

  const closeTooltip = useCallback(() => {
    setState(null);
    setTerm(null);
  }, []);

  /** Positionne le popover par rapport à un élément ancré. */
  const anchorTo = useCallback((el: HTMLElement, slug: string) => {
    const rect = el.getBoundingClientRect();
    const preferredWidth = 340;
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 260 && rect.top > 260;
    // Clamp X pour rester dans le viewport.
    const rawX = rect.left + rect.width / 2 - preferredWidth / 2;
    const x = Math.max(
      8,
      Math.min(window.innerWidth - preferredWidth - 8, rawX),
    );
    const y = above ? rect.top - 8 : rect.bottom + 8;
    setState({ slug, anchor: el, x, y, above });
  }, []);

  /** Fetch la définition du terme (avec cache local). */
  useEffect(() => {
    if (!state?.slug) return;
    if (cacheRef.current[state.slug]) {
      setTerm(cacheRef.current[state.slug]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<GlossaryTermDetail>(`/glossary/terms/${state.slug}/`)
      .then(({ data }) => {
        if (cancelled) return;
        cacheRef.current[state.slug] = data;
        setTerm(data);
      })
      .catch(() => setTerm(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [state?.slug]);

  /** Event listener délégué sur le container : capte les clics sur les
   *  boutons .glossary-term. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest<HTMLButtonElement>('button.glossary-term');
      if (!btn || !container.contains(btn)) return;
      e.preventDefault();
      const slug = btn.getAttribute('data-glossary-slug');
      if (!slug) return;
      anchorTo(btn, slug);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTooltip();
    };
    const onOutside = (e: MouseEvent) => {
      const box = boxRef.current;
      const target = e.target as HTMLElement | null;
      if (!box || !target) return;
      if (
        target !== box
        && !box.contains(target)
        && !target.closest('button.glossary-term')
      ) {
        closeTooltip();
      }
    };
    container.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    // Repositionne au scroll / resize.
    const onScroll = () => {
      if (!state) return;
      if (!document.body.contains(state.anchor)) {
        closeTooltip();
        return;
      }
      anchorTo(state.anchor, state.slug);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      container.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [containerRef, anchorTo, closeTooltip, state]);

  if (!state) return null;

  const shortDef =
    term?.short_definition
    || (loading ? 'Chargement…' : 'Définition indisponible.');

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="glossary-tt-title"
      className="fixed z-[70] w-[340px] max-w-[92vw] bg-white dark:bg-neutral-900 border-2 border-primary-200 dark:border-primary-800 rounded-xl shadow-2xl p-4 text-sm"
      style={{
        left: state.x,
        top: state.above ? undefined : state.y,
        bottom: state.above ? window.innerHeight - state.y : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p
            id="glossary-tt-title"
            className="font-extrabold text-primary-800 dark:text-primary-200 truncate"
          >
            {term?.word || state.anchor.textContent || '…'}
          </p>
          {term?.category?.name && (
            <p className="text-[11px] uppercase tracking-wide text-neutral-500 mt-0.5">
              {term.category.name}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={closeTooltip}
          aria-label="Fermer"
          className="p-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
        {shortDef}
      </p>

      {term?.pronunciation && (
        <p className="mt-2 text-xs italic text-neutral-500">
          Prononciation : {term.pronunciation}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Link
          to={`/lexique/${state.slug}`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Voir la définition complète
        </Link>
        {term?.external_source && (
          <a
            href={term.external_source}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-primary-600"
          >
            <ExternalLink className="w-3 h-3" />
            Source
          </a>
        )}
      </div>
    </div>
  );
}
