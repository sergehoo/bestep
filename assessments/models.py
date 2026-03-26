from __future__ import annotations

from django.db import models

# Create your models here.
from django.db import models
from django.utils import timezone
from django.conf import settings
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

    passing_score = models.PositiveIntegerField(default=70)
    max_attempts = models.PositiveIntegerField(default=3)

    class Meta:
        ordering = ["title"]

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
        # 🧮 Bases & gestion personnelle
        BUDGET = "budget", "Budget & gestion des dépenses"
        EPARGNE = "epargne", "Épargne & discipline financière"
        OBJECTIFS = "objectifs", "Objectifs financiers"
        FLUX = "flux", "Gestion des flux (revenus / dépenses)"
        HABITUDES = "habitudes", "Habitudes & comportements financiers"

        # 🏦 Banque & produits financiers
        BANQUE = "banque", "Fonctionnement bancaire"
        COMPTE = "compte", "Comptes bancaires"
        TAUX = "taux", "Taux d’intérêt & inflation"
        FRAIS = "frais", "Frais bancaires"
        MOYENS_PAIEMENT = "paiement", "Moyens de paiement"

        # 💳 Crédit & dette
        CREDIT = "credit", "Crédit"
        DETTE = "dette", "Gestion de la dette"
        EMPRUNT = "emprunt", "Emprunt & remboursement"
        TAUX_CREDIT = "taux_credit", "Taux de crédit"
        SUR_ENDETTEMENT = "surendettement", "Surendettement"

        # 📈 Investissement & patrimoine
        INVEST = "investissement", "Investissement"
        PLACEMENT = "placement", "Placements financiers"
        RISQUE = "risque", "Risque & rendement"
        DIVERSIFICATION = "diversification", "Diversification"
        PATRIMOINE = "patrimoine", "Gestion de patrimoine"
        BOURSE = "bourse", "Marchés financiers"
        ACTIONS = "actions", "Actions"
        OBLIGATIONS = "obligations", "Obligations"
        IMMOBILIER = "immobilier", "Investissement immobilier"

        # 🛡️ Sécurité & protection
        ASSURANCE = "assurance", "Assurance & protection"
        EPARGNE_SECURITE = "epargne_securite", "Épargne de sécurité"
        RISQUES_VIE = "risques_vie", "Gestion des risques de la vie"
        PREVOYANCE = "prevoyance", "Prévoyance"

        # 📊 Économie & macro
        MACRO = "macro", "Économie générale"
        INFLATION = "inflation", "Inflation"
        POLITIQUE_MONETAIRE = "politique_monetaire", "Politique monétaire"
        CROISSANCE = "croissance", "Croissance économique"
        CONJONCTURE = "conjoncture", "Conjoncture économique"

        # 🧠 Entrepreneuriat & revenus
        ENTREPRENEURIAT = "entrepreneuriat", "Entrepreneuriat"
        BUSINESS_MODEL = "business_model", "Business model"
        CASHFLOW = "cashflow", "Cash-flow"
        REVENUS = "revenus", "Sources de revenus"
        INVEST_ENTREPRISE = "invest_entreprise", "Investir dans une entreprise"

        # 📚 Culture & stratégie financière
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
        help_text="Thème principal évalué par cette question"
    )
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["order"]
    def __str__(self):
         return f"{self.quiz} —  ({self.order})"

class Choice(models.Model):
    question = models.ForeignKey("assessments.Question", on_delete=models.CASCADE, related_name="choices")
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    def __str__(self):
        return f"{self.question} —  ({self.is_correct})"

class Attempt(models.Model):
    quiz = models.ForeignKey("assessments.Quiz", on_delete=models.CASCADE, related_name="attempts")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts")

    started_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, blank=True)

    score_percent = models.PositiveIntegerField(default=0)
    passed = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user} — {self.quiz.slug} ({self.score_percent})"


class AttemptAnswer(models.Model):
    attempt = models.ForeignKey("assessments.Attempt", on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey("assessments.Question", on_delete=models.CASCADE)
    selected_choice = models.ForeignKey("assessments.Choice", on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        if not self.selected_choice:
            return f"Réponse non renseignée — {self.question.prompt[:50]}"
        return f"{self.question.prompt[:50]} → {self.selected_choice.text[:40]}"