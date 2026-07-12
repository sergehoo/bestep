"""ai.knowledge.chunker — Découpage de texte en fragments RAG.

Stratégie :
    - Cible ~800 caractères par chunk avec 120 chars d'overlap.
    - Respecte les frontières de paragraphe si possible ; sinon les
      phrases ; sinon les mots.
    - Nettoie les blocs HTML/Markdown les plus courants pour préserver
      le texte utile.
"""
from __future__ import annotations

import re
from typing import List

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MULTISPACE_RE = re.compile(r"[ \t]+")
_MULTINL_RE = re.compile(r"\n{3,}")


def _strip_html(text: str) -> str:
    return _HTML_TAG_RE.sub(" ", text)


def _normalize(text: str) -> str:
    text = _strip_html(text or "")
    text = _MULTISPACE_RE.sub(" ", text)
    text = _MULTINL_RE.sub("\n\n", text)
    return text.strip()


def chunk_text(text: str, *, target_chars: int = 800, overlap: int = 120) -> List[str]:
    text = _normalize(text)
    if not text:
        return []
    if len(text) <= target_chars:
        return [text]

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    out: List[str] = []
    buffer = ""

    def _push_buffer():
        nonlocal buffer
        buf = buffer.strip()
        if buf:
            out.append(buf)
        buffer = ""

    for para in paragraphs:
        if len(para) > target_chars:
            # sous-découpage par phrase
            sentences = re.split(r"(?<=[\.\!\?])\s+", para)
            for sent in sentences:
                candidate = (buffer + " " + sent).strip() if buffer else sent
                if len(candidate) > target_chars and buffer:
                    _push_buffer()
                    buffer = sent
                else:
                    buffer = candidate
        else:
            candidate = (buffer + "\n\n" + para).strip() if buffer else para
            if len(candidate) > target_chars and buffer:
                _push_buffer()
                buffer = para
            else:
                buffer = candidate
    _push_buffer()

    # Applique l'overlap : préfixe chaque chunk (sauf le 1er) avec la
    # queue du précédent pour préserver le contexte.
    if overlap > 0 and len(out) > 1:
        for i in range(1, len(out)):
            prev = out[i - 1]
            tail = prev[-overlap:] if len(prev) > overlap else prev
            out[i] = (tail + " " + out[i]).strip()

    return out
