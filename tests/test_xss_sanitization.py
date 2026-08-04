"""Tests de non-régression XSS — assainissement du HTML riche à l'écriture.

Couvre les correctifs de la revue pré-landing
``chore/audit-remediation-2026-05`` :

- ``core.sanitizers.sanitize_rich_html`` neutralise les vecteurs XSS connus
  tout en préservant la mise en forme pédagogique légitime.
- ``<iframe>`` : allowlist d'hôtes, y compris contre les URL
  protocol-relatives (``//evil.com``) que l'allowlist de protocoles de
  bleach ne rejette pas, et contre l'astuce userinfo
  (``https://www.youtube.com@evil.com``).
- Les serializers d'écriture appliquent l'assainissement sur les champs
  effectivement rendus via ``dangerouslySetInnerHTML`` côté SPA :
  ``Course.description``, ``Lesson.content``, ``GlossaryTerm.long_definition``.
- Le tool LLM ``analyze_content_for_glossary`` assainit ``long_definition``
  avant persistance (frontière de confiance LLM).

La vérification PARSE le HTML de sortie au lieu de chercher une sous-chaîne :
une valeur d'attribut contenant le texte « onerror » est inoffensive, seul un
attribut réellement nommé ``onerror`` compte.

Lancer : `pytest tests/test_xss_sanitization.py -v`
"""
from __future__ import annotations

from html.parser import HTMLParser

import pytest

from core.sanitizers import sanitize_plain_text, sanitize_rich_html

DANGEROUS_TAGS = {"script", "svg", "form", "object", "embed", "base", "link", "style"}
IFRAME_OK_MARKERS = ("youtube", "vimeo")


class _Audit(HTMLParser):
    """Collecte ce qui reste d'exécutable dans un fragment HTML."""

    def __init__(self) -> None:
        super().__init__()
        self.bad: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in DANGEROUS_TAGS:
            self.bad.append(f"balise <{tag}>")
        for name, value in attrs:
            if name.startswith("on"):
                self.bad.append(f"{tag}[{name}]")
            if name in ("href", "src") and value:
                # Les navigateurs retirent TAB/LF/CR avant de résoudre l'URL.
                collapsed = "".join(value.split()).lower()
                if collapsed.startswith(("javascript:", "data:", "vbscript:")):
                    self.bad.append(f"{tag}[{name}={value[:30]}]")
            if tag == "iframe" and name == "src" and value:
                if not any(m in value for m in IFRAME_OK_MARKERS):
                    self.bad.append(f"iframe hors allowlist: {value[:30]}")


def assert_inert(html: str) -> None:
    audit = _Audit()
    audit.feed(html)
    assert not audit.bad, f"HTML encore exécutable : {audit.bad} — sortie {html!r}"


XSS_PAYLOADS = [
    pytest.param("<img src=x onerror=alert(1)>", id="img-onerror"),
    # Break-out d'attribut : `esc()` du frontend n'échappait pas le guillemet
    # double, `alt='" onerror="…'` ressortait avec un onerror vivant.
    pytest.param("""<img src='x' alt='" onerror="alert(1)'>""", id="attr-breakout"),
    pytest.param('<a href="javascript:alert(1)">x</a>', id="href-javascript"),
    # Caractère de contrôle dans le schéma : `/^javascript:/` ne matchait pas
    # alors que le navigateur retire le TAB avant de résoudre l'URL.
    pytest.param('<a href="java\tscript:alert(1)">x</a>', id="href-javascript-tab"),
    pytest.param('<a href="jav&#x09;ascript:alert(1)">x</a>', id="href-javascript-entity"),
    pytest.param("<script>alert(1)</script>", id="script-tag"),
    pytest.param("<svg onload=alert(1)>", id="svg-onload"),
    pytest.param("<svg><animate onbegin=alert(1) attributeName=x>", id="svg-animate"),
    pytest.param('<div style="background:url(//evil)">x</div>', id="style-url"),
    pytest.param('<iframe src="//evil.com"></iframe>', id="iframe-protocol-relative"),
    pytest.param('<iframe src="https://evil.com/x"></iframe>', id="iframe-foreign-host"),
    pytest.param(
        '<iframe src="https://www.youtube.com@evil.com/x"></iframe>',
        id="iframe-userinfo-trick",
    ),
    pytest.param('<form action="//evil"><input name="x"></form>', id="form-injection"),
    pytest.param(
        '<a href="data:text/html,<script>alert(1)</script>">x</a>', id="href-data-uri"
    ),
    pytest.param('<base href="//evil.com">', id="base-tag"),
    pytest.param('<object data="javascript:alert(1)">', id="object-javascript"),
]


@pytest.mark.parametrize("payload", XSS_PAYLOADS)
def test_sanitize_rich_html_neutralise_les_vecteurs_connus(payload):
    assert_inert(sanitize_rich_html(payload))


