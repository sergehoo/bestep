"""core/cache.py — Helpers de cache pour les KPIs dashboards.

CORRECTIFS V4.A (audit ORG-11, FORMATIONS-30/32/45).

Avant : chaque dashboard (org, platform admin, instructor) effectue 25-30
requêtes SQL sans cache à chaque hit, écroulant la DB sous charge.

Après : un service centralisé qui :
- expose des décorateurs ``cached_kpi`` pour mémoïser un calcul,
- expose des helpers ``invalidate_org_dashboard`` /
  ``invalidate_platform_dashboard`` pour invalider depuis les signaux,
- utilise un namespace versionné (pas de risque de pollution entre
  releases).

Convention de clé :
    ``kpi:v{VERSION}:{scope}:{identifier}``

Incrémentez ``KPI_CACHE_VERSION`` pour invalider tout le cache (déploiement
qui modifie la structure des KPIs).
"""
from __future__ import annotations

import functools
import hashlib
import logging
from collections.abc import Callable, Iterable

from django.core.cache import cache

logger = logging.getLogger(__name__)

# Bump cette constante quand la structure des KPIs change (refactor majeur).
KPI_CACHE_VERSION = 1

# TTL par défaut : 60 secondes. Compromis fraîcheur ↔ charge DB.
DEFAULT_KPI_TTL = 60


def _make_key(scope: str, *parts) -> str:
    parts_str = ":".join(str(p) for p in parts if p is not None)
    if not parts_str:
        return f"kpi:v{KPI_CACHE_VERSION}:{scope}"
    # On hash si la clé devient longue pour respecter le max Redis (250 chars).
    if len(parts_str) > 180:
        parts_str = hashlib.sha256(parts_str.encode()).hexdigest()[:32]
    return f"kpi:v{KPI_CACHE_VERSION}:{scope}:{parts_str}"


def cached_kpi(
    scope: str,
    *,
    ttl: int = DEFAULT_KPI_TTL,
    key_args: Iterable[str] | None = None,
):
    """Décorateur : cache le retour d'une fonction de calcul KPI.

    Args:
        scope: prefix logique (``"org_dashboard"``, ``"platform_dashboard"``...).
        ttl: durée de cache en secondes.
        key_args: noms des kwargs de la fonction à inclure dans la clé.
            Si None, on hash tous les args/kwargs.

    Exemple :
        @cached_kpi("org_dashboard", ttl=30, key_args=["organization_id"])
        def get_organization_dashboard_kpis(*, organization_id: int) -> dict: ...
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if key_args is not None:
                key_parts = tuple(kwargs.get(name) for name in key_args)
            else:
                key_parts = args + tuple(sorted(kwargs.items()))
            key = _make_key(scope, *key_parts)
            data = cache.get(key)
            if data is not None:
                return data
            data = func(*args, **kwargs)
            try:
                cache.set(key, data, timeout=ttl)
            except Exception as exc:
                logger.warning("kpi.cache.set_failed", extra={"scope": scope, "exc": str(exc)})
            return data
        wrapper.__wrapped__ = func
        wrapper.cache_scope = scope
        return wrapper
    return decorator


def invalidate_kpi(scope: str, *parts) -> None:
    """Supprime une entrée de cache spécifique."""
    cache.delete(_make_key(scope, *parts))


def invalidate_org_dashboard(organization_id: int) -> None:
    """À appeler depuis les signaux post_save Course/Enrollment/Membership
    pour invalider le dashboard org. Idempotent et sûr."""
    invalidate_kpi("org_dashboard", organization_id)


def invalidate_platform_dashboard() -> None:
    """À appeler depuis les signaux post_save Organization/User/Course pour
    invalider le dashboard plateforme (clé sans param)."""
    invalidate_kpi("platform_dashboard")


def invalidate_instructor_dashboard(user_id: int) -> None:
    invalidate_kpi("instructor_dashboard", user_id)
