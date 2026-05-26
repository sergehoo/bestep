"""certifications/services.py — CORRECTIFS V2.A (CERT-01, CERT-02, CERT-04, CERT-06, CERT-07).

- CERT-01 (Critique) : génère un PDF embarquant désormais le ``verification_hash``
  visiblement (footer + QR code).
- CERT-02 (Important) : ``_safe_name`` tronque/sanitise le nom de l'apprenant
  pour éviter overflow visuel et caractères de contrôle.
- CERT-04 (Important) : ``issue_certificate_if_passed`` ne lève plus
  ``Enrollment.DoesNotExist`` brutalement — renvoie ``None`` avec raison.
- CERT-06 (Important) : exploite ``CertificateTemplate.background`` /
  ``signature_name`` / ``signature_title`` quand un template est rattaché.
- CERT-07 : storage via ``default_storage`` (S3/MinIO) configuré dans settings.

Le QR code pointe vers ``settings.SITE_URL + reverse('certifications:verify',
{verification_hash})``. Si ``SITE_URL`` n'est pas défini, on utilise un
fallback ``/certifications/verify/<hash>/``.
"""
from __future__ import annotations

import io
import logging

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.urls import reverse
from django.utils import timezone

import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from assessments.models import Attempt, Quiz
from enrollments.models import Enrollment

from .models import CertificateTemplate, IssuedCertificate

logger = logging.getLogger(__name__)


_MAX_NAME_LEN = 60


def _safe_name(name: str, max_len: int = _MAX_NAME_LEN) -> str:
    """CORRECTIF CERT-02 : sanitisation du nom apprenant.

    - Retire les caractères de contrôle / non imprimables.
    - Tronque à 60 caractères pour éviter overflow visuel.
    - Fallback 'Apprenant' si vide.
    """
    name = (name or "Apprenant").strip()
    name = "".join(c for c in name if c.isprintable())
    return name[:max_len] or "Apprenant"


def _build_verification_url(verification_hash) -> str:
    """Construit l'URL publique de vérification du certificat."""
    try:
        path = reverse("certifications:verify", kwargs={"verification_hash": str(verification_hash)})
    except Exception:  # pragma: no cover - reverse échoue avant le branchement des URLs
        path = f"/certifications/verify/{verification_hash}/"
    site_url = getattr(settings, "SITE_URL", "")
    return f"{site_url}{path}" if site_url else path


