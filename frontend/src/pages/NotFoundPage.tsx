/**
 * NotFoundPage.tsx — 404 (R3.4).
 */
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-extrabold text-primary-600">404</h1>
        <h2 className="text-2xl font-bold text-neutral-900 mt-4">Page introuvable</h2>
        <p className="text-neutral-500 mt-2">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/">
            <Button variant="primary">Retour à l'accueil</Button>
          </Link>
          <Link to="/catalogue">
            <Button variant="outline">Voir le catalogue</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
