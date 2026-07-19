/**
 * AIMessageRenderer.tsx — Rendu Markdown enrichi sans dépendance.
 *
 * Support :
 *  - titres # / ## / ### / ####
 *  - **gras**, *italique*, `code inline`
 *  - liens [texte](url)
 *  - listes puces (- / *)
 *  - listes numérotées (1. 2. …)
 *  - blockquotes >
 *  - code fences ```lang ... ```
 *  - tables markdown (| col | col | avec séparateur |---|---|)
 *  - séparateur horizontal ---
 *  - support emojis natifs et retours à la ligne
 *
 * On évite d'ajouter react-markdown/remark pour ne pas alourdir le
 * bundle : ce parser custom couvre ~95% des cas produits par Claude.
 */
import { useMemo } from 'react';

interface Props {
  content: string;
  className?: string;
}

// Escape HTML — sécurité de base : le contenu vient d'un LLM.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Tags HTML autorisés en passthrough (whitelist stricte). Toute autre balise
// est réencodée en texte via esc(). Les attributs sont filtrés à leur tour.
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'span', 'div', 'section', 'article',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'small', 'sub', 'sup',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'kbd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'a', 'img',
  'figure', 'figcaption',
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  th: new Set(['colspan', 'rowspan', 'align']),
  td: new Set(['colspan', 'rowspan', 'align']),
};

/** Classes Tailwind injectées automatiquement quand une balise HTML brute
 *  passe le filtre — donne un rendu cohérent avec le parser Markdown. */
const TAG_STYLES: Record<string, string> = {
  h1: 'mt-4 mb-2 text-lg font-extrabold',
  h2: 'mt-4 mb-1.5 text-base font-extrabold',
  h3: 'mt-3 mb-1 text-sm font-extrabold',
  h4: 'mt-3 mb-1 text-sm font-bold',
  h5: 'mt-2 mb-1 text-xs font-bold uppercase tracking-wide text-neutral-500',
  h6: 'mt-2 mb-1 text-xs font-bold uppercase tracking-wide text-neutral-500',
  p: 'my-1.5 leading-relaxed',
  ul: 'list-disc list-outside pl-5 my-2 space-y-1',
  ol: 'list-decimal list-outside pl-5 my-2 space-y-1',
  blockquote:
    'my-2 pl-3 border-l-2 border-primary-400 text-neutral-600 dark:text-neutral-300 italic',
  hr: 'my-3 border-neutral-200 dark:border-neutral-700',
  table:
    'w-full text-xs border-collapse rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 my-2',
  th: 'px-2 py-1.5 text-left font-bold border-b border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800',
  td: 'px-2 py-1.5 text-left border-b border-neutral-100 dark:border-neutral-800 align-top',
  pre: 'my-2 p-3 rounded-lg bg-neutral-900 text-neutral-100 text-xs font-mono overflow-x-auto',
  code: 'px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[0.85em]',
  a: 'text-primary-600 dark:text-primary-400 underline underline-offset-2 hover:no-underline break-all',
  img: 'max-w-full h-auto rounded-lg my-2',
  strong: 'font-bold',
  b: 'font-bold',
  em: 'italic',
  i: 'italic',
};

/** Sanitize une chaîne HTML brute en passthrough des tags whitelisted et
 *  escape strict pour le reste. Ne parse pas le DOM (pas de dépendance),
 *  reste léger — c'est un scanner de tokens. */
