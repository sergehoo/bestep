/**
 * AIMessageRenderer.tsx — Rendu Markdown minimal sans dépendance.
 *
 * Support :
 *  - titres # / ## / ###
 *  - **gras**, *italique*, `code inline`
 *  - liens [texte](url)
 *  - listes - / *
 *  - blockquotes >
 *  - code fences ```lang ... ```
 *
 * On évite d'ajouter react-markdown/remark pour ne pas alourdir le
 * bundle : Phase 5 pourra remplacer par une lib complète si nécessaire.
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

function inline(text: string): string {
  let out = esc(text);
  // Code inline
  out = out.replace(
    /`([^`]+)`/g,
    '<code class="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-[0.85em]">$1</code>',
  );
  // Gras
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italique (simple, évite d'accrocher **gras**)
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Liens
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 dark:text-primary-400 underline underline-offset-2 hover:no-underline">$1</a>',
  );
  return out;
}

function renderBlocks(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
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

    // Titres
    const h3 = line.match(/^###\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1 || h2 || h3) {
      closeList();
      if (h1) out.push(`<h3 class="mt-3 mb-1 text-base font-extrabold">${inline(h1[1])}</h3>`);
      if (h2) out.push(`<h4 class="mt-3 mb-1 text-sm font-extrabold">${inline(h2[1])}</h4>`);
      if (h3) out.push(`<h5 class="mt-2 mb-1 text-sm font-bold">${inline(h3[1])}</h5>`);
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

    // Liste
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        out.push('<ul class="list-disc list-outside pl-5 my-2 space-y-1">');
        inList = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
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
    // Regroupe les lignes consécutives non vides en un seul paragraphe
    const paraLines: string[] = [line];
    let j = i + 1;
    while (
      j < lines.length &&
      lines[j].trim() !== '' &&
      !lines[j].startsWith('#') &&
      !lines[j].startsWith('```') &&
      !lines[j].startsWith('>') &&
      !/^\s*[-*]\s+/.test(lines[j])
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
  const html = useMemo(() => renderBlocks(content || ''), [content]);
  return (
    <div
      className={
        'text-sm text-neutral-800 dark:text-neutral-200 ' + (className ?? '')
      }
      // Le HTML est produit par notre parser ci-dessus (escape via `esc`).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
