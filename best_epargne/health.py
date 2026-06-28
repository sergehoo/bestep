"""best_epargne/health.py — Endpoint de santé applicative.

CORRECTIF P2/P3 (audit INFRA-02, INFRA-03).

GET /healthz/ : vérifie que :
- Django démarre,
- la connexion DB est ouvrable,
- (optionnel) Redis répond.

Retourne 200 si tout est OK, 503 sinon. Conçu pour Traefik / Kubernetes liveness.
"""
from __future__ import annotations

import logging

from django.db import connection
from django.http import JsonResponse

logger = logging.getLogger(__name__)


def healthz(_request):
    payload = {"status": "ok", "checks": {}}
    failures = []

    # 1. DB
    try:
        connection.ensure_connection()
        with connection.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        payload["checks"]["database"] = "ok"
    except Exception as exc:
        payload["checks"]["database"] = f"error: {exc}"
        failures.append("database")
        logger.warning("healthz.db.failed", extra={"exc": str(exc)})

    # 2. Cache (optionnel — ne fail pas le healthz si Redis indispo en dev).
    try:
        from django.core.cache import cache
        cache.set("__healthz_probe__", "1", timeout=5)
        if cache.get("__healthz_probe__") == "1":
            payload["checks"]["cache"] = "ok"
        else:
            payload["checks"]["cache"] = "degraded"
    except Exception as exc:
        payload["checks"]["cache"] = f"error: {exc}"

    if failures:
        payload["status"] = "error"
        return JsonResponse(payload, status=503)
    return JsonResponse(payload, status=200)


def readyz(_request):
    """Readiness probe — peut être différenciée de liveness selon vos besoins."""
    return healthz(_request)
