"""Tool : analyze_progress — analyse la progression d'un apprenant (L0).

- Un apprenant peut analyser SA propre progression uniquement.
- Un instructor peut analyser un apprenant de ses cours.
- Un admin peut analyser n'importe qui.

Retourne des KPIs : cours en cours, complétés, temps d'apprentissage,
dernier accès, cours à risque d'abandon.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.utils import timezone

from .base import AbstractAITool, ToolResult, register


User = get_user_model()


@register
class AnalyzeProgressTool(AbstractAITool):
    key = "analyze_progress"
    title = "Analyser une progression"
    description = "Résume la progression d'un apprenant (cours actifs, complétés, risque d'abandon)."
    allowed_roles = ["learner", "instructor", "platform_admin"]
    confirmation_level = 0
    params_schema = {
        "user_id": {
            "type": "integer",
            "required": False,
            "description": "ID cible. Si absent, analyse l'utilisateur courant.",
        }
    }

    def run(self, user, params: dict) -> ToolResult:
        target_id = params.get("user_id") or user.id
        try:
            target = User.objects.get(pk=target_id)
        except User.DoesNotExist:
            return ToolResult(ok=False, detail="Utilisateur cible introuvable.")

        # RBAC : learner ne peut voir que sa propre progression.
        if target.id != user.id and not (
            getattr(user, "is_platform_admin", False)
            or getattr(user, "is_instructor", False)
        ):
            return ToolResult(ok=False, detail="Vous ne pouvez analyser que votre progression.")

        try:
            from enrollments.models import Enrollment

            qs = Enrollment.objects.filter(user=target)
            total = qs.count()
            completed = qs.filter(status="COMPLETED").count()
            active = qs.filter(status="ACTIVE").count()
            dropped = qs.filter(status__in=["DROPPED", "CANCELLED"]).count()

            # "À risque" : ACTIVE + last_activity_at > 30 jours OU pas de progression
            risky_ids = []
            thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
            for e in qs.filter(status="ACTIVE").select_related("course")[:100]:
                last = getattr(e, "last_activity_at", None) or getattr(e, "updated_at", None)
                if last and last < thirty_days_ago:
                    risky_ids.append(
                        {"course_id": getattr(e, "course_id", None), "last_activity": last.isoformat()}
                    )
        except Exception as exc:  # noqa: BLE001
            return ToolResult(ok=False, detail=f"Erreur d'accès enrollments : {exc}")

        completion_rate = round((completed / total * 100.0), 1) if total else 0
        return ToolResult(
            ok=True,
            detail=(
                f"{target.email} — {active} actif(s), {completed} complété(s), "
                f"{dropped} abandonné(s). Taux de complétion : {completion_rate}%. "
                f"{len(risky_ids)} cours à risque d'abandon."
            ),
            data={
                "user_id": target.id,
                "email": target.email,
                "total": total,
                "active": active,
                "completed": completed,
                "dropped": dropped,
                "completion_rate": completion_rate,
                "at_risk": risky_ids,
            },
        )
