"""ai.models — modèles fondamentaux du module IA (Phase 1).

Design :
- Multi-organisation : chaque conversation/message/usage porte une
  ``organization`` (nullable pour les acteurs plateforme).
- Historique et audit strictement séparés : ``AIMessage`` = ce que voit
  l'utilisateur ; ``AIAuditLog`` = tout appel réel au provider avec
  tokens/coût/latence, jamais purgé même si la conversation est
  supprimée.
- Provider abstraction : ``AIProvider`` (dev/staging/prod) contient
  les credentials chiffrés côté déploiement ; ``AIModel`` référence
  le "modèle logique" (ex: "chat-fast", "chat-advanced", "embedding")
  utilisé par le routeur.
- Prêt pour phases 2-6 : les modèles complémentaires (KnowledgeSpace,
  ToolExecution, ActionApproval, Recommendation…) viendront s'ajouter
  sans casser ceux-ci.
"""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


# ─────────────────────────────────────────────────────────────
# Provider / Model (config technique — édité par super admin)
# ─────────────────────────────────────────────────────────────


class AIProvider(models.Model):
    """Fournisseur IA configurable (OpenAI, Anthropic, Azure, Ollama, etc.).

    La clé API est stockée en clair pour l'instant (à chiffrer via
    django-encrypted-fields ou vault en Phase 6). Le champ ``kind``
    détermine le driver Python instancié par la couche providers.
    """

    class Kind(models.TextChoices):
        OPENAI = "openai", "OpenAI-compatible"  # OpenAI + Azure + Ollama + DeepSeek + Mistral (chat completions)
        ANTHROPIC = "anthropic", "Anthropic Claude"
        GEMINI = "gemini", "Google Gemini"
        STUB = "stub", "Stub (dev/tests)"

    name = models.CharField(max_length=80, unique=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.STUB)
    base_url = models.URLField(blank=True, default="")
    api_key = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    priority = models.PositiveSmallIntegerField(
        default=100,
        help_text="Ordre du routeur : plus bas = plus prioritaire dans les fallbacks.",
    )
    timeout_seconds = models.PositiveSmallIntegerField(default=60)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "id"]
        verbose_name = "Fournisseur IA"
        verbose_name_plural = "Fournisseurs IA"

    def __str__(self) -> str:
        return f"{self.name} ({self.get_kind_display()})"


class AIModel(models.Model):
    """Modèle logique routé par le routeur IA.

    Un ``AIModel`` = un couple (provider, model_name) associé à un
    "rôle" métier : chat rapide, chat avancé, génération d'images,
    embeddings… Le routeur choisit selon la tâche demandée par le
    front (``purpose``).
    """

    class Purpose(models.TextChoices):
        CHAT_FAST = "chat_fast", "Chat rapide"
        CHAT_ADVANCED = "chat_advanced", "Chat avancé (génération)"
        ANALYSIS = "analysis", "Analyse structurée"
        IMAGE = "image", "Génération d'image"
        EMBEDDING = "embedding", "Embeddings (RAG)"

    provider = models.ForeignKey(
        AIProvider, on_delete=models.CASCADE, related_name="models"
    )
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    model_name = models.CharField(
        max_length=120,
        help_text="Identifiant côté provider (ex: 'gpt-4o-mini', 'claude-sonnet-4-6').",
    )
    max_tokens = models.PositiveIntegerField(default=4096)
    temperature = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal("0.30")
    )
    cost_input_per_1k = models.DecimalField(
        max_digits=10, decimal_places=6, default=Decimal("0")
    )
    cost_output_per_1k = models.DecimalField(
        max_digits=10, decimal_places=6, default=Decimal("0")
    )
    is_default = models.BooleanField(
        default=False,
        help_text="Si vrai, ce modèle est choisi par défaut pour son purpose.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["purpose", "-is_default", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "purpose", "model_name"],
                name="ai_model_unique_provider_purpose_name",
            )
        ]
        verbose_name = "Modèle IA"
        verbose_name_plural = "Modèles IA"

    def __str__(self) -> str:
        return f"{self.provider.name} / {self.model_name} [{self.get_purpose_display()}]"


# ─────────────────────────────────────────────────────────────
# Conversations (user-facing)
# ─────────────────────────────────────────────────────────────


