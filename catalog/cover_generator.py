"""catalog.cover_generator — Génération auto d'une image de couverture SVG.

Objectifs :
    - Aucune dépendance externe (ni Pillow, ni image gen IA).
    - Cohérente d'un jour à l'autre : même titre → même palette (dérivée
      du hash du titre) → visual identity stable.
    - Thématique : un emoji est choisi selon des mots-clés du titre
      (finance, code, science, langue, marketing…).
    - Toujours 1600×900 pixels (aspect 16:9 conforme au reste de l'UI).
    - Sortie : bytes SVG UTF-8, prêts à être stockés via
      ``default_storage`` dans ``Course.thumbnail``.

L'appelant se charge d'écrire le résultat via ``ImageField.save()``.
"""
from __future__ import annotations

import hashlib
from html import escape
from typing import Tuple


# Palettes premium : chaque tuple est (from, via, to) — 3 stops.
# 12 palettes → hash % 12 pour piocher, garantit une distribution stable.
_PALETTES: list[Tuple[str, str, str]] = [
    ("#0284c7", "#0369a1", "#075985"),  # blue primary
    ("#7c3aed", "#6d28d9", "#4c1d95"),  # violet
    ("#059669", "#047857", "#064e3b"),  # emerald
    ("#dc2626", "#b91c1c", "#7f1d1d"),  # rose
    ("#ea580c", "#c2410c", "#7c2d12"),  # orange
    ("#0891b2", "#0e7490", "#164e63"),  # cyan
    ("#4f46e5", "#4338ca", "#3730a3"),  # indigo
    ("#db2777", "#be185d", "#831843"),  # pink
    ("#65a30d", "#4d7c0f", "#365314"),  # lime
    ("#d97706", "#b45309", "#78350f"),  # amber
    ("#0f766e", "#115e59", "#134e4a"),  # teal
    ("#9333ea", "#7e22ce", "#581c87"),  # purple
]


# Mapping mot-clé (lowercase, sans accents) → emoji thématique. Le premier
# mot-clé trouvé dans le titre gagne. Fallback : 📘.
_KEYWORDS_EMOJI: list[Tuple[tuple[str, ...], str]] = [
    (("bourse", "action", "obligation", "investir", "trading", "finance", "epargne", "brvm"), "📈"),
    (("crypto", "bitcoin", "blockchain", "web3", "nft", "defi"), "🪙"),
    (("code", "python", "javascript", "react", "django", "programm", "developp", "web"), "💻"),
    (("design", "ui", "ux", "figma", "illustrator", "photoshop"), "🎨"),
    (("marketing", "seo", "social", "brand", "communication", "vente"), "📣"),
    (("data", "sql", "analyse", "statistique", "power bi", "excel"), "📊"),
    (("ia", "ai", "machine learning", "deep learning", "chatgpt", "llm"), "🤖"),
    (("langue", "anglais", "espagnol", "allemand", "chinois", "arabe", "franc"), "🗣️"),
    (("droit", "juridique", "loi", "contrat"), "⚖️"),
    (("sante", "medical", "medecin", "psycho", "coach"), "🩺"),
    (("cuisine", "chef", "patiss", "boulang"), "🍳"),
    (("photo", "video", "cinema", "montage"), "🎬"),
    (("musique", "guitare", "piano", "chant"), "🎵"),
    (("agri", "elevage", "ferme", "jardin"), "🌱"),
    (("management", "leader", "rh", "manager"), "👔"),
    (("entrepreneur", "startup", "business", "pme"), "🚀"),
    (("bts", "licence", "master", "bac", "concours", "prepa"), "🎓"),
]


LEVEL_LABEL = {
    "BEGINNER": "Débutant",
    "INTERMEDIATE": "Intermédiaire",
    "ADVANCED": "Avancé",
}


def _normalize(s: str) -> str:
    """Lowercase + supprime les accents basiques (pour matcher les mots-clés)."""
    return (
        s.lower()
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("ë", "e")
        .replace("à", "a")
        .replace("â", "a")
        .replace("ï", "i")
        .replace("î", "i")
        .replace("ô", "o")
        .replace("ö", "o")
        .replace("ù", "u")
        .replace("û", "u")
        .replace("ç", "c")
    )


def _palette_for(seed: str) -> Tuple[str, str, str]:
    h = hashlib.sha1(seed.encode("utf-8")).digest()
    idx = h[0] % len(_PALETTES)
    return _PALETTES[idx]


def _emoji_for(title: str) -> str:
    t = _normalize(title)
    for keywords, emoji in _KEYWORDS_EMOJI:
        if any(k in t for k in keywords):
            return emoji
    return "📘"


def _wrap_title(title: str, max_chars_per_line: int = 22) -> list[str]:
    """Découpe le titre sur 1–3 lignes (mots entiers), sans dépasser la
    largeur cible. Le SVG est aussi tronqué à ``max_chars_per_line``
    caractères par ligne pour préserver la lisibilité au format 16:9.
    """
    words = title.strip().split()
    lines: list[str] = []
    current = ""
    for w in words:
        candidate = (current + " " + w).strip() if current else w
        if len(candidate) <= max_chars_per_line or not current:
            current = candidate
        else:
            lines.append(current)
            current = w
        if len(lines) == 3:
            break
    if current and len(lines) < 3:
        lines.append(current)
    # Ellipsis si tronqué
    if len(lines) == 3 and any(True for _ in words):
        joined = " ".join(lines)
        if len(joined) < len(title):
            lines[-1] = lines[-1].rstrip(",;.") + "…"
    return lines[:3] or ["Sans titre"]


