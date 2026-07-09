/**
 * LearnGrid.tsx — "Ce que vous apprendrez" (R9.5).
 *
 * Dérive une liste de compétences depuis la description du cours si
 * l'utilisateur a formaté avec des puces "* " / "- " en début de ligne.
 * Fallback : parse par phrases si aucune puce détectée. Coupe à 8 items.
 */
import { Check } from 'lucide-react';

interface LearnGridProps {
  description: string;
  fallback?: string[];
}

const DEFAULT_LEARNINGS: string[] = [
  'Comprendre les marchés financiers',
  "Construire un portefeuille d'épargne solide",
  'Gérer les risques et diversifier ses actifs',
  'Lire un bilan et analyser les fondamentaux',
  'Utiliser les outils d’investissement modernes',
  'Développer une stratégie long terme',
];

function extractSkills(description: string): string[] {
  if (!description) return [];

  // 1) Détection <li>…</li> (Tiptap génère des listes HTML natives)
  const liMatches = Array.from(
    description.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi),
  )
    .map((m) => stripHtml(m[1]).trim())
    .filter(Boolean);
  if (liMatches.length >= 3) return liMatches.slice(0, 8);

  // 2) Fallback texte brut (compat avec anciennes descriptions plain-text)
  const plain = stripHtml(description);
  const bulleted = plain
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[*•\-–]\s+/.test(l))
    .map((l) => l.replace(/^[*•\-–]\s+/, '').trim());
  if (bulleted.length >= 3) return bulleted.slice(0, 8);

  // 3) Fallback phrases courtes
  const sentences = plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 120);
  return sentences.slice(0, 6);
}

function stripHtml(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function LearnGrid({ description, fallback = DEFAULT_LEARNINGS }: LearnGridProps) {
  const derived = extractSkills(description);
  const items = derived.length > 0 ? derived : fallback;
  return (
    <div className="bg-primary-50/50 border border-primary-100 rounded-2xl p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 mb-3 sm:mb-4">
        Ce que vous apprendrez
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {items.map((skill, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-neutral-800">
            <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <span className="break-words">{skill}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
