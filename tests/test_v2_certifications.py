"""Tests V2.A — Certifications vérifiables."""
from __future__ import annotations

import pytest


@pytest.mark.django_db
def test_verify_certificate_404_for_unknown_hash(client):
    """L'endpoint anti-énumération retourne 404 sur un hash inconnu."""
    import uuid
    resp = client.get(f"/certifications/verify/{uuid.uuid4()}/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_verify_certificate_api_returns_json(client, alice):
    """API JSON renvoie un payload structurellement correct."""
    from catalog.models import Course
    from certifications.models import IssuedCertificate

    course = Course.objects.create(
        title="Test course",
        slug="test-course",
        status=Course.Status.PUBLISHED,
        instructor=alice,
    )
    cert = IssuedCertificate.objects.create(user=alice, course=course, score_percent=85)
    resp = client.get(f"/certifications/api/verify/{cert.verification_hash}/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["verified"] is True
    assert data["status"] == "valid"
    assert data["score_percent"] == 85
    assert data["course_title"] == "Test course"
    # Pas de leak email.
    assert "email" not in data.get("holder", {})


@pytest.mark.django_db
def test_revoked_certificate_marked_invalid(client, alice):
    """Un certificat révoqué retourne status=revoked."""
    from catalog.models import Course
    from certifications.models import IssuedCertificate
    from certifications.services import revoke_certificate

    course = Course.objects.create(
        title="Cours révoqué",
        slug="cours-revoque",
        status=Course.Status.PUBLISHED,
        instructor=alice,
    )
    cert = IssuedCertificate.objects.create(user=alice, course=course, score_percent=75)
    revoke_certificate(cert.id, reason="Fraude détectée")

    resp = client.get(f"/certifications/api/verify/{cert.verification_hash}/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["verified"] is False
    assert data["status"] == "revoked"
    # Le score n'est plus exposé sur un certificat révoqué.
    assert data["score_percent"] is None


@pytest.mark.django_db
def test_revoke_then_reissue_does_not_violate_unique(alice):
    """CERT-03 : on peut ré-émettre un certificat après révocation."""
    from catalog.models import Course
    from certifications.models import IssuedCertificate
    from certifications.services import revoke_certificate

    course = Course.objects.create(
        title="Cours réémis",
        slug="cours-reemis",
        status=Course.Status.PUBLISHED,
        instructor=alice,
    )
    c1 = IssuedCertificate.objects.create(user=alice, course=course, score_percent=70)
    revoke_certificate(c1.id, reason="reset")

    # Pas d'IntegrityError grâce à UniqueConstraint conditionnée.
    c2 = IssuedCertificate.objects.create(user=alice, course=course, score_percent=85)
    assert c1.id != c2.id
    assert c1.serial != c2.serial
