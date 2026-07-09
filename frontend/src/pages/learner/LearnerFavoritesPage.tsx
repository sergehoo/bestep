/**
 * LearnerFavoritesPage.tsx — Bibliothèque perso (R12.5).
 *
 * MVP local storage : persistance des slugs de cours favoris. Backend
 * R13 exposera /api/learner/favorites/ CRUD.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, X, ArrowRight, Bookmark } from 'lucide-react';
import { LearnerShell } from '@/components/learner/LearnerShell';
import { Card, CardBody } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { CoursePremiumCard } from '@/components/premium/CoursePremiumCard';
import { usePublicCourses } from '@/hooks/queries';

const STORAGE_KEY = 'be-favorites';

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(slug: string) {
  const cur = loadFavorites();
  const next = cur.includes(slug)
    ? cur.filter((s) => s !== slug)
    : [...cur, slug];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export default function LearnerFavoritesPage() {
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  // Charge un pool assez large pour filtrer côté client (MVP)
  const { data, isLoading } = usePublicCourses({ page_size: 50 });

  useEffect(() => {
    const onStorage = () => setFavorites(loadFavorites());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const items =
    data?.results.filter((c) => favorites.includes(c.slug)) ?? [];

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setFavorites([]);
  };

  return (
    <LearnerShell
      title="Mes favoris"
      subtitle={
        favorites.length > 0
          ? `${favorites.length} cours enregistré${favorites.length > 1 ? 's' : ''}`
          : 'Constituez votre bibliothèque personnelle.'
      }
      actions={
        favorites.length > 0 && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-neutral-200 text-neutral-700 hover:bg-neutral-50"
          >
            <X className="w-3.5 h-3.5" />
            Tout retirer
          </button>
        )
      }
    >
      {isLoading && !data ? (
        <div className="py-20 flex justify-center">
          <Spinner size="xl" label="Chargement…" />
        </div>
      ) : favorites.length === 0 ? (
        <EmptyFavorites />
      ) : items.length === 0 ? (
        <Card>
          <CardBody className="text-center py-8">
            <Bookmark className="w-8 h-8 text-neutral-300 mx-auto" />
            <p className="mt-2 text-sm text-neutral-500">
              Vos favoris ne sont plus disponibles dans le catalogue actuel.
              Ils apparaîtront ici dès qu'ils seront à nouveau publiés.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((c) => (
            <CoursePremiumCard
              key={c.id}
              course={c}
              onSave={() => {
                setFavorites(toggleFavorite(c.slug));
              }}
            />
          ))}
        </div>
      )}
    </LearnerShell>
  );
}

function EmptyFavorites() {
  return (
    <Card>
      <CardBody className="text-center py-10">
        <Heart className="w-10 h-10 text-rose-200 mx-auto" />
        <p className="mt-3 text-lg font-bold text-neutral-900">
          Aucun favori pour le moment
        </p>
        <p className="mt-1 text-sm text-neutral-500 max-w-md mx-auto">
          Cliquez sur le cœur d'un cours pour l'enregistrer et le retrouver ici.
        </p>
        <Link
          to="/catalogue"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold transition"
        >
          Explorer le catalogue
          <ArrowRight className="w-4 h-4" />
        </Link>
      </CardBody>
    </Card>
  );
}
