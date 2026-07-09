/**
 * FAQSection.tsx — FAQ accordéon (R9.5).
 *
 * Contenu statique par défaut : questions génériques d'un cours en ligne.
 * Le backend pourra remonter une vraie FAQ en R10.
 */
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  q: string;
  a: string;
}

const DEFAULT_FAQ: FAQItem[] = [
  {
    q: "Ce cours est-il accessible sur mobile ?",
    a: "Oui, la plateforme est responsive et supporte iOS/Android. Vous pouvez suivre le cours partout où vous avez une connexion internet.",
  },
  {
    q: "Combien de temps ai-je accès au cours après achat ?",
    a: "L'accès est à vie. Vous pouvez le revisiter autant de fois que nécessaire, y compris après avoir obtenu le certificat.",
  },
  {
    q: "Est-ce que je reçois un certificat à la fin ?",
    a: "Un certificat est délivré pour les cours marqués « Certifiants ». Il valide l'ensemble du parcours et peut être partagé sur LinkedIn.",
  },
  {
    q: "Puis-je poser des questions au formateur ?",
    a: "Oui, chaque cours dispose d'un espace Q&R permettant d'échanger avec le formateur et les autres apprenants.",
  },
  {
    q: "Que se passe-t-il si le cours ne me convient pas ?",
    a: "Nous offrons une garantie satisfait ou remboursé de 14 jours après achat, sans justification à fournir.",
  },
];

interface FAQSectionProps {
  items?: FAQItem[];
}

export function FAQSection({ items = DEFAULT_FAQ }: FAQSectionProps) {
  return (
    <div>
      <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 mb-3 sm:mb-4">
        Questions fréquentes
      </h2>
      <div className="space-y-2">
        {items.map((it, i) => (
          <details
            key={i}
            className="group bg-white border border-neutral-100 rounded-2xl overflow-hidden"
          >
            <summary className="px-4 sm:px-5 py-3 sm:py-4 cursor-pointer flex items-center justify-between gap-3 hover:bg-neutral-50 transition list-none">
              <p className="text-sm sm:text-base font-semibold text-neutral-900 pr-2">
                {it.q}
              </p>
              <ChevronDown className="w-4 h-4 text-neutral-400 transition-transform group-open:rotate-180 shrink-0" />
            </summary>
            <div className="px-4 sm:px-5 pb-4 text-sm text-neutral-700 leading-relaxed">
              {it.a}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
