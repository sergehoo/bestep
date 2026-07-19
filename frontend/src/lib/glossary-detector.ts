/**
 * lib/glossary-detector.ts — Moteur de détection des termes dans du HTML.
 *
 * Stratégie :
 *   - Parse le HTML dans un fragment DOM détaché.
 *   - Traverse les nodes texte hors des zones interdites (a, code, pre,
 *     script, style, h1-h6 optionnel).
 *   - Pour chaque node texte, cherche les termes en une passe unique via
 *     une regex construite au boot (préfère les expressions LONGUES).
 *   - Remplace les matchs par un <button data-glossary-slug="…"> qui
 *     sera capté par un event listener délégué côté React.
 *
 * Sécurité :
 *   - On ne modifie JAMAIS la source (contenu original en base) : le
 *     wrapping est purement visuel et se fait sur une copie DOM au moment
 *     du rendu React (dangerouslySetInnerHTML).
 *   - Aucune évaluation dynamique de code — regex + DOM API standard.
 *
 * Performance :
 *   - Regex compilée UNE fois par set de termes (mémoïsée via clé cours).
 *   - Détection en O(N*M) borné (N = chars texte, M = alternatives regex).
 */
import type { GlossaryTermDetect } from './glossary-types';

// Zones où on n'injecte JAMAIS de tooltip (contenu déjà interactif ou
// non textuel). NB : on traverse les <h1>-<h6> par défaut ; désactivable
// via option.
const SKIP_TAGS = new Set([
  'A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT',
  'BUTTON', 'IFRAME', 'OBJECT', 'EMBED', 'CANVAS', 'SVG',
]);
// Attribut sentinelle pour ne pas re-wrapper un span déjà injecté.
const WRAPPED_ATTR = 'data-glossary-slug';

export interface GlossaryDetectorOptions {
  /** Ignorer les balises h1-h6 lors de la détection. */
  skipHeadings?: boolean;
  /** Limite (fallback anti-perf) : nb max de wraps par bloc. */
  maxMatchesPerBlock?: number;
}

interface CompiledTerm {
  slug: string;
  word: string;
  short_definition: string;
  is_case_sensitive: boolean;
  /** Chaînes à chercher (mot + variantes), triées par longueur DESC. */
  needles: string[];
}

/** Normalise une chaîne pour la comparaison insensible aux accents. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Échappe les caractères regex d'une aiguille pour l'inclure dans une
 *  alternative. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Construit la table de recherche à partir des termes du serveur. */
export function compileTerms(
  terms: GlossaryTermDetect[],
): { compiled: CompiledTerm[]; regex: RegExp | null } {
  const compiled: CompiledTerm[] = terms.map((t) => ({
    slug: t.slug,
    word: t.word,
    short_definition: t.short_definition,
    is_case_sensitive: t.is_case_sensitive,
    needles: [t.word, ...t.variants.map((v) => v.variant)]
      .filter(Boolean)
      .map((s) => s.trim())
      .filter(Boolean),
  }));
  // Toutes les aiguilles concaténées, dédupliquées et triées par longueur DESC
  // (garantit que "assurance vie" match avant "assurance").
  const alternatives = Array.from(
    new Set(
      compiled.flatMap((c) => c.needles),
    ),
  ).sort((a, b) => b.length - a.length);
  if (alternatives.length === 0) return { compiled, regex: null };
  // Boundaries : \b ne marche pas avec les caractères accentués. On utilise
  // des lookarounds négatifs sur des caractères "de mot" (lettres, chiffres,
  // apostrophe, tiret) — supportés dans Chrome/Firefox/Safari récents.
  const alt = alternatives.map(escapeRegex).join('|');
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}_'\\-])(${alt})(?![\\p{L}\\p{N}_'\\-])`,
    'giu',
  );
  return { compiled, regex };
}

/** Retrouve le terme correspondant à un match (case + accent aware). */
function findTermForMatch(
  matched: string,
  compiled: CompiledTerm[],
): CompiledTerm | null {
  const norm = normalize(matched);
  for (const t of compiled) {
    for (const needle of t.needles) {
      if (t.is_case_sensitive) {
        if (needle === matched) return t;
      } else if (normalize(needle) === norm) {
        return t;
      }
    }
  }
  return null;
}

/** Applique la détection à un fragment HTML et renvoie le HTML annoté.
 *
 *  Note : ce processeur crée un document DOM détaché — il ne touche pas
 *  au DOM live. React consomme ensuite le résultat via dangerouslySetInnerHTML.
 */
export function annotateGlossary(
  html: string,
  terms: GlossaryTermDetect[],
  options: GlossaryDetectorOptions = {},
): string {
  if (!html || !terms.length) return html || '';
  const { compiled, regex } = compileTerms(terms);
  if (!regex) return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  const maxMatches = options.maxMatchesPerBlock ?? 500;
  let matched = 0;

  const walk = (node: Node) => {
    if (matched >= maxMatches) return;
    // Skip texts inside forbidden ancestors.
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (SKIP_TAGS.has(el.tagName)) return;
      if (el.hasAttribute(WRAPPED_ATTR)) return;
      if (options.skipHeadings && /^H[1-6]$/.test(el.tagName)) return;
      // Récursion sur enfants.
      const kids = Array.from(el.childNodes);
      for (const child of kids) walk(child);
      return;
    }
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent ?? '';
    if (!text.trim()) return;
    // Reset lastIndex pour chaque node.
    regex.lastIndex = 0;
    const matches: Array<{ start: number; end: number; term: CompiledTerm }> = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const t = findTermForMatch(m[1], compiled);
      if (t) {
        matches.push({
          start: m.index,
          end: m.index + m[1].length,
          term: t,
        });
      }
      if (regex.lastIndex === m.index) regex.lastIndex++; // safety
    }
    if (!matches.length) return;
    // Construit un fragment de remplacement.
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const { start, end, term } of matches) {
      if (matched >= maxMatches) break;
      if (start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, start)));
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'glossary-term';
      btn.setAttribute(WRAPPED_ATTR, term.slug);
      btn.setAttribute('data-glossary-word', term.word);
      btn.setAttribute('aria-label', `Définition : ${term.word}`);
      btn.textContent = text.slice(start, end);
      frag.appendChild(btn);
      cursor = end;
      matched++;
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    node.parentNode?.replaceChild(frag, node);
  };

  walk(container);
  return container.innerHTML;
}
