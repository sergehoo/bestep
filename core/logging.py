"""core/logging.py — JSON formatter + request-id middleware (V_OBS.B).

CORRECTIFS audit INFRA-12, INFRA-13 :

Avant : logs texte plat sans corrélation request/celery → impossible de
suivre une requête à travers les workers asynchrones.

Après :
- ``RequestIdMiddleware`` : génère/propage un X-Request-ID (UUID4) en
  attribut ``request.id``, le pose en thread-local, et le renvoie en
  header de réponse. Si le client envoie déjà X-Request-ID, on le respecte
  (utile pour corréler avec un load balancer).
- ``JsonFormatter`` : produit du JSON ligne par ligne (compatible Loki /
  ELK / Datadog).
- ``RequestIdFilter`` : injecte ``request_id`` dans tous les logs émis
  pendant une requête HTTP.

Pour brancher (settings/base.py LOGGING) :

    "filters": {"request_id": {"()": "core.logging.RequestIdFilter"}},
    "formatters": {"json": {"()": "core.logging.JsonFormatter"}},
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
            "filters": ["request_id"],
        },
    },

Pour brancher (MIDDLEWARE) — en TOUT premier après SecurityMiddleware :

    "core.logging.RequestIdMiddleware",
"""
from __future__ import annotations

import json
import logging
import threading
import uuid

_request_id_local = threading.local()


def get_request_id() -> str | None:
    """Récupère le request_id du thread courant (None si hors requête)."""
    return getattr(_request_id_local, "id", None)


def set_request_id(request_id: str | None) -> None:
    _request_id_local.id = request_id


class RequestIdFilter(logging.Filter):
    """Filtre qui injecte ``request_id`` dans chaque LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True


class JsonFormatter(logging.Formatter):
    """Formatter JSON minimaliste (sans dépendance pythonjsonlogger).

    Champs émis : ts, level, logger, message, request_id, plus tout ce
    qui est passé via ``extra={...}`` dans le code applicatif.
    """

    _BUILTIN_ATTRS = {
        "name", "msg", "args", "levelname", "levelno", "pathname",
        "filename", "module", "exc_info", "exc_text", "stack_info",
        "lineno", "funcName", "created", "msecs", "relativeCreated",
        "thread", "threadName", "processName", "process", "message",
        "asctime", "request_id",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        # Ajoute les `extra={...}` arbitraires (qui finissent en attributs).
        for k, v in record.__dict__.items():
            if k in self._BUILTIN_ATTRS:
                continue
            try:
                json.dumps(v)
                payload[k] = v
            except (TypeError, ValueError):
                payload[k] = repr(v)
        return json.dumps(payload, ensure_ascii=False)


class RequestIdMiddleware:
    """Middleware Django : pose ``request.id`` (UUID4 ou X-Request-ID amont)
    et l'expose en attribut + en header de réponse."""

    HEADER = "HTTP_X_REQUEST_ID"
    RESPONSE_HEADER = "X-Request-ID"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rid = request.META.get(self.HEADER) or str(uuid.uuid4())
        request.id = rid
        set_request_id(rid)
        try:
            response = self.get_response(request)
        finally:
            # On nettoie le thread-local pour les pools de threads gthread.
            set_request_id(None)
        response[self.RESPONSE_HEADER] = rid
        return response
