from __future__ import annotations
import io
from django.conf import settings
from django.utils import timezone
from django.db import transaction
from django.core.files.base import ContentFile

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from assessments.models import Quiz, Attempt
from enrollments.models import Enrollment
from .models import IssuedCertificate, CertificateTemplate


def _render_certificate_pdf(user_name: str, course_title: str, serial: str, score: int) -> bytes:
    buff = io.BytesIO()
    c = canvas.Canvas(buff, pagesize=A4)
    width, height = A4

    c.setTitle(f"Certificate {serial}")

    # Simple layout (tu pourras raffiner avec template/background)
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(width / 2, height - 120, "CERTIFICAT DE RÉUSSITE")

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 170, "Ce certificat atteste que")

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, height - 210, user_name or "Apprenant")

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 250, "a validé le cours")

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, height - 285, course_title)

    c.setFont("Helvetica", 12)
    c.drawCentredString(width / 2, height - 330, f"Score: {score}%")

    c.setFont("Helvetica", 10)
    c.drawString(50, 80, f"Serial: {serial}")
    c.drawRightString(width - 50, 80, f"Date: {timezone.now().date().isoformat()}")

    c.showPage()
    c.save()
    return buff.getvalue()


@transaction.atomic
def issue_certificate_if_passed(user, course) -> IssuedCertificate | None:
    """
    Règle: si le cours a un quiz final (Quiz sans lesson) et l’utilisateur a un attempt PASSED, on émet le certificat.
    """
    # user doit être inscrit
    Enrollment.objects.get(user=user, course=course)

    final_quiz = Quiz.objects.filter(course=course, lesson__isnull=True).first()
    if not final_quiz:
        return None

    best_attempt = Attempt.objects.filter(quiz=final_quiz, user=user, submitted_at__isnull=False).order_by(
        "-score_percent").first()
    if not best_attempt or not best_attempt.passed:
        return None

    cert, created = IssuedCertificate.objects.get_or_create(
        user=user,
        course=course,
        defaults={"score_percent": best_attempt.score_percent},
    )
    if not created:
        # déjà émis
        return cert

    # option: template par défaut
    tpl = CertificateTemplate.objects.first()
    if tpl:
        cert.template = tpl
        cert.save(update_fields=["template"])

    pdf_bytes = _render_certificate_pdf(
        user_name=getattr(user, "full_name", "") or user.email,
        course_title=course.title,
        serial=cert.serial,
        score=best_attempt.score_percent,
    )
    cert.pdf_file.save(f"certificate_{cert.serial}.pdf", ContentFile(pdf_bytes), save=True)
    return cert
