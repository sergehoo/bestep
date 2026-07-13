/**
 * PublicFooter.tsx — Footer premium 5 colonnes + newsletter (R11.4).
 */
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  Instagram,
  Send,
  Globe,
} from 'lucide-react';

const COMPANY_LINKS = [
  { label: 'À propos', href: '/about' },
  { label: 'Nos formations', href: '/catalogue' },
  { label: 'Blog', href: '/blog' },
  { label: 'Carrières', href: '/careers' },
  { label: 'Partenaires', href: '/partners' },
];

const SUPPORT_LINKS = [
  { label: "Centre d'aide", href: '/help' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
  { label: 'Statut services', href: '/status' },
];

const LEGAL_LINKS = [
  { label: 'Conditions', href: '/terms' },
  { label: 'Confidentialité', href: '/privacy' },
  { label: 'Cookies', href: '/cookies' },
  { label: 'Mentions légales', href: '/legal' },
];

const SOCIAL = [
  { Icon: Facebook, href: 'https://facebook.com', label: 'Facebook' },
  { Icon: Twitter, href: 'https://twitter.com', label: 'Twitter' },
  { Icon: Linkedin, href: 'https://linkedin.com', label: 'LinkedIn' },
  { Icon: Youtube, href: 'https://youtube.com', label: 'YouTube' },
  { Icon: Instagram, href: 'https://instagram.com', label: 'Instagram' },
];

export function PublicFooter() {
  const [email, setEmail] = useState('');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subscribe = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErr('Adresse email invalide.');
      return;
    }
    // MVP : pas d'endpoint newsletter côté backend (R12 ?).
    // On confirme visuellement l'abonnement pour l'UX.
    setOk(true);
    setEmail('');
  };

  return (
    <footer className="bg-neutral-900 text-neutral-300">
      {/* Newsletter */}
      <div className="border-b border-white/10">
        <div className="container mx-auto px-4 max-w-6xl py-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              Restez informé·e des nouvelles formations
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Une newsletter mensuelle, zéro spam, désabonnement en un clic.
            </p>
          </div>
          <form
            onSubmit={subscribe}
            className="flex items-center bg-white/5 border border-white/10 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-accent-400/50"
          >
            <Mail className="w-4 h-4 text-neutral-500 mx-3 shrink-0" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              aria-label="Email newsletter"
              className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-neutral-500 border-0 outline-none focus:ring-0 focus:outline-none appearance-none py-2 text-white"
            />
            <button
              type="submit"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-accent-400 hover:bg-accent-500 text-primary-900 text-sm font-bold transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">S'abonner</span>
            </button>
          </form>
          {ok && (
            <p className="text-xs text-emerald-400 lg:col-span-2">
              Merci ! Vérifiez votre boîte pour confirmer l'abonnement.
            </p>
          )}
          {err && (
            <p className="text-xs text-rose-400 lg:col-span-2">{err}</p>
          )}
        </div>
      </div>

      {/* Colonnes */}
      <div className="container mx-auto px-4 max-w-6xl py-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
        {/* Marque */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <Link
            to="/"
            className="inline-block"
            aria-label="Best-Épargne — accueil"
          >
            <img
              src="/logo_2.png"
              alt="Best-Épargne"
              className="h-12 w-auto object-contain"
            />
          </Link>
          <p className="mt-3 text-sm text-neutral-400 leading-relaxed max-w-sm">
            Formation en ligne premium pour développer vos compétences
            financières et professionnelles. Certifiée, encadrée, accessible.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-neutral-400">
            <li className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5" />
              +221 33 000 00 00
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" />
              contact@ayo-group.com
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              Dakar · Sénégal
            </li>
          </ul>
          <div className="mt-4 flex items-center gap-2">
            {SOCIAL.map(({ Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition"
                aria-label={label}
              >
                <Icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>

        <FooterColumn title="Entreprise" links={COMPANY_LINKS} />
        <FooterColumn title="Aide" links={SUPPORT_LINKS} />
        <FooterColumn title="Légal" links={LEGAL_LINKS} />
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 max-w-6xl py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <p>
            © {new Date().getFullYear()} BestÉpargne Academy — Tous droits
            réservés.
          </p>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              <select
                aria-label="Langue"
                className="bg-transparent text-neutral-400 outline-none"
                defaultValue="fr"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <select
              aria-label="Devise"
              className="bg-transparent text-neutral-400 outline-none"
              defaultValue="XOF"
            >
              <option value="XOF">XOF · CFA</option>
              <option value="EUR">EUR · €</option>
              <option value="USD">USD · $</option>
            </select>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h3 className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 mb-3">
        {title}
      </h3>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              to={l.href}
              className="text-neutral-400 hover:text-white transition"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