class AIConversation(models.Model):
    """Une conversation utilisateur avec l'assistant."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_conversations",
    )
    # Multi-org : nullable pour les acteurs plateforme sans org
    organization_id = models.PositiveIntegerField(
        null=True, blank=True, db_index=True
    )
    title = models.CharField(max_length=200, default="Nouvelle conversation")
    # Contexte "sticky" : rôle initial, dernière route visitée…
    context = models.JSONField(default=dict, blank=True)
    # Modèle par défaut de la conversation (peut varier par message)
    default_purpose = models.CharField(
        max_length=20,
        choices=AIModel.Purpose.choices,
        default=AIModel.Purpose.CHAT_FAST,
    )
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    last_message_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-last_message_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-last_message_at"]),
            models.Index(fields=["organization_id", "-last_message_at"]),
        ]
        verbose_name = "Conversation IA"
        verbose_name_plural = "Conversations IA"

    def __str__(self) -> str:
        return f"AIConversation({self.pk}, user={self.user_id})"

    def touch(self, save: bool = True) -> None:
        self.last_message_at = timezone.now()
        if save:
            self.save(update_fields=["last_message_at", "updated_at"])


class AIMessage(models.Model):
    """Un message dans une conversation."""

    class Role(models.TextChoices):
        USER = "user", "Utilisateur"
        ASSISTANT = "assistant", "Assistant"
        SYSTEM = "system", "Système"
        TOOL = "tool", "Outil"

    conversation = models.ForeignKey(
        AIConversation, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=15, choices=Role.choices)
    content = models.TextField(blank=True, default="")
    # Bloc extensible (attachments, tool_calls, sources, feedback…)
    metadata = models.JSONField(default=dict, blank=True)
    # Contexte de la page au moment du message (route, entity_type, entity_id…)
    page_context = models.JSONField(default=dict, blank=True)
    # Tokens & modèle (nullable pour user messages)
    model_used = models.CharField(max_length=120, blank=True, default="")
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    # Feedback utilisateur (+1 / -1)
    feedback_score = models.SmallIntegerField(default=0)
    feedback_note = models.CharField(max_length=280, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["created_at", "id"]
        indexes = [models.Index(fields=["conversation", "created_at"])]
        verbose_name = "Message IA"
        verbose_name_plural = "Messages IA"

    def __str__(self) -> str:
        return f"AIMessage({self.pk}, role={self.role})"


# ─────────────────────────────────────────────────────────────
# Usage tracking + audit
# ─────────────────────────────────────────────────────────────


class AIUsageRecord(models.Model):
    """Un appel provider = une ligne d'usage (quotas, coûts, rapports)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    organization_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    conversation = models.ForeignKey(
        AIConversation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="usage_records",
    )
    provider = models.CharField(max_length=40)
    model_name = models.CharField(max_length=120)
    purpose = models.CharField(max_length=20)
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=Decimal("0"))
    latency_ms = models.PositiveIntegerField(default=0)
    ok = models.BooleanField(default=True)
    error_type = models.CharField(max_length=80, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["organization_id", "-created_at"]),
        ]
        verbose_name = "Enregistrement d'usage IA"
        verbose_name_plural = "Enregistrements d'usage IA"


