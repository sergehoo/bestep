"""Régression : le lien de vérification d'e-mail doit être cliquable.

Contexte (QA du 2026-08-04, branche chore/audit-remediation-2026-05) :
l'inscription était cassée de bout en bout en production.

``compte/email_verification.py::_build_verification_link`` lisait
``settings.FRONTEND_BASE_URL`` via ``getattr(..., "")``. La variable n'était
définie NULLE PART (ni base.py, ni dev.py, ni prod.py, ni .env.example, ni
docker-compose.yml). Le repli silencieux produisait un lien relatif
``/verify-email?uid=…``, inexploitable dans un client mail. Comme
``ACCOUNT_EMAIL_VERIFICATION`` vaut "mandatory", aucun compte ne pouvait
être activé.

Second défaut sur le même lien : le template ``verify_email.txt`` laissait
l'autoescape de Django transformer le ``&`` de l'URL en ``&amp;``. Le
paramètre devenait ``amp;token=`` et le jeton ne parsait pas, y compris si
l'utilisateur recopiait le lien à la main.

Le test historique ``test_security_email_templates.py`` asserte
``"/verify-email?uid=" in html``, ce qui passait AUSSI avec l'URL relative :
il verrouillait le bug au lieu de l'attraper. D'où ce fichier, qui teste la
propriété qui compte pour l'utilisateur — « puis-je cliquer ce lien ? » —
et non la simple présence d'une sous-chaîne.

Lancer : `pytest tests/test_email_verification_link.py -v`
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from django.core import mail
from django.test import override_settings

from compte.email_verification import issue_token
from compte.models import User


def _link_from_plain_text(body: str) -> str:
    lines = [l.strip() for l in body.splitlines() if "verify-email" in l]
    assert lines, f"aucun lien de vérification dans le corps texte :\n{body}"
    return lines[0]


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="regression.verif@example.com",
        password="Irrelevant-For-This-Test-1",
        full_name="Regression Verif",
    )


@pytest.mark.django_db
@override_settings(FRONTEND_BASE_URL="https://app.example.com")
def test_lien_est_absolu(user):
    """Un lien relatif n'est pas cliquable dans un client mail."""
    mail.outbox = []
    issue_token(user)
    link = _link_from_plain_text(mail.outbox[0].body)

    parsed = urlparse(link)
    assert parsed.scheme in ("http", "https"), f"lien non absolu : {link}"
    assert parsed.netloc == "app.example.com", f"mauvais hôte : {link}"
    assert parsed.path == "/verify-email"


@pytest.mark.django_db
@override_settings(FRONTEND_BASE_URL="https://app.example.com")
def test_les_parametres_parsent(user):
    """`&amp;` cassait le second paramètre : le jeton devenait illisible."""
    mail.outbox = []
    token = issue_token(user)
    link = _link_from_plain_text(mail.outbox[0].body)

    assert "&amp;" not in link, f"autoescape HTML dans la partie texte : {link}"
    params = parse_qs(urlparse(link).query)
    assert params.get("uid") == [str(user.pk)]
    assert params.get("token") == [token], (
        f"jeton non récupérable depuis le lien : {params}"
    )
    assert "amp;token" not in params


@pytest.mark.django_db
@override_settings(FRONTEND_BASE_URL="https://app.example.com")
def test_aucune_syntaxe_de_template_ne_fuit(user):
    """Un `{# ... #}` multiligne fuit en clair : Django ne le gère que sur
    une ligne. C'est arrivé pendant le correctif, d'où ce garde-fou."""
    mail.outbox = []
    issue_token(user)
    body = mail.outbox[0].body

    for marque in ("{#", "#}", "{%", "%}", "autoescape", "endcomment"):
        assert marque not in body, (
            f"syntaxe de template visible dans l'e-mail : {marque!r}\n{body}"
        )


@pytest.mark.django_db
@override_settings(FRONTEND_BASE_URL="https://app.example.com/")
def test_slash_final_ne_double_pas(user):
    """`https://host/` + `/verify-email` produirait `//verify-email`."""
    mail.outbox = []
    issue_token(user)
    link = _link_from_plain_text(mail.outbox[0].body)
    assert "//verify-email" not in link, f"double slash : {link}"


@pytest.mark.django_db
@override_settings(FRONTEND_BASE_URL="https://app.example.com")
def test_partie_html_reste_echappee(user):
    """Dans le HTML, `&amp;` est CORRECT : c'est une valeur d'attribut.
    Le correctif ne doit pas avoir désescapé la partie HTML."""
    mail.outbox = []
    issue_token(user)
    html, mime = mail.outbox[0].alternatives[0]

    assert mime == "text/html"
    assert "https://app.example.com/verify-email?uid=" in html
    assert "&amp;token=" in html, "la partie HTML doit rester échappée"


@pytest.mark.django_db
def test_settings_expose_une_base_non_vide():
    """La cause racine : la variable n'existait dans aucun settings.
    En DEBUG elle retombe sur l'hôte Vite, jamais sur une chaîne vide."""
    from django.conf import settings

    assert hasattr(settings, "FRONTEND_BASE_URL")
    assert settings.FRONTEND_BASE_URL, (
        "FRONTEND_BASE_URL vide : les liens repartiraient en relatif"
    )
    assert not settings.FRONTEND_BASE_URL.endswith("/")
