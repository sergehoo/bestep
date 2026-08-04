"""Assainissement du HTML riche accepté en écriture.

Contexte (revue pré-landing, branche ``chore/audit-remediation-2026-05``) :
plusieurs champs de contenu riche étaient persistés bruts puis rendus côté
SPA via ``dangerouslySetInnerHTML``. Deux justifications circulaient dans les
commentaires du code, toutes deux fausses :

* « sanitisé par l'éditeur Tiptap » — Tiptap assainit dans le navigateur de
  l'auteur. Un instructeur qui poste directement sur l'API ne passe jamais
  par l'éditeur.
* « policy CSP » — la CSP de ``best_epargne.settings.base`` est posée par
  ``csp.middleware.CSPMiddleware`` et ne couvrait que les réponses rendues
  par Django, jamais le SPA servi par nginx.

Le SPA assainit désormais au rendu (``frontend/src/lib/sanitize.ts``) et ce
module assainit à l'écriture. Les deux sont voulus : la base contient déjà
de l'historique écrit avant ce durcissement.

L'allowlist doit rester alignée sur celle du frontend. Une balise autorisée
ici mais retirée là-bas disparaît silencieusement à l'affichage ; l'inverse
laisse passer du contenu que le rendu n'attend pas.
"""

from __future__ import annotations

from urllib.parse import urlparse

import bleach

# Hôtes autorisés pour les ``<iframe>`` embarqués. Aligné sur ``CSP_FRAME_SRC``
# (``best_epargne/settings/base.py``) et sur IFRAME_ALLOWED_HOSTS de
# ``frontend/src/lib/sanitize.ts``.
#
# Sans ce contrôle, ``<iframe src="//evil.com">`` passe : l'allowlist de
# protocoles de bleach ne rejette pas une URL protocol-relative, qui n'a
# précisément aucun schéma. Un iframe arbitraire est une prise de contrôle
# visuelle de la page (faux formulaire de login superposé au contenu).
IFRAME_ALLOWED_HOSTS: frozenset[str] = frozenset({
    "www.youtube.com",
    "youtube.com",
    "www.youtube-nocookie.com",
    "player.vimeo.com",
})

# Aligné sur ALLOWED_TAGS de frontend/src/lib/sanitize.ts.
ALLOWED_TAGS: frozenset[str] = frozenset({
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr", "span", "div", "section", "article",
    "strong", "b", "em", "i", "u", "s", "del", "ins", "mark",
    "small", "sub", "sup",
    "ul", "ol", "li", "dl", "dt", "dd",
    "blockquote", "pre", "code", "kbd", "samp", "var",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "caption", "colgroup", "col",
    "a", "img", "figure", "figcaption",
    "iframe", "video", "audio", "source", "track",
})

_IFRAME_PLAIN_ATTRS: frozenset[str] = frozenset({
    "width", "height", "allow", "allowfullscreen", "title", "class", "id",
})


def _allow_iframe_attr(tag: str, name: str, value: str) -> bool:
    """Autorise un attribut d'``<iframe>``.

    ``src`` n'est accepté que si l'hôte figure dans IFRAME_ALLOWED_HOSTS.
    Les URL protocol-relatives (``//host/…``) sont résolues explicitement :
    ``urlparse`` les expose bien dans ``netloc``, mais elles échappent à
    l'allowlist de protocoles de bleach puisqu'elles n'ont pas de schéma.
    """
    if name != "src":
        return name in _IFRAME_PLAIN_ATTRS
    try:
        parsed = urlparse(value.strip())
    except ValueError:
        return False
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return False
    # ``netloc`` peut porter un port ou des identifiants ; on ne garde que
    # l'hôte et on refuse tout ce qui n'est pas exactement dans l'allowlist.
    return parsed.hostname in IFRAME_ALLOWED_HOSTS


# Aligné sur ALLOWED_ATTR de frontend/src/lib/sanitize.ts.
# Pas de ``style`` : ``url()`` dans une feuille de style inline est un
# vecteur d'exfiltration. Pas de ``on*`` : bleach les retire, l'absence
# d'entrée ici rend l'intention explicite.
ALLOWED_ATTRS: dict[str, list[str]] = {
    "*": ["class", "id", "title", "aria-label", "aria-hidden", "role"],
    "a": ["href", "target", "rel"],
    "img": ["src", "alt", "width", "height", "loading"],
    # ``iframe`` est traité par un callable : la valeur de ``src`` doit être
    # vérifiée, pas seulement le nom de l'attribut. Voir _allow_iframe_attr.
    "iframe": lambda tag, name, value: _allow_iframe_attr(tag, name, value),
    "video": ["src", "width", "height", "controls", "poster", "preload"],
    "audio": ["src", "controls", "preload"],
    "source": ["src", "type", "srcset"],
    "track": ["src", "kind", "srclang", "label", "default"],
    "th": ["colspan", "rowspan", "align", "scope"],
    "td": ["colspan", "rowspan", "align"],
    "col": ["span"],
    "colgroup": ["span"],
}

# bleach neutralise déjà ``javascript:`` et consorts en n'autorisant que ces
# protocoles. C'est la garantie que le contrôle par expression régulière
# côté frontend n'apportait pas (``java\tscript:`` passait au travers).
ALLOWED_PROTOCOLS: frozenset[str] = frozenset({"http", "https", "mailto", "tel"})


def sanitize_rich_html(value: str | None) -> str:
    """Assainit du HTML riche destiné à être rendu tel quel.

    Conserve la mise en forme pédagogique (titres, listes, tableaux, médias
    embarqués) et retire tout ce qui est exécutable.

    :param value: HTML d'origine utilisateur, LLM ou import.
    :returns: HTML assaini, chaîne vide si l'entrée est vide.
    """
    if not value:
        return ""
    return bleach.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
    )


def sanitize_plain_text(value: str | None, *, max_length: int | None = None) -> str:
    """Retire tout balisage. Pour les champs qui ne doivent jamais être du HTML.

    :param value: texte d'origine utilisateur ou LLM.
    :param max_length: troncature optionnelle, appliquée après nettoyage.
    """
    if not value:
        return ""
    clean = bleach.clean(value, tags=set(), attributes={}, strip=True).strip()
    if max_length is not None:
        clean = clean[:max_length]
    return clean