class AICourseGeneration(models.Model):
    """Persistance d'une session de génération de cours par l'IA (Phase 2).

    L'assistant de génération fonctionne en 6 étapes. Chaque étape
    remplit un champ JSON dédié pour permettre :
      - la reprise après refresh de page,
      - la régénération partielle,
      - l'audit et le versioning côté frontend,
      - la finalisation atomique vers ``catalog.Course``.

    Le champ ``status`` sert de machine d'état simple :
        DRAFT → PLAN_READY → CONTENT_READY → QUIZ_READY → FINALIZED
    ``FAILED`` reste possible à tout moment.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Brouillon"
        PLAN_READY = "PLAN_READY", "Plan prêt"
        CONTENT_READY = "CONTENT_READY", "Contenu prêt"
        QUIZ_READY = "QUIZ_READY", "Quiz prêt"
        FINALIZED = "FINALIZED", "Publié dans le catalogue"
        FAILED = "FAILED", "Échec"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_course_generations",
    )
    organization_id = models.PositiveIntegerField(
        null=True, blank=True, db_index=True
    )

    # Étape 1 — instruction utilisateur + paramètres (voir services)
    brief = models.JSONField(default=dict, blank=True)
    # Étape 2 — plan structuré : {title, subtitle, description, sections: [...]}
    plan = models.JSONField(default=dict, blank=True)
    # Étape 3 — contenu par leçon : {lessons: {<section_idx>-<lesson_idx>: {...}}}
    lessons_content = models.JSONField(default=dict, blank=True)
    # Étape 4 — quiz par section : {quizzes: {<section_idx>: [questions...]}}
    quizzes = models.JSONField(default=dict, blank=True)
    # Étape 5 — recommandation certification : {mode, justification, score_min…}
    certification = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    error_detail = models.TextField(blank=True, default="")

    # Résultat de finalisation → cours réel créé
    finalized_course_id = models.PositiveIntegerField(null=True, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-updated_at"]),
            models.Index(fields=["status"]),
        ]
        verbose_name = "Génération de cours IA"
        verbose_name_plural = "Générations de cours IA"

    def __str__(self) -> str:
        title = (self.plan or {}).get("title") if isinstance(self.plan, dict) else ""
        return f"AICourseGeneration({self.pk}, {self.status}, {title or 'sans titre'})"


class AIRecommendation(models.Model):
    """Recommandation IA d'un cours à un apprenant (Phase 3).

    Un enregistrement par (user, course, category, generated_at). Le
    calcul est fait à la volée par le service ``recommendations.py``,
    mais persisté pour :
      - éviter de répéter la même reco au même utilisateur,
      - traquer le feedback dans le temps (améliore les recos futures),
      - présenter des KPI dans le centre admin (Phase 6).
    """

    class Category(models.TextChoices):
        FOR_YOU = "for_you", "Recommandé pour vous"
        CONTINUE = "continue", "Poursuivre votre parcours"
        STRENGTHEN = "strengthen", "Renforcer vos compétences"
        DISCOVER = "discover", "Découvrir un nouveau domaine"
        POPULAR = "popular", "Formations populaires"
        CERTIFYING = "certifying", "Formations certifiantes"
        SHORT = "short", "Formations courtes"
        PATH = "path", "Parcours personnalisé"

    class Feedback(models.TextChoices):
        NONE = "none", "Pas de retour"
        INTERESTED = "interested", "Intéressé"
        NOT_INTERESTED = "not_interested", "Pas intéressé"
        ALREADY_KNOWN = "already_known", "Déjà maîtrisé"
        TOO_EASY = "too_easy", "Trop facile"
        TOO_HARD = "too_hard", "Trop difficile"
        LATER = "later", "À voir plus tard"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_recommendations",
    )
    organization_id = models.PositiveIntegerField(
        null=True, blank=True, db_index=True
    )
    course_id = models.PositiveIntegerField()
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.FOR_YOU
    )
    reason = models.CharField(max_length=280, blank=True, default="")
    match_score = models.PositiveSmallIntegerField(default=50)  # 0-100

    feedback = models.CharField(
        max_length=20, choices=Feedback.choices, default=Feedback.NONE
    )
    feedback_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["user", "category"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "course_id", "category"],
                name="ai_reco_unique_user_course_category",
            ),
        ]
        verbose_name = "Recommandation IA"
        verbose_name_plural = "Recommandations IA"

    def __str__(self) -> str:
        return f"AIReco(user={self.user_id}, course={self.course_id}, {self.category})"


class AIToolExecution(models.Model):
    """Journal des exécutions d'outils IA (Phase 4).

    Chaque appel de tool = une ligne, complète (input + output + statut).
    Utilisée pour l'audit et pour éviter les rejeu incorrects.
    """

    class Status(models.TextChoices):
        PENDING_APPROVAL = "PENDING_APPROVAL", "En attente d'approbation"
        RUNNING = "RUNNING", "En cours"
        SUCCESS = "SUCCESS", "Succès"
        FAILED = "FAILED", "Échec"
        CANCELLED = "CANCELLED", "Annulé"
        DENIED = "DENIED", "Refusé"

    tool_key = models.CharField(max_length=80, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    organization_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    conversation = models.ForeignKey(
        AIConversation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tool_executions",
    )
    input_payload = models.JSONField(default=dict, blank=True)
    output_payload = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING_APPROVAL,
    )
    error_detail = models.TextField(blank=True, default="")
    latency_ms = models.PositiveIntegerField(default=0)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["tool_key", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]
        verbose_name = "Exécution d'outil IA"
        verbose_name_plural = "Exécutions d'outil IA"

    def __str__(self) -> str:
        return f"AIToolExec({self.tool_key}, {self.status})"


class AIActionApproval(models.Model):
    """Approbation d'une action sensible (Phase 4).

    Créée automatiquement quand un tool avec ``confirmation_level >= 1``
    est appelé. L'utilisateur voit un aperçu (impact + éléments
    concernés + permissions utilisées) puis confirme ou annule.
    """

    class Level(models.IntegerChoices):
        NONE = 0, "Sans confirmation"
        SIMPLE = 1, "Confirmation simple"
        REINFORCED = 2, "Confirmation renforcée"

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        CONFIRMED = "CONFIRMED", "Confirmée"
        CANCELLED = "CANCELLED", "Annulée"
        EXPIRED = "EXPIRED", "Expirée"

    tool_key = models.CharField(max_length=80)
    execution = models.OneToOneField(
        AIToolExecution,
        on_delete=models.CASCADE,
        related_name="approval",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="+",
    )
    level = models.PositiveSmallIntegerField(
        choices=Level.choices, default=Level.SIMPLE
    )
    status = models.CharField(
        max_length=15, choices=Status.choices, default=Status.PENDING
    )

    # Aperçu montré à l'utilisateur avant confirmation
    summary = models.CharField(max_length=280, blank=True, default="")
    impact = models.TextField(blank=True, default="")
    affected_items = models.JSONField(default=list, blank=True)
    permissions_used = models.JSONField(default=list, blank=True)

    input_payload = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]
        verbose_name = "Approbation d'action IA"
        verbose_name_plural = "Approbations d'action IA"

    def __str__(self) -> str:
        return f"AIApproval({self.tool_key}, L{self.level}, {self.status})"


class AIKnowledgeSpace(models.Model):
    """Espace de connaissance (Phase 5).

    Segmente la KB par scope pour appliquer le RBAC :
      - GLOBAL     : visible par tous
      - ORG        : lié à une organisation
      - COURSE     : lié à un cours (formateur / apprenants inscrits)
      - INSTRUCTOR : privé formateur
      - PRIVATE    : privé utilisateur
      - ADMIN      : réservé aux platform_admins
    """

    class Scope(models.TextChoices):
        GLOBAL = "GLOBAL", "Globale"
        ORG = "ORG", "Par organisation"
        COURSE = "COURSE", "Par cours"
        INSTRUCTOR = "INSTRUCTOR", "Formateur"
        PRIVATE = "PRIVATE", "Privé utilisateur"
        ADMIN = "ADMIN", "Admin plateforme"

    name = models.CharField(max_length=140)
    scope = models.CharField(max_length=15, choices=Scope.choices, default=Scope.GLOBAL)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="ai_knowledge_spaces",
    )
    organization_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    course_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    description = models.CharField(max_length=280, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scope", "name"]
        indexes = [models.Index(fields=["scope"])]
        verbose_name = "Espace de connaissance IA"
        verbose_name_plural = "Espaces de connaissance IA"

    def __str__(self) -> str:
        return f"KBSpace({self.scope}:{self.name})"


class AIKnowledgeDocument(models.Model):
    """Document indexé dans un espace."""

    class DocType(models.TextChoices):
        TEXT = "TEXT", "Texte brut"
        MARKDOWN = "MARKDOWN", "Markdown"
        HTML = "HTML", "HTML"
        PDF = "PDF", "PDF"
        DOCX = "DOCX", "Word"
        COURSE = "COURSE", "Cours plateforme"
        LESSON = "LESSON", "Leçon plateforme"
        FAQ = "FAQ", "FAQ"
        POLICY = "POLICY", "Politique"

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        INDEXING = "INDEXING", "Indexation en cours"
        INDEXED = "INDEXED", "Indexé"
        FAILED = "FAILED", "Échec"

    space = models.ForeignKey(
        AIKnowledgeSpace,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    title = models.CharField(max_length=240)
    source_url = models.URLField(blank=True, default="")
    doc_type = models.CharField(max_length=20, choices=DocType.choices, default=DocType.MARKDOWN)
    language = models.CharField(max_length=10, default="fr")
    version = models.PositiveIntegerField(default=1)
    content = models.TextField(blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    error_detail = models.TextField(blank=True, default="")
    chunks_count = models.PositiveIntegerField(default=0)
    embedding_dim = models.PositiveSmallIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    indexed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        indexes = [
            models.Index(fields=["space", "-updated_at"]),
            models.Index(fields=["status"]),
        ]
        verbose_name = "Document KB IA"
        verbose_name_plural = "Documents KB IA"

    def __str__(self) -> str:
        return f"KBDoc({self.id}, {self.title[:40]})"


class AIKnowledgeChunk(models.Model):
    """Un fragment d'un document + son embedding.

    Le vecteur est stocké en JSONField (list[float]) pour rester portable.
    La production peut migrer vers pgvector plus tard sans casser le
    contrat côté services/retrieval (indexation via JSONB en dev, index
    ivfflat en prod avec pgvector).
    """

    document = models.ForeignKey(
        AIKnowledgeDocument,
        on_delete=models.CASCADE,
        related_name="chunks",
    )
    idx = models.PositiveIntegerField(default=0)
    text = models.TextField()
    embedding = models.JSONField(default=list, blank=True)
    tokens = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["document", "idx"]
        indexes = [
            models.Index(fields=["document", "idx"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "idx"],
                name="ai_kbchunk_unique_doc_idx",
            ),
        ]
        verbose_name = "Chunk KB IA"
        verbose_name_plural = "Chunks KB IA"


class AIWebSearch(models.Model):
    """Journal des recherches Internet (Phase 5)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    query = models.CharField(max_length=500)
    provider = models.CharField(max_length=40, default="stub")
    results_count = models.PositiveIntegerField(default=0)
    domains = models.JSONField(default=list, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    ok = models.BooleanField(default=True)
    error_detail = models.TextField(blank=True, default="")
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]
        verbose_name = "Recherche web IA"
        verbose_name_plural = "Recherches web IA"


