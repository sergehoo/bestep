"""assessments/models.py — CORRECTIFS V_FIN.A (audit ASS-16, CERT-05).

- ASS-16 : ajout d'une ``CheckConstraint`` "onboarding XOR rattaché" :
  un Quiz ``is_onboarding=True`` ne peut PAS avoir de course/section/lesson.
- CERT-05 : ajout du flag ``is_final`` + ``UniqueConstraint`` partielle
  (1 seul quiz final par cours). ``certifications/services`` peut alors
  filtrer sur ``is_final=True`` au lieu de ``lesson__isnull=True`` (ambigu).
- ASS-10 : ``Attempt.started_at`` passe à ``auto_now_add=True`` (anti-antédatage).
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class Quiz(models.Model):
    title = models.CharField(max_length=200)

    course = models.ForeignKey(
        "catalog.Course",
        on_delete=models.CASCADE,
        related_name="quizzes",
        null=True,
        blank=True,
    )
    section = models.ForeignKey(
        "catalog.CourseSection",
        on_delete=models.CASCADE,
        related_name="quizzes",
        null=True,
        blank=True,
    )
    lesson = models.OneToOneField(
        "catalog.Lesson",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quiz",
    )

    slug = models.SlugField(max_length=80, unique=True, null=True, blank=True)
    is_onboarding = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    # CORRECTIF CERT-05 : quiz final d'un cours (déclenche l'émission de certificat).
    is_final = models.BooleanField(
        default=False,
        help_text="Quiz final du cours. Sa réussite déclenche l'émission du certificat.",
    )

    passing_score = models.PositiveIntegerField(default=70)
    max_attempts = models.PositiveIntegerField(default=3)

    class Meta:
        ordering = ["title"]
        constraints = [
            # CORRECTIF ASS-16 : un quiz d'onboarding ne peut pas être rattaché.
            models.CheckConstraint(
                name="quiz_onboarding_xor_attached",
                check=(
                    models.Q(
                        is_onboarding=True,
                        course__isnull=True,
                        section__isnull=True,
                        lesson__isnull=True,
                    )
                    | models.Q(is_onboarding=False)
                ),
            ),
            # CORRECTIF CERT-05 : 1 seul quiz `is_final=True` par cours.
            models.UniqueConstraint(
                fields=["course"],
                condition=models.Q(is_final=True, course__isnull=False),
                name="quiz_one_final_per_course",
            ),
        ]

    def clean(self):
        super().clean()
        if self.is_onboarding and (self.course_id or self.section_id or self.lesson_id):
            raise ValidationError(
                "Un quiz d'onboarding ne peut pas être rattaché à un cours/section/leçon."
            )
        if self.is_final and self.is_onboarding:
            raise ValidationError(
                "Un quiz ne peut pas être à la fois `is_onboarding` et `is_final`."
            )
        if self.is_final and not self.course_id:
            raise ValidationError("Un quiz final doit être rattaché à un cours.")

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:70] or "quiz"
            slug = base
            i = 1
            while Quiz.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                i += 1
                slug = f"{base}-{i}"[:80]
            self.slug = slug

        if self.section and not self.course:
            self.course = self.section.course

        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class Question(models.Model):
    class Topic(models.TextChoices):
        BUDGET = "budget", "Budget & gestion des dépenses"
        EPARGNE = "epargne", "Épargne & discipline financière"
        OBJECTIFS = "objectifs", "Objectifs financiers"
        FLUX = "flux", "Gestion des flux (revenus / dépenses)"
        HABITUDES = "habitudes", "Habitudes & comportements financiers"
        BANQUE = "banque", "Fonctionnement bancaire"
        COMPTE = "compte", "Comptes bancaires"
        TAUX = "taux", "Taux d'intérêt & inflation"
        FRAIS = "frais", "Frais bancaires"
        MOYENS_PAIEMENT = "paiement", "Moyens de paiement"
        CREDIT = "credit", "Crédit"
        DETTE = "dette", "Gestion de la dette"
        EMPRUNT = "emprunt", "Emprunt & remboursement"
        TAUX_CREDIT = "taux_credit", "Taux de crédit"
        SUR_ENDETTEMENT = "surendettement", "Surendettement"
        INVEST = "investissement", "Investissement"
        PLACEMENT = "placement", "Placements financiers"
        RISQUE = "risque", "Risque & rendement"
        DIVERSIFICATION = "diversification", "Diversification"
        PATRIMOINE = "patrimoine", "Gestion de patrimoine"
        BOURSE = "bourse", "Marchés financiers"
        ACTIONS = "actions", "Actions"
        OBLIGATIONS = "obligations", "Obligations"
        IMMOBILIER = "immobilier", "Investissement immobilier"
        ASSURANCE = "assurance", "Assurance & protection"
        EPARGNE_SECURITE = "epargne_securite", "Épargne de sécurité"
        RISQUES_VIE = "risques_vie", "Gestion des risques de la vie"
        PREVOYANCE = "prevoyance", "Prévoyance"
        MACRO = "macro", "Économie générale"
        INFLATION = "inflation", "Inflation"
        POLITIQUE_MONETAIRE = "politique_monetaire", "Politique monétaire"
        CROISSANCE = "croissance", "Croissance économique"
        CONJONCTURE = "conjoncture", "Conjoncture économique"
        ENTREPRENEURIAT = "entrepreneuriat", "Entrepreneuriat"
        BUSINESS_MODEL = "business_model", "Business model"
        CASHFLOW = "cashflow", "Cash-flow"
        REVENUS = "revenus", "Sources de revenus"
        INVEST_ENTREPRISE = "invest_entreprise", "Investir dans une entreprise"
        FISCALITE = "fiscalite", "Fiscalité"
        STRATEGIE = "strategie", "Stratégie financière"
        PLANIFICATION = "planification", "Planification financière"
        PSYCHO = "psycho", "Psychologie financière"
        DISCIPLINE = "discipline", "Discipline financière"

    quiz = models.ForeignKey("assessments.Quiz", on_delete=models.CASCADE, related_name="questions")
    prompt = models.TextField()
    topic = models.CharField(
        max_length=32,
        choices=Topic.choices,
        blank=True,
        help_text="Thème principal évalué par cette question",
    )
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.quiz} — ({self.order})"


class Choice(models.Model):
    question = models.ForeignKey("assessments.Question", on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.question} — ({self.is_correct})"


class Attempt(models.Model):
    quiz = models.ForeignKey("assessments.Quiz", on_delete=models.CASCADE, related_name="attempts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts")

    # CORRECTIF ASS-10 : auto_now_add empêche l'antédatage via endpoint API.
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    score_percent = models.PositiveIntegerField(default=0)
    passed = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["quiz", "user"]),
            models.Index(fields=["user", "submitted_at"]),
        ]
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.user} — {self.quiz.slug} ({self.score_percent})"


class AttemptAnswer(models.Model):
    attempt = models.ForeignKey("assessments.Attempt", on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey("assessments.Question", on_delete=models.CASCADE)
    # CORRECTIF ASS-11 : on retient le texte snapshot pour ne pas perdre la réponse
    # historique si on supprime un Choice (audit recommande PROTECT ou snapshot).
    selected_choice = models.ForeignKey(
        "assessments.Choice", on_delete=models.SET_NULL, null=True, blank=True,
    )
    selected_text_snapshot = models.CharField(max_length=500, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["attempt", "question"],
                name="uniq_attempt_question",
            ),
        ]

    def save(self, *args, **kwargs):
        # Snapshot pour conservation historique de la réponse.
        if self.selected_choice and not self.selected_text_snapshot:
            self.selected_text_snapshot = (self.selected_choice.text or "")[:500]
        super().save(*args, **kwargs)

    def __str__(self):
        if not self.selected_choice:
            return f"Réponse non renseignée — {self.question.prompt[:50]}"
        return f"{self.question.prompt[:50]} → {self.selected_choice.text[:40]}"