def _generate_qr_image(payload: str):
    """Retourne un ImageReader QR code pour reportlab."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _render_certificate_pdf(
    *,
    user_name: str,
    course_title: str,
    serial: str,
    score: int,
    verification_url: str,
    template: CertificateTemplate | None = None,
) -> bytes:
    """CORRECTIF CERT-01/02/06 : PDF complet avec hash, QR et template."""
    buff = io.BytesIO()
    c = canvas.Canvas(buff, pagesize=A4)
    width, height = A4

    # CORRECTIF CERT-02 : strip control characters.
    safe_serial = "".join(ch for ch in serial if ch.isalnum())
    c.setTitle(f"Certificate {safe_serial}")
    safe_user = _safe_name(user_name)
    safe_course = _safe_name(course_title, max_len=120)

    # CORRECTIF CERT-06 : background du template si présent.
    if template and template.background:
        try:
            c.drawImage(
                ImageReader(template.background.open("rb")),
                0,
                0,
                width=width,
                height=height,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception as exc:  # pragma: no cover - storage indispo
            logger.warning("certificate.background.error", extra={"exc": str(exc)})

    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(width / 2, height - 140, "CERTIFICAT DE RÉUSSITE")

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 180, "Ce certificat atteste que")

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 220, safe_user)

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 260, "a validé avec succès le cours")

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - 295, safe_course)

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 335, f"Score obtenu : {score}%")

    # CORRECTIF CERT-06 : signature.
    if template and (template.signature_name or template.signature_title):
        c.setFont("Helvetica-Oblique", 12)
        if template.signature_name:
            c.drawCentredString(width / 2, 170, template.signature_name)
        if template.signature_title:
            c.setFont("Helvetica", 10)
            c.drawCentredString(width / 2, 154, template.signature_title)

    # CORRECTIF CERT-01 : QR code de vérification.
    try:
        qr_img = _generate_qr_image(verification_url)
        c.drawImage(qr_img, width - 130, 50, width=90, height=90, mask="auto")
    except Exception as exc:  # pragma: no cover - qrcode/pillow indispo
        logger.warning("certificate.qr.error", extra={"exc": str(exc)})

    # Footer : serial + date + URL.
    c.setFont("Helvetica", 9)
    c.drawString(40, 80, f"N° de série : {safe_serial}")
    c.drawString(40, 65, f"Émis le : {timezone.now().date().isoformat()}")
    c.setFont("Helvetica", 7)
    c.drawString(40, 50, f"Vérifier : {verification_url}")

    c.showPage()
    c.save()
    return buff.getvalue()


@transaction.atomic
def issue_certificate_if_passed(user, course) -> IssuedCertificate | None:
    """Émet un certificat si l'utilisateur a réussi le quiz final.

    CORRECTIF CERT-04 : ne lève PLUS Enrollment.DoesNotExist (retourne None).
    Idempotent : si un certificat actif existe déjà, on le renvoie tel quel.
    """
    if not Enrollment.objects.filter(user=user, course=course).exists():
        logger.debug("certificate.issue.skip.no_enrollment", extra={"user_id": user.id, "course_id": course.id})
        return None

    # CORRECTIF CERT-05 : on filtre sur is_final=True (V_FIN.A) ; fallback
    # legacy sur lesson__isnull pour les bases qui n'ont pas encore migré.
    final_quiz = (
        Quiz.objects.filter(course=course, is_final=True).first()
        or Quiz.objects.filter(course=course, lesson__isnull=True, is_onboarding=False).first()
    )
    if not final_quiz:
        return None

    best_attempt = (
        Attempt.objects.filter(quiz=final_quiz, user=user, submitted_at__isnull=False)
        .order_by("-score_percent")
        .first()
    )
    if not best_attempt or not best_attempt.passed:
        return None

    # CORRECTIF CERT-03 : on cherche un certificat ACTIF (non révoqué) pour ce
    # couple (user, course) ; si un certificat révoqué existe, on en émet un nouveau.
    existing = IssuedCertificate.objects.filter(
        user=user, course=course, revoked_at__isnull=True
    ).first()
    if existing:
        return existing

    cert = IssuedCertificate.objects.create(
        user=user,
        course=course,
        score_percent=best_attempt.score_percent,
    )

    tpl = CertificateTemplate.objects.first()
    if tpl:
        cert.template = tpl
        cert.save(update_fields=["template"])

    pdf_bytes = _render_certificate_pdf(
        user_name=getattr(user, "full_name", "") or user.email,
        course_title=course.title,
        serial=cert.serial,
        score=best_attempt.score_percent,
        verification_url=_build_verification_url(cert.verification_hash),
        template=tpl,
    )
    cert.pdf_file.save(f"certificate_{cert.serial}.pdf", ContentFile(pdf_bytes), save=True)
    return cert


@transaction.atomic
def revoke_certificate(certificate_id: int, *, reason: str = "") -> IssuedCertificate | None:
    """Révoque un certificat (CERT-03)."""
    try:
        cert = IssuedCertificate.objects.select_for_update().get(pk=certificate_id)
    except IssuedCertificate.DoesNotExist:
        return None
    if cert.revoked_at is not None:
        return cert
    cert.revoked_at = timezone.now()
    cert.revoked_reason = (reason or "")[:255]
    cert.save(update_fields=["revoked_at", "revoked_reason"])
    return cert