function sanitizeHtml(input: string): string {
  const out: string[] = [];
  let i = 0;
  const n = input.length;
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)(\s+[^>]*)?\/?>/g;
  let m: RegExpExecArray | null;
  tagRe.lastIndex = 0;
  while ((m = tagRe.exec(input)) !== null) {
    // Texte entre le dernier match et celui-ci : escape.
    if (m.index > i) out.push(esc(input.slice(i, m.index)));
    const raw = m[0];
    const tag = m[1].toLowerCase();
    const isClosing = raw.startsWith('</');
    const isSelfClose = raw.endsWith('/>') || /^(br|hr|img)$/.test(tag);
    if (ALLOWED_TAGS.has(tag)) {
      if (isClosing) {
        out.push(`</${tag}>`);
      } else {
        // Extrait les attributs autorisés (`attr="val"` ou `attr='val'`).
        const attrs: string[] = [];
        const rawAttrs = m[2] || '';
        const attrRe = /([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
        let am: RegExpExecArray | null;
        while ((am = attrRe.exec(rawAttrs)) !== null) {
          const name = am[1].toLowerCase();
          const val = am[3] ?? am[4] ?? '';
          const allowed = ALLOWED_ATTRS[tag];
          if (!allowed || !allowed.has(name)) continue;
          // Blocage schemes dangereux
          if (
            (name === 'href' || name === 'src')
            && /^(javascript|data|vbscript):/i.test(val.trim())
          ) {
            continue;
          }
          attrs.push(`${name}="${esc(val)}"`);
        }
        // Sécurité liens : target=_blank → rel noopener noreferrer
        if (tag === 'a' && attrs.some((a) => /^target=/.test(a))) {
          if (!attrs.some((a) => /^rel=/.test(a))) {
            attrs.push('rel="noopener noreferrer"');
          }
        }
        // Style Tailwind auto
        const cls = TAG_STYLES[tag];
        if (cls) attrs.push(`class="${cls}"`);
        out.push(
          `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${isSelfClose ? ' /' : ''}>`,
        );
      }
    } else {
      // Tag non whitelisted → réencode en texte visible.
      out.push(esc(raw));
    }
    i = m.index + raw.length;
  }
  if (i < n) out.push(esc(input.slice(i)));
  return out.join('');
}

/** Détecte si un contenu ressemble à du HTML riche (au moins une balise
 *  block whitelistée). Sinon → parser Markdown. */
function looksLikeHtml(s: string): boolean {
  return /<\s*(h[1-6]|p|ul|ol|li|table|blockquote|pre|div|section|article)\b/i.test(s);
}

function inline(text: string): string {
  let out = esc(text);
  // Code inline (avant les autres transforms qui pourraient toucher au contenu)
  out = out.replace(
    /`([^`]+)`/g,
    '<code class="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[0.85em] break-all">$1</code>',
  );
  // Gras
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
  // Italique (simple, évite d'accrocher **gras**)
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em class="italic">$2</em>');
  // Liens
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline underline-offset-2 hover:no-underline break-all">$1</a>',
  );
  return out;
}

/** Détecte si `line` ressemble à une ligne de séparateur de table markdown
 *  (ex: "|---|---|" ou "| :--- | :---: |"). */
function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return false;
  // Chaque cellule entre les | doit être composée de -, :, espaces uniquement.
  const cells = t.slice(1, -1).split('|');
  return cells.length > 0 && cells.every((c) => /^\s*:?-+:?\s*$/.test(c));
}

/** Parse une ligne "| a | b | c |" en cellules ['a', 'b', 'c']. */
function parseTableRow(line: string): string[] {
  const t = line.trim();
  return t
    .slice(t.startsWith('|') ? 1 : 0, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
}

function renderTable(headerLine: string, sepLine: string, bodyLines: string[]): string {
  const headers = parseTableRow(headerLine);
  // Alignements depuis la ligne de séparation
  const aligns = parseTableRow(sepLine).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
  const rows = bodyLines.map(parseTableRow);
  const headHtml = headers
    .map(
      (h, idx) =>
        `<th class="px-2 py-1.5 text-${aligns[idx] ?? 'left'} font-bold border-b border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-800">${inline(h)}</th>`,
    )
    .join('');
  const bodyHtml = rows
    .map(
      (r) =>
        '<tr>' +
        r
          .map(
            (c, idx) =>
              `<td class="px-2 py-1.5 text-${aligns[idx] ?? 'left'} border-b border-neutral-100 dark:border-neutral-800 align-top">${inline(c)}</td>`,
          )
          .join('') +
        '</tr>',
    )
    .join('');
  return (
    '<div class="my-2 -mx-1 overflow-x-auto">'
    + '<table class="w-full text-xs border-collapse rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">'
    + `<thead><tr>${headHtml}</tr></thead>`
    + `<tbody>${bodyHtml}</tbody>`
    + '</table>'
    + '</div>'
  );
}

function renderBlocks(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;

  // État courant : liste puce ou numérotée
  let listState: { kind: 'ul' | 'ol' } | null = null;
  const closeList = () => {
    if (listState) {
      out.push(listState.kind === 'ul' ? '</ul>' : '</ol>');
      listState = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (line.startsWith('```')) {
      closeList();
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      out.push(
        `<pre class="my-2 p-3 rounded-lg bg-neutral-900 text-neutral-100 text-xs font-mono overflow-x-auto"><code data-lang="${esc(lang)}">${esc(codeLines.join('\n'))}</code></pre>`,
      );
      continue;
    }

    // Séparateur horizontal ---
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      out.push('<hr class="my-3 border-neutral-200 dark:border-neutral-700" />');
      i++;
      continue;
    }

    // Table markdown : header sur une ligne | col | col |, séparateur sur
    // la suivante |---|---|, puis N lignes de données.
    if (
      line.trim().startsWith('|')
      && i + 1 < lines.length
      && isTableSeparator(lines[i + 1])
    ) {
      closeList();
      const headerLine = line;
      const sepLine = lines[i + 1];
      const bodyLines: string[] = [];
      let j = i + 2;
      while (
        j < lines.length
        && lines[j].trim().startsWith('|')
        && lines[j].trim().endsWith('|')
      ) {
        bodyLines.push(lines[j]);
        j++;
      }
      out.push(renderTable(headerLine, sepLine, bodyLines));
      i = j;
      continue;
    }

    // Titres # ## ### ####
    const h4 = line.match(/^####\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1 || h2 || h3 || h4) {
      closeList();
      if (h1) out.push(`<h3 class="mt-4 mb-1.5 text-base font-extrabold">${inline(h1[1])}</h3>`);
      if (h2) out.push(`<h4 class="mt-3 mb-1 text-sm font-extrabold">${inline(h2[1])}</h4>`);
      if (h3) out.push(`<h5 class="mt-3 mb-1 text-sm font-bold">${inline(h3[1])}</h5>`);
      if (h4) out.push(`<h6 class="mt-2 mb-1 text-xs font-bold uppercase tracking-wide text-neutral-500">${inline(h4[1])}</h6>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      closeList();
      const q = line.replace(/^>\s?/, '');
      out.push(
        `<blockquote class="my-2 pl-3 border-l-2 border-primary-400 text-neutral-600 dark:text-neutral-300 italic">${inline(q)}</blockquote>`,
      );
      i++;
      continue;
    }

    // Liste puces (- ou *)
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!listState || listState.kind !== 'ul') {
        closeList();
        out.push('<ul class="list-disc list-outside pl-5 my-2 space-y-1">');
        listState = { kind: 'ul' };
      }
      out.push(`<li>${inline(li[1])}</li>`);
      i++;
      continue;
    }

    // Liste numérotée (1. 2. ...)
    const oli = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (oli) {
      if (!listState || listState.kind !== 'ol') {
        closeList();
        out.push('<ol class="list-decimal list-outside pl-5 my-2 space-y-1">');
        listState = { kind: 'ol' };
      }
      out.push(`<li>${inline(oli[2])}</li>`);
      i++;
      continue;
    }

    // Ligne vide → sépare les paragraphes
    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // Paragraphe
    closeList();
    // Regroupe les lignes consécutives non vides en un seul paragraphe,
    // sauf si la ligne suivante est un séparateur de table (auquel cas la
    // ligne courante est en fait un header de table à traiter au tour suivant).
    const paraLines: string[] = [line];
    let j = i + 1;
    while (
      j < lines.length
      && lines[j].trim() !== ''
      && !lines[j].startsWith('#')
      && !lines[j].startsWith('```')
      && !lines[j].startsWith('>')
      && !/^\s*[-*]\s+/.test(lines[j])
      && !/^\s*\d+\.\s+/.test(lines[j])
      && !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[j])
      && !(
        lines[j].trim().startsWith('|')
        && j + 1 < lines.length
        && isTableSeparator(lines[j + 1])
      )
    ) {
      paraLines.push(lines[j]);
      j++;
    }
    out.push(`<p class="my-1.5 leading-relaxed">${inline(paraLines.join(' '))}</p>`);
    i = j;
  }

  closeList();
  return out.join('');
}

export function AIMessageRenderer({ content, className }: Props) {
  // BEST-AI T5 — Masque les blocs <action>{...}</action> émis par Claude
  // pour déclencher un tool use. Ils sont interceptés côté backend et
  // remontés en event SSE dédié qui affiche un bouton — les afficher ici
  // (JSON brut) polluerait la lecture pour l'utilisateur.
  const cleaned = useMemo(
    () => (content || '').replace(/<action>[\s\S]*?<\/action>/g, '').trim(),
    [content],
  );
  // Détection : HTML riche → sanitize + passthrough. Markdown → parser
  // custom (renderBlocks). Le second cas escape aussi le HTML restant.
  const html = useMemo(() => {
    if (looksLikeHtml(cleaned)) return sanitizeHtml(cleaned);
    return renderBlocks(cleaned);
  }, [cleaned]);
  return (
    <div
      className={
        'ai-message-content text-sm text-neutral-800 dark:text-neutral-200 leading-relaxed break-words '
        + (className ?? '')
      }
      // Le HTML est produit par notre parser ci-dessus (escape via `esc`).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
