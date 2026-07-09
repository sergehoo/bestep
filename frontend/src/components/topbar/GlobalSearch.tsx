/**
 * GlobalSearch.tsx — Palette de recherche globale (R15.1).
 *
 * Ouverture : Cmd+K (macOS) / Ctrl+K (autres), ou clic sur la barre.
 * Recherche :
 *  - Catégories (client-side filtrées via /public/categories/)
 *  - Cours (fetch /public/courses/?q=…)
 *  - Formateurs : R16 (endpoint à créer)
 *  - Certificats / articles / ressources : R16
 *
 * L'historique de recherche est persisté dans localStorage.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  X,
  BookOpen,
  Tag,
  UserRound,
  ArrowRight,
  Clock,
  Command,
} from 'lucide-react';
import { usePublicCourses, usePublicCategories } from '@/hooks/queries';
import { cn } from '@/lib/utils';

const HISTORY_KEY = 'be-search-history';
const HISTORY_MAX = 6;

interface Props {
  open: boolean;
  onClose: () => void;
}

type ResultType = 'course' | 'category' | 'history';

interface ResultItem {
  type: ResultType;
  key: string;
  label: string;
  meta?: string;
  href: string;
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushHistory(term: string) {
  const cur = loadHistory().filter((t) => t !== term);
  const next = [term, ...cur].slice(0, HISTORY_MAX);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function GlobalSearchDialog({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [history, setHistory] = useState<string[]>(() => loadHistory());

  const shouldFetch = query.trim().length >= 2;
  const { data: courses } = usePublicCourses(
    shouldFetch ? { q: query.trim(), page_size: 6 } : {},
  );
  const { data: categories = [] } = usePublicCategories();

  // Reset au open/close
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setHistory(loadHistory());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Esc close + lock body scroll
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const results = useMemo<ResultItem[]>(() => {
    if (!shouldFetch) {
      return history.map((term) => ({
        type: 'history',
        key: `h-${term}`,
        label: term,
        href: `/catalogue?q=${encodeURIComponent(term)}`,
      }));
    }
    const q = query.trim().toLowerCase();
    const cats: ResultItem[] = categories
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map((c) => ({
        type: 'category',
        key: `cat-${c.id}`,
        label: c.name,
        meta: 'Catégorie',
        href: `/catalogue?category=${encodeURIComponent(c.slug)}`,
      }));
    const items: ResultItem[] = (courses?.results ?? []).map((c) => ({
      type: 'course',
      key: `crs-${c.id}`,
      label: c.title,
      meta: c.category?.name || 'Cours',
      href: `/courses/${c.slug}`,
    }));
    return [...cats, ...items];
  }, [query, courses, categories, history, shouldFetch]);

  const commit = useCallback(
    (item: ResultItem | null) => {
      const target = item ?? results[activeIndex];
      if (!target) {
        // Fallback : chercher dans le catalogue
        const term = query.trim();
        if (term) {
          pushHistory(term);
          navigate(`/catalogue?q=${encodeURIComponent(term)}`);
        }
      } else {
        if (target.type !== 'history') pushHistory(query.trim() || target.label);
        navigate(target.href);
      }
      onClose();
    },
    [results, activeIndex, query, navigate, onClose],
  );

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60] bg-neutral-900/60 backdrop-blur-sm flex items-start justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Recherche globale"
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="mt-16 sm:mt-24 w-full max-w-2xl bg-white rounded-2xl shadow-lift overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100">
              <Search className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(results.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    commit(null);
                  }
                }}
                placeholder="Rechercher un cours, une catégorie, un formateur…"
                className="flex-1 min-w-0 bg-transparent text-sm sm:text-base text-neutral-900 outline-none placeholder:text-neutral-400"
                autoComplete="off"
                spellCheck={false}
                aria-label="Rechercher"
                aria-autocomplete="list"
                aria-activedescendant={
                  results[activeIndex]
                    ? `search-item-${results[activeIndex].key}`
                    : undefined
                }
              />
              <kbd className="hidden sm:inline text-[10px] font-mono text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-200">
                ESC
              </kbd>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-neutral-100"
                aria-label="Fermer"
              >
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>

            {/* Résultats */}
            <div className="max-h-[60vh] overflow-y-auto">
              {!shouldFetch && history.length > 0 && (
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                    Récentes
                  </p>
                  <button
                    onClick={clearHistory}
                    className="text-[11px] text-neutral-400 hover:text-neutral-700"
                  >
                    Effacer
                  </button>
                </div>
              )}
              {shouldFetch && results.length > 0 && (
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
                  Résultats
                </p>
              )}
              {results.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-neutral-500">
                  {shouldFetch
                    ? "Aucun résultat pour cette recherche."
                    : "Tapez au moins 2 caractères pour rechercher."}
                </div>
              )}
              <ul role="listbox">
                {results.map((r, i) => (
                  <li
                    key={r.key}
                    id={`search-item-${r.key}`}
                    role="option"
                    aria-selected={i === activeIndex}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => commit(r)}
                      className={cn(
                        'w-full text-left px-4 py-2.5 flex items-center gap-3 transition',
                        i === activeIndex
                          ? 'bg-primary-50'
                          : 'hover:bg-neutral-50',
                      )}
                    >
                      <span
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          r.type === 'course' && 'bg-primary-100 text-primary-700',
                          r.type === 'category' && 'bg-accent-100 text-accent-700',
                          r.type === 'history' && 'bg-neutral-100 text-neutral-500',
                        )}
                      >
                        {r.type === 'course' && <BookOpen className="w-4 h-4" />}
                        {r.type === 'category' && <Tag className="w-4 h-4" />}
                        {r.type === 'history' && <Clock className="w-4 h-4" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold truncate block">
                          {r.label}
                        </span>
                        {r.meta && (
                          <span className="text-[11px] text-neutral-500">
                            {r.meta}
                          </span>
                        )}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>

              {/* Sections placeholder */}
              {shouldFetch && (
                <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50/50">
                  <p className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                    <UserRound className="w-3 h-3" />
                    Formateurs, certificats et articles arrivent en R16.
                  </p>
                </div>
              )}
            </div>

            {/* Footer raccourcis */}
            <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-neutral-100 text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1">
                <kbd className="font-mono px-1 rounded border border-neutral-200 bg-white text-[10px]">
                  ↑↓
                </kbd>
                Naviguer
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="font-mono px-1 rounded border border-neutral-200 bg-white text-[10px]">
                  ↵
                </kbd>
                Ouvrir
              </span>
              <span className="inline-flex items-center gap-1 ml-auto">
                <Command className="w-3 h-3" />
                <kbd className="font-mono px-1 rounded border border-neutral-200 bg-white text-[10px]">
                  K
                </kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook : bind global Cmd+K / Ctrl+K + Slash + expose open state.
 */
export function useGlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      // Cmd+K : toggle
      if (cmd && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Slash rapide (hors input)
      if (
        e.key === '/' &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { open, setOpen };
}
