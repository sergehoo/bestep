"""tests/test_security_email_templates.py — SECURITE-06 templates HTML.

Vérifie que les templates HTML + text pour :
    - vérification e-mail (issue_token)
    - approbation formateur
    - refus formateur

    → rendent correctement, contiennent les infos attendues, et que
    ``EmailMultiAlternatives`` envoie bien un mail multipart avec le
    text plain en primary + le HTML en alternative.
"""
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.template.loader import render_to_string

User = get_user_model()


@pytest.mark.django_db
class TestVerifyEmailTemplate:
    def test_html_contains_link_and_ttl(self):
        u = User.objects.create_user(
            email="tpl.verify@example.com",
            password="pw123!Solid",
            full_name="Alice Test",
        )
        html = render_to_string(
            "emails/security/verify_email.html",
            {
                "user": u,
                "user_name": u.full_name,
                "link": "https://example.com/verify?uid=1&token=abc",
                "ttl_hours": 48,
            },
        )
        assert "Alice Test" in html
        assert "https://example.com/verify?uid=1&token=abc" in html
        assert "48 heures" in html
        assert "Vérifier mon e-mail" in html

    def test_text_version_is_plain(self):
        text = render_to_string(
            "emails/security/verify_email.txt",
            {
                "user_name": "Bob",
                "link": "https://x.io/verify",
                "ttl_hours": 24,
            },
        )
        # Pas de tag HTML dans la version texte
        assert "<" not in text
        assert "https://x.io/verify" in text
        assert "24 heures" in text

    def test_issue_token_sends_multipart_email(self):
        from compte.email_verification import issue_token
        u = User.objects.create_user(
            email="tpl.multi@example.com",
            password="pw123!Solid",
            full_name="Charlie",
        )
        mail.outbox.clear()
        issue_token(u)
        assert len(mail.outbox) == 1
        m = mail.outbox[0]
        assert m.to == [u.email]
        assert "Best-Épargne" in m.subject
        # Un texte + une alternative HTML
        assert len(m.alternatives) == 1
        html, mime = m.alternatives[0]
        assert mime == "text/html"
        assert "Charlie" in html
        assert "/verify-email?uid=" in html


@pytest.mark.django_db
class TestInstructorEmailTemplates:
    def test_approved_html_contains_cta(self):
        u = User.objects.create_user(
            email="tpl.appr@example.com",
            password="pw123!Solid",
            full_name="Dora",
        )
        html = render_to_string(
            "emails/security/instructor_approved.html",
            {
                "user": u,
                "user_name": u.full_name,
                "frontend_base": "https://app.local",
            },
        )
        assert "Dora" in html
        assert "https://app.local/instructor" in html
        assert "Ouvrir mon espace formateur" in html
        assert "Best-AI" in html  # mention explicite dans le corps

    def test_rejected_html_shows_reason(self):
        u = User.objects.create_user(
            email="tpl.rej@example.com",
            password="pw123!Solid",
            full_name="Émile",
        )
        html = render_to_string(
            "emails/security/instructor_rejected.html",
            {
                "user": u,
                "user_name": u.full_name,
                "reason": "Curriculum insuffisant",
                "frontend_base": "https://app.local",
            },
        )
        assert "Émile" in html
        assert "Curriculum insuffisant" in html
        assert "https://app.local/learn" in html

    def test_rejected_html_omits_reason_block_when_empty(self):
        u = User.objects.create_user(
            email="tpl.norej@example.com",
            password="pw123!Solid",
        )
        html = render_to_string(
            "emails/security/instructor_rejected.html",
            {
                "user": u,
                "reason": "",
                "frontend_base": "https://app.local",
            },
        )
        # Le bloc "Motif" (border-left rouge) ne doit apparaître que
        # quand reason est truthy.
        assert "border-left:4px solid #e11d48" not in html


@pytest.mark.django_db
class TestInstructorApprovalSendsEmail:
    def test_approve_endpoint_sends_html_email(self, db):
        from compte.models import InstructorProfile
        admin = User.objects.create_user(
            email="mailtest.admin@example.com",
            password="pw123!Solid",
            is_staff=True,
            is_superuser=True,
            is_email_verified=True,
        )
        target = User.objects.create_user(
            email="mailtest.teacher@example.com",
            password="pw123!Solid",
            full_name="Fatou",
            is_email_verified=True,
        )
        InstructorProfile.objects.create(
            user=target, is_verified=False, payout_percent=70,
        )
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        client = APIClient()
        token = RefreshToken.for_user(admin)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")
        mail.outbox.clear()
        r = client.post(f"/api/admin/instructors/{target.pk}/approve/")
        assert r.status_code == 200, r.data
        assert len(mail.outbox) == 1
        m = mail.outbox[0]
        assert m.to == [target.email]
        # Multipart : text/plain body + text/html alternative
        assert len(m.alternatives) == 1
        html, mime = m.alternatives[0]
        assert mime == "text/html"
        assert "Fatou" in html
        assert "validé" in m.body.lower()