class AIQuota(models.Model):
    """Quota d'usage IA (Phase 6).

    Un enregistrement = une politique de plafond appliquée à une cible
    (user, org, role, global) sur une période. Les compteurs sont
    évalués à la volée depuis ``AIUsageRecord`` — le modèle stocke
    uniquement la config (limites + méta), pas les compteurs eux-mêmes.
    """

    class TargetType(models.TextChoices):
        GLOBAL = "GLOBAL", "Global (toute la plateforme)"
        ROLE = "ROLE", "Par rôle"
        USER = "USER", "Utilisateur spécifique"
        ORG = "ORG", "Organisation"

    class Period(models.TextChoices):
        DAILY = "DAILY", "Journalier"
        MONTHLY = "MONTHLY", "Mensuel"

    target_type = models.CharField(
        max_length=10, choices=TargetType.choices, default=TargetType.GLOBAL
    )
    target_role = models.CharField(
        max_length=30,
        blank=True,
        default="",
        help_text="Ex: 'learner', 'instructor', 'platform_admin' (si target_type=ROLE)",
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="+",
    )
    target_org_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)

    period = models.CharField(max_length=10, choices=Period.choices, default=Period.MONTHLY)

    max_calls = models.PositiveIntegerField(default=0)  # 0 = illimité
    max_input_tokens = models.PositiveIntegerField(default=0)
    max_output_tokens = models.PositiveIntegerField(default=0)
    max_cost_usd = models.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal("0")
    )

    is_active = models.BooleanField(default=True)
    note = models.CharField(max_length=280, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["target_type", "target_role", "id"]
        indexes = [
            models.Index(fields=["target_type", "is_active"]),
            models.Index(fields=["target_org_id"]),
        ]
        verbose_name = "Quota IA"
        verbose_name_plural = "Quotas IA"

    def __str__(self) -> str:
        return f"AIQuota({self.target_type}:{self.target_role or self.target_user_id or self.target_org_id or '*'}, {self.period})"


class AIImageGeneration(models.Model):
    """Génération d'image (Phase 6)."""

    class Status(models.TextChoices):
        PENDING = "PENDING", "En attente"
        RUNNING = "RUNNING", "En cours"
        SUCCESS = "SUCCESS", "Succès"
        FAILED = "FAILED", "Échec"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_image_generations",
    )
    organization_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    prompt = models.TextField()
    style = models.CharField(max_length=60, blank=True, default="")
    aspect_ratio = models.CharField(max_length=10, blank=True, default="1:1")
    width = models.PositiveSmallIntegerField(default=1024)
    height = models.PositiveSmallIntegerField(default=1024)
    provider = models.CharField(max_length=40, default="stub")
    model_used = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    urls = models.JSONField(default=list, blank=True)  # liste d'URLs générées
    metadata = models.JSONField(default=dict, blank=True)
    course_id = models.PositiveIntegerField(null=True, blank=True)
    lesson_id = models.PositiveIntegerField(null=True, blank=True)
    cost_usd = models.DecimalField(max_digits=8, decimal_places=4, default=Decimal("0"))
    error_detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["status"]),
        ]
        verbose_name = "Génération d'image IA"
        verbose_name_plural = "Générations d'image IA"


