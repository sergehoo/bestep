/**
 * LandingHero.tsx — Hero premium de la landing publique (R11.1).
 *
 * Design :
 *  - Layout 2 colonnes desktop (texte gauche, illustration + floating
 *    cards droite), 1 colonne mobile
 *  - Titre XXL avec highlight jaune, sous-titre, 2 CTA
 *  - Barre de recherche autocomplete (suggestions live sur les cours)
 *  - Illustration = mockup catalogue avec 3 floating cards flottantes
 *    (note, apprenants, satisfaction)
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  Sparkles,
  Star,
  Users,
  TrendingUp,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { usePublicCourses, usePublicCategories } from '@/hooks/queries';

// ─────────────────────────────────────────────────────────────
// Mockup — rotation dynamique de cours affichés sous la vidéo
// ─────────────────────────────────────────────────────────────

interface MockCourse {
  category: string;
  title: string;
  meta: string;
  rating: string;
  reviews: string;
  price: string;
  /** Classes Tailwind pour le badge de catégorie. */
  badge: string;
  /** Couleur du prix. */
  priceColor: string;
}

const MOCK_COURSES: MockCourse[] = [
  {
    category: 'Finance',
    title: 'Investir en bourse : les fondamentaux',
    meta: '12h · 42 leçons · Niveau intermédiaire',
    rating: '4.9',
    reviews: '1 234',
    price: '45 000 XOF',
    badge: 'bg-primary-100 text-primary-700',
    priceColor: 'text-primary-700',
  },
  {
    category: 'Immobilier',
    title: 'Constituer un patrimoine immobilier rentable',
    meta: '9h · 28 leçons · Niveau débutant',
    rating: '4.8',
    reviews: '892',
    price: '35 000 XOF',
    badge: 'bg-accent-100 text-accent-700',
    priceColor: 'text-accent-700',
  },
  {
    category: 'Épargne',
    title: 'Maîtriser son budget et épargner intelligemment',
    meta: '6h · 24 leçons · Tous niveaux',
    rating: '4.9',
    reviews: '2 156',
    price: 'Gratuit',
    badge: 'bg-emerald-100 text-emerald-700',
    priceColor: 'text-emerald-700',
  },
  {
    category: 'Entrepreneuriat',
    title: 'Lancer son business rentable en 90 jours',
    meta: '15h · 56 leçons · Niveau avancé',
    rating: '4.7',
    reviews: '648',
    price: '65 000 XOF',
    badge: 'bg-violet-100 text-violet-700',
    priceColor: 'text-violet-700',
  },
  {
    category: 'Crypto',
    title: 'Comprendre la crypto et la Web3 sans risque',
    meta: '8h · 32 leçons · Niveau intermédiaire',
    rating: '4.6',
    reviews: '1 012',
    price: '28 000 XOF',
    badge: 'bg-cyan-100 text-cyan-700',
    priceColor: 'text-cyan-700',
  },
];