@pytest.mark.parametrize(
    "payload,attendu",
    [
        ("<p>Bonjour <strong>monde</strong></p>", "<strong>"),
        ('<a href="https://ok.fr" target="_blank">lien</a>', 'href="https://ok.fr"'),
        (
            '<iframe src="https://www.youtube.com/embed/abc"></iframe>',
            "youtube.com/embed/abc",
        ),
        ('<table><tr><td colspan="2">x</td></tr></table>', 'colspan="2"'),
        ("<ul><li>un</li><li>deux</li></ul>", "<li>"),
        ('<img src="https://cdn.fr/a.png" alt="schema">', 'alt="schema"'),
    ],
)
def test_sanitize_rich_html_preserve_la_mise_en_forme_legitime(payload, attendu):
    """Un assainisseur qui casse le contenu pédagogique sera désactivé."""
    assert attendu in sanitize_rich_html(payload)


def test_sanitize_rich_html_accepte_none_et_vide():
    assert sanitize_rich_html(None) == ""
    assert sanitize_rich_html("") == ""


def test_sanitize_plain_text_retire_tout_balisage_et_borne():
    assert sanitize_plain_text("<b>Actions</b> <script>x</script>") == "Actions x"
    assert sanitize_plain_text("<script></script>") == ""
    assert len(sanitize_plain_text("a" * 500, max_length=200)) == 200


# ── Frontière de confiance LLM ───────────────────────────────────────────


def test_tool_llm_glossaire_assainit_long_definition():
    """Le tool persiste du HTML produit par le LLM, rendu ensuite tel quel
    par GlossaryTermPage. La sortie du modèle est influençable par le
    contenu de cours qu'on lui donne à analyser, donc par un instructeur."""
    from ai.tools.analyze_content_for_glossary import _normalize_proposals

    out = _normalize_proposals([
        {
            "word": "Obligation<script>alert(1)</script>",
            "short_definition": "<b>Titre</b> de créance",
            "long_definition": '<p>Def</p><img src=x onerror="alert(1)">',
        }
    ])
    assert len(out) == 1
    assert_inert(out[0]["long_definition"])
    assert "<p>Def</p>" in out[0]["long_definition"]
    # word et short_definition ne sont jamais du HTML.
    assert "<" not in out[0]["word"]
    assert out[0]["short_definition"] == "Titre de créance"


def test_tool_llm_rejette_un_mot_vide_apres_assainissement():
    """Un `word` valant "<script></script>" est non vide à l'entrée mais vide
    une fois nettoyé : il ne doit pas créer de terme au libellé vide."""
    from ai.tools.analyze_content_for_glossary import _normalize_proposals

    assert _normalize_proposals([
        {"word": "<script></script>", "short_definition": "x"}
    ]) == []


def test_tool_llm_borne_la_longueur_de_long_definition():
    """`word` (200) et `short_definition` (400) étaient bornés, pas
    `long_definition` — asymétrie exploitable en bombe de texte."""
    from ai.tools.analyze_content_for_glossary import (
        MAX_LONG_DEFINITION_LEN,
        _normalize_proposals,
    )

    out = _normalize_proposals([
        {
            "word": "Terme",
            "short_definition": "def",
            "long_definition": "<p>" + ("a" * 20000) + "</p>",
        }
    ])
    assert len(out[0]["long_definition"]) <= MAX_LONG_DEFINITION_LEN


# ── Serializers d'écriture ───────────────────────────────────────────────


def test_serializers_exposent_les_hooks_dassainissement():
    """Garde-fou structurel : si quelqu'un retire un `validate_*`, le champ
    correspondant redevient un sink XSS silencieux. On vérifie ici que les
    trois hooks existent bien sur les serializers d'écriture concernés."""
    from best_epargne.apis.serializers import CourseSerializer, LessonSerializer
    from glossary.serializers import GlossaryTermWriteSerializer

    assert hasattr(CourseSerializer, "validate_description")
    assert hasattr(LessonSerializer, "validate_content")
    assert hasattr(GlossaryTermWriteSerializer, "validate_long_definition")
    assert hasattr(GlossaryTermWriteSerializer, "validate_short_definition")


@pytest.mark.parametrize(
    "serializer_path,methode,champ",
    [
        ("best_epargne.apis.serializers.CourseSerializer", "validate_description", "description"),
        ("best_epargne.apis.serializers.LessonSerializer", "validate_content", "content"),
        (
            "glossary.serializers.GlossaryTermWriteSerializer",
            "validate_long_definition",
            "long_definition",
        ),
    ],
)
def test_hooks_serializers_neutralisent_le_payload(serializer_path, methode, champ):
    import importlib

    module_path, cls_name = serializer_path.rsplit(".", 1)
    cls = getattr(importlib.import_module(module_path), cls_name)
    payload = '<p>ok</p><img src=x onerror="alert(1)"><script>alert(2)</script>'
    result = getattr(cls, methode)(cls(), payload)
    assert_inert(result)
    assert "<p>ok</p>" in result, f"{champ} : la mise en forme légitime est perdue"