def generate_svg_cover(
    *,
    title: str,
    subtitle: str = "",
    level: str = "BEGINNER",
    language: str = "fr",
) -> bytes:
    """Génère l'image de couverture d'un cours en SVG.

    Le SVG est un fichier vectoriel léger (< 3 kB) rendu comme une image
    par n'importe quel navigateur / lecteur d'image, et supporté par
    ``ImageField`` de Django dès lors que le contenu MIME correct est
    servi ("image/svg+xml").
    """
    palette = _palette_for(title)
    emoji = _emoji_for(title)
    lines = _wrap_title(title)
    level_label = LEVEL_LABEL.get(level.upper(), level.title())

    # Rendu SVG — dimensions absolues pour compatibilité maximale.
    W, H = 1600, 900

    # Tailles de police adaptatives selon le nombre de lignes.
    title_size = {1: 108, 2: 92, 3: 76}[len(lines)]
    line_height = int(title_size * 1.15)
    # Point de départ vertical : centre le bloc titre visuellement.
    total_title_h = line_height * len(lines)
    start_y = int((H - total_title_h) / 2) + int(title_size * 0.7)

    # Texte principal : anti-aliasing + shadow pour lisibilité sur gradient.
    title_lines_svg = "".join(
        f'<text x="80" y="{start_y + i * line_height}" fill="white" '
        f'font-size="{title_size}" font-weight="800" '
        f'font-family="Inter, system-ui, -apple-system, sans-serif" '
        f'style="text-shadow: 0 2px 4px rgba(0,0,0,0.25);">'
        f'{escape(line)}'
        f'</text>'
        for i, line in enumerate(lines)
    )

    # Bandeau footer : niveau + langue + tagline "Best-Épargne".
    subtitle_txt = escape((subtitle or "").strip())[:60]
    footer_left = escape(f"{level_label} · {language.upper()}")

    # Éléments décoratifs pseudo-aléatoires dérivés du titre (stable) :
    # cercles concentriques, courbes et dots pour donner du relief.
    h = hashlib.sha1(title.encode("utf-8")).digest()
    circle_x = 120 + (h[1] % 200)
    circle_y = 620 + (h[2] % 120)
    curve_offset = 50 + (h[3] % 100)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}"
     width="{W}" height="{H}" role="img"
     aria-label="Couverture du cours : {escape(title)}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{palette[0]}"/>
      <stop offset="55%" stop-color="{palette[1]}"/>
      <stop offset="100%" stop-color="{palette[2]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <pattern id="dots" x="0" y="0" width="40" height="40"
             patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="rgba(255,255,255,0.10)"/>
    </pattern>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#bg)"/>
  <rect width="{W}" height="{H}" fill="url(#dots)"/>
  <rect width="{W}" height="{H}" fill="url(#glow)"/>

  <!-- Formes décoratives (donnent un côté illustré / réaliste) -->
  <g opacity="0.12" fill="none" stroke="white" stroke-width="2">
    <circle cx="{circle_x}" cy="{circle_y}" r="120"/>
    <circle cx="{circle_x}" cy="{circle_y}" r="180"/>
    <circle cx="{circle_x}" cy="{circle_y}" r="240"/>
  </g>
  <path d="M 0 {H - curve_offset} Q {W/2} {H - curve_offset - 120}
           {W} {H - curve_offset}"
        fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
  <path d="M 0 {H - curve_offset - 60} Q {W/2} {H - curve_offset - 200}
           {W} {H - curve_offset - 60}"
        fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- Emoji thématique (gros, coin haut-droit) avec halo -->
  <circle cx="{W - 180}" cy="180" r="140" fill="rgba(255,255,255,0.08)"/>
  <text x="{W - 100}" y="240" text-anchor="end"
        font-size="220"
        style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));">
    {emoji}
  </text>

  <!-- Titre principal (multi-lignes) -->
  {title_lines_svg}

  <!-- Sous-titre (optionnel) -->
  {f'<text x="80" y="{start_y + total_title_h + 40}" fill="rgba(255,255,255,0.85)" font-size="36" font-family="Inter, sans-serif" font-weight="500">{subtitle_txt}</text>' if subtitle_txt else ''}

  <!-- Footer : niveau · langue + branding Best-Épargne -->
  <text x="80" y="{H - 60}" fill="rgba(255,255,255,0.75)"
        font-size="30" font-family="Inter, sans-serif" font-weight="600"
        letter-spacing="2">
    {footer_left}
  </text>
  <text x="{W - 80}" y="{H - 60}" text-anchor="end"
        fill="rgba(255,255,255,0.75)" font-size="28"
        font-family="Inter, sans-serif" font-weight="700"
        letter-spacing="3">
    BEST-ÉPARGNE
  </text>
</svg>
""".encode("utf-8")
