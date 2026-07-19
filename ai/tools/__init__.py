"""ai.tools — Agent outillé (Phase 4).

Chaque outil est une classe qui hérite de ``AbstractAITool`` et
s'enregistre dans ``TOOL_REGISTRY``. Le dispatcher ``run_tool()`` gère :
  - la whitelist (le tool doit être dans le registre),
  - le RBAC (chaque tool déclare ``allowed_roles``),
  - le niveau de confirmation (0 = auto, 1 = simple, 2 = renforcée),
  - la création d'``AIToolExecution`` + éventuellement d'``AIActionApproval``,
  - la journalisation ``AIAuditLog``.

Aucun outil n'écrit en DB directement. Chaque implémentation appelle
les services métier existants (catalog.services, enrollments.services…).
"""
from .base import AbstractAITool, ToolPreview, ToolResult, TOOL_REGISTRY, register
from . import (  # noqa: F401 — enregistre les tools au import
    search_courses,
    analyze_progress,
    create_course_draft,
    generate_full_course,  # BEST-AI T5 — création formation complète en tool use
    add_quiz_to_course,  # BEST-AI T6 — ajouter un quiz à un cours existant
    enroll_learner,
    publish_course,
    deactivate_user,
)
from .dispatcher import (  # noqa: F401
    list_tools_for_user,
    request_execution,
    confirm_execution,
    cancel_execution,
)