class AIContentVersion(models.Model):
    """Snapshot d'une version de contenu généré par l'IA (Phase 6).

    Utilisé pour :
      - montrer la timeline des versions générées d'un cours/leçon,
      - comparer deux versions,
      - restaurer une version antérieure,
      - distinguer les modifications IA des modifications humaines.
    """

    class EntityType(models.TextChoices):
        COURSE = "COURSE", "Cours"
        SECTION = "SECTION", "Section"
        LESSON = "LESSON", "Leçon"

    class Origin(models.TextChoices):
        AI = "AI", "IA (générateur/agent)"
        HUMAN = "HUMAN", "Humain"
        MIXED = "MIXED", "Édité par un humain à partir d'un contenu IA"

    entity_type = models.CharField(max_length=10, choices=EntityType.choices)
    entity_id = models.PositiveIntegerField(db_index=True)
    version = models.PositiveIntegerField(default=1)
    origin = models.CharField(max_length=10, choices=Origin.choices, default=Origin.AI)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    payload = models.JSONField(default=dict, blank=True)  # snapshot des champs pertinents
    diff_summary = models.CharField(max_length=280, blank=True, default="")
    generation_id = models.PositiveIntegerField(null=True, blank=True)  # ref AICourseGeneration
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["entity_type", "entity_id", "-created_at"]),
            models.Index(fields=["origin"]),
        ]
        verbose_name = "Version contenu IA"
        verbose_name_plural = "Versions contenu IA"

    def __str__(self) -> str:
        return f"AIVersion({self.entity_type}#{self.entity_id}, v{self.version})"