export function LandingHero() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [openSuggest, setOpenSuggest] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Rotation auto du mockup toutes les 4.5s
  const [mockIndex, setMockIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setMockIndex((i) => (i + 1) % MOCK_COURSES.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);
  const mock = MOCK_COURSES[mockIndex];

  // Suggestions live : petit fetch quand la query fait 2+ chars
  const shouldFetch = query.trim().length >= 2;
  const { data: suggestData } = usePublicCourses(
    shouldFetch ? { q: query.trim(), page_size: 5 } : {},
  );
  const { data: categories = [] } = usePublicCategories();

  const suggestions = useMemo(() => {
    if (!shouldFetch) return [];
    const q = query.toLowerCase();
    const cats = categories
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 3)
      .map((c) => ({
        type: 'category' as const,
        label: c.name,
        slug: c.slug,
      }));
    const courses = (suggestData?.results ?? []).slice(0, 5).map((c) => ({
      type: 'course' as const,
      label: c.title,
      slug: c.slug,
      category: c.category?.name,
    }));
    return [...cats, ...courses];
  }, [suggestData, categories, query, shouldFetch]);

  // Fermer les suggestions au click extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpenSuggest(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/catalogue?q=${encodeURIComponent(q)}` : '/catalogue');
  };

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-500 text-white"
      aria-labelledby="landing-hero-title"
    >
      {/* Motif décoratif */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.15) 0%, transparent 45%), radial-gradient(circle at 85% 80%, rgba(234,179,8,0.28) 0%, transparent 45%)',
        }}
      />

      <div className="relative container mx-auto px-4 max-w-6xl py-10 sm:py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          {/* Colonne gauche */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-[11px] font-semibold uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              BestÉpargne Academy
            </span>
            <h1
              id="landing-hero-title"
              className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight"
            >
              Développez vos compétences financières et professionnelles
              <span className="text-accent-300"> avec les meilleurs experts.</span>
            </h1>
            <p className="mt-4 text-sm sm:text-base lg:text-lg text-primary-100 max-w-xl">
              Rejoignez des milliers d'apprenants et développez les compétences
              qui feront évoluer votre carrière — bourse, épargne, immobilier,
              management.
            </p>

            {/* Barre de recherche */}
            <div ref={wrapperRef} className="relative mt-6 max-w-xl">
              <form
                onSubmit={submit}
                className="flex items-center bg-white rounded-2xl shadow-lift p-1.5 focus-within:ring-4 focus-within:ring-accent-300/40"
              >
                <Search className="w-5 h-5 text-neutral-400 mx-3 shrink-0" aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setOpenSuggest(true);
                  }}
                  onFocus={() => setOpenSuggest(true)}
                  placeholder="Rechercher un cours, une catégorie, un formateur…"
                  className="flex-1 min-w-0 bg-transparent text-neutral-900 text-sm placeholder:text-neutral-400 outline-none py-1.5"
                  aria-label="Rechercher"
                  aria-autocomplete="list"
                  aria-expanded={openSuggest}
                />
                <button
                  type="submit"
                  className="shrink-0 px-3 sm:px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
                >
                  Rechercher
                </button>
              </form>

              {/* Suggestions */}
              {openSuggest && suggestions.length > 0 && (
                <div className="absolute z-40 top-full mt-2 w-full bg-white rounded-2xl shadow-lift overflow-hidden border border-neutral-100 text-neutral-900">
                  <ul>
                    {suggestions.map((s, i) => (
                      <li key={`${s.type}-${s.slug}-${i}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenSuggest(false);
                            if (s.type === 'course') {
                              navigate(`/courses/${s.slug}`);
                            } else {
                              navigate(
                                `/catalogue?category=${encodeURIComponent(s.slug)}`,
                              );
                            }
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center gap-3"
                        >
                          <span
                            className={
                              s.type === 'course'
                                ? 'text-primary-600'
                                : 'text-accent-600'
                            }
                          >
                            {s.type === 'course' ? (
                              <BookOpen className="w-4 h-4" />
                            ) : (
                              <TrendingUp className="w-4 h-4" />
                            )}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="text-sm font-semibold block truncate">
                              {s.label}
                            </span>
                            <span className="text-[11px] text-neutral-500">
                              {s.type === 'course'
                                ? s.category ?? 'Cours'
                                : 'Catégorie'}
                            </span>
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="/catalogue"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent-400 hover:bg-accent-500 text-primary-900 font-bold text-sm shadow-lift transition"
              >
                Découvrir les formations
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/register"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur border border-white/20 text-white font-bold text-sm transition"
              >
                Commencer gratuitement
              </a>
            </div>
          </motion.div>

          {/* Colonne droite — Illustration + floating cards */}
          <div className="relative hidden lg:block">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
              className="relative"
            >
              {/* Mockup carte cours */}
              <div className="bg-white text-neutral-900 rounded-3xl shadow-lift overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-primary-100 via-primary-200 to-accent-100 relative">
                  <iframe
                    src="https://www.youtube-nocookie.com/embed/PmmlgDz3T3E?rel=0&modestbranding=1&playsinline=1"
                    title="Vidéo de présentation BestÉpargne Academy"
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
                <div className="p-5 relative min-h-[150px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mockIndex}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.35, ease: 'easeOut' }}
                    >
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${mock.badge}`}
                      >
                        {mock.category}
                      </span>
                      <h3 className="mt-2 text-lg font-extrabold">
                        {mock.title}
                      </h3>
                      <p className="text-xs text-neutral-500 mt-1">
                        {mock.meta}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs">
                          <Star className="w-4 h-4 fill-accent-500 text-accent-500" />
                          <span className="font-bold">{mock.rating}</span>
                          <span className="text-neutral-400">
                            ({mock.reviews})
                          </span>
                        </div>
                        <span
                          className={`text-xl font-extrabold ${mock.priceColor}`}
                        >
                          {mock.price}
                        </span>
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Petits dots indicateurs (position en cours de rotation) */}
                  <div
                    aria-hidden
                    className="mt-3 flex items-center gap-1.5"
                  >
                    {MOCK_COURSES.map((_, i) => (
                      <span
                        key={i}
                        className={
                          'h-1 rounded-full transition-all duration-500 ' +
                          (i === mockIndex
                            ? 'w-6 bg-primary-600'
                            : 'w-1.5 bg-neutral-200')
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating cards */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="absolute -left-6 top-8 bg-white text-neutral-900 rounded-2xl shadow-lift px-4 py-3 flex items-center gap-2"
              >
                <div className="w-9 h-9 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center">
                  <Star className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <p className="text-lg font-extrabold leading-none">4.8/5</p>
                  <p className="text-[11px] text-neutral-500">Note moyenne</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="absolute -right-4 top-1/2 bg-white text-neutral-900 rounded-2xl shadow-lift px-4 py-3 flex items-center gap-2"
              >
                <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-extrabold leading-none">12 500+</p>
                  <p className="text-[11px] text-neutral-500">Apprenants</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6, duration: 0.4 }}
                className="absolute -bottom-4 left-8 bg-white text-neutral-900 rounded-2xl shadow-lift px-4 py-3 flex items-center gap-2"
              >
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-extrabold leading-none">97%</p>
                  <p className="text-[11px] text-neutral-500">Satisfaction</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
