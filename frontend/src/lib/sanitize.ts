/**
 * sanitize.ts — Passe de sécurité unique pour tout HTML rendu via
 * `dangerouslySetInnerHTML`.
 *
 * Contexte (revue pré-landing, branche chore/audit-remediation-2026-05) :
 * cinq sinks `dangerouslySetInnerHTML` recevaient du HTML non assaini.
 * Deux hypothèses fausses circulaient dans les commentaires du code :
 *
 *   1. « contenu sanitisé par l'éditeur Tiptap » — Tiptap assainit dans le
 *      navigateur de l'auteur. Un instructeur qui poste directement sur
 *      l'API ne passe jamais par l'éditeur.
 *   2. « policy CSP » — la CSP de `best_epargne/settings/base.py` est posée
 *      par `csp.middleware.CSPMiddleware`, qui ne couvre que les réponses
 *      rendues par Django. Le SPA est servi par nginx (`frontend/nginx.conf`)
 *      et ne recevait aucun en-tête CSP.
 *
 * Le backend assainit désormais à l'écriture (bleach), et ce module assainit
 * au rendu. Les deux sont voulus : la base contient déjà de l'historique
 * écrit avant le durcissement serveur.
 */
import DOMPurify from 'dompurify';

/** Attributs conservés. Volontairement restreint : pas de `style` (vecteur
 *  d'exfiltration via `url()`), pas de `on*` (DOMPurify les retire de toute
 *  façon, mais l'allowlist rend l'intention explicite). */
const ALLOWED_ATTR = [
  'href', 'src', 'alt', 'title', 'target', 'rel',
  'width', 'height', 'colspan', 'rowspan', 'align',
  'class', 'id', 'type',
  // Accessibilité.
  'aria-label', 'aria-hidden', 'role',
  // Attributs posés par `annotateGlossary` (voir lib/glossary-detector.ts,
  // WRAPPED_ATTR + data-glossary-word). Les noms doivent rester synchronisés
  // avec ce module, sinon les tooltips du lexique cessent de fonctionner.
  'data-glossary-slug', 'data-glossary-word',
];

/** Balises autorisées pour du contenu pédagogique riche (leçons, descriptions
 *  de cours, définitions de lexique). Inclut les médias embarqués, que les
 *  instructeurs utilisent réellement. */
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'span', 'div', 'section', 'article',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'a', 'img', 'figure', 'figcaption',
  'iframe', 'video', 'audio', 'source', 'track',
  // `annotateGlossary` enveloppe chaque terme détecté dans un <button>.
  'button',
];

/** Hôtes autorisés pour les `<iframe>` embarqués. Aligné sur
 *  `CSP_FRAME_SRC` (`best_epargne/settings/base.py`). Un iframe vers un
 *  domaine arbitraire est une prise de contrôle visuelle de la page. */
const IFRAME_ALLOWED_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
]);

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Liens en nouvel onglet : sans `rel`, la page cible accède à
    // `window.opener` et peut rediriger l'onglet d'origine (tabnabbing).
    if (node.tagName === 'A' && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
    // Iframes : allowlist d'hôtes stricte, sinon on retire le noeud.
    if (node.tagName === 'IFRAME') {
      const src = node.getAttribute('src') || '';
      let host = '';
      try {
        host = new URL(src, window.location.origin).hostname;
      } catch {
        host = '';
      }
      if (!IFRAME_ALLOWED_HOSTS.has(host)) {
        node.remove();
      }
    }
  });
}

/**
 * Assainit du HTML destiné à `dangerouslySetInnerHTML`.
 *
 * @param dirty HTML d'origine utilisateur, LLM ou base de données.
 * @returns HTML sûr à injecter.
 */
export function sanitizeRichHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  installHooks();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Empêche `<form>` imbriqué et le clobbering de propriétés du DOM via
    // des attributs `name`/`id` qui écrasent des globales.
    SANITIZE_DOM: true,
    ALLOW_DATA_ATTR: false,
  });
}

export default sanitizeRichHtml;