class AIAuditLog(models.Model):
    """Journal d'activité — jamais purgé même si la conversation est supprimée.

    Trace toutes les actions "sensibles" : appels provider, exécutions
    d'outils, approbations, exports de conversation, etc. Utilisé par
    la Phase 6 pour la page d'audit.
    """

    class Kind(models.TextChoices):
        PROVIDER_CALL = "provider_call", "Appel fournisseur"
        CONVERSATION_CREATED = "conversation_created", "Conversation créée"
        CONVERSATION_DELETED = "conversation_deleted", "Conversation supprimée"
        TOOL_EXECUTION = "tool_execution", "Exécution d'outil"
        ACTION_APPROVAL = "action_approval", "Approbation d'action"
        WEB_SEARCH = "web_search", "Recherche web"
        FEEDBACK_SUBMITTED = "feedback_submitted", "Feedback soumis"
        EXPORT_CONVERSATION = "export_conversation", "Export de conversation"
        COURSE_GEN_START = "course_gen_start", "Génération de cours démarrée"
        COURSE_GEN_STEP = "course_gen_step", "Étape de génération de cours"
        COURSE_GEN_FINALIZE = "course_gen_finalize", "Finalisation cours IA"
        TEXT_TRANSFORM = "text_transform", "Transformation de texte IA"
        RECO_GENERATED = "reco_generated", "Recommandations générées"
        RECO_FEEDBACK = "reco_feedback", "Feedback recommandation"
        KB_DOCUMENT_INDEXED = "kb_document_indexed", "Document KB indexé"
        KB_SEARCH = "kb_search", "Recherche KB"
        QUOTA_EXCEEDED = "quota_exceeded", "Quota dépassé"
        IMAGE_GEN = "image_gen", "Génération d'image"
        CONTENT_VERSION = "content_version", "Nouvelle version contenu"
        PROVIDER_TEST = "provider_test", "Test de connexion provider"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    organization_id = models.PositiveIntegerField(null=True, blank=True, db_index=True)
    conversation_id_snapshot = models.PositiveIntegerField(null=True, blank=True)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    payload = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    ok = models.BooleanField(default=True)
    error_type = models.CharField(max_length=80, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["-created_at"]), models.Index(fields=["kind"])]
        verbose_name = "Journal IA"
        verbose_name_plural = "Journaux IA"
