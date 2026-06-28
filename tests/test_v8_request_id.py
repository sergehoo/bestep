"""Tests V8.D — Middleware request-id (V_OBS.B)."""
from __future__ import annotations

import re
import uuid


def test_request_id_middleware_generates_uuid_if_absent(client):
    """Si le client ne passe pas X-Request-ID, on en génère un."""
    resp = client.get("/healthz/")
    rid = resp.get("X-Request-ID", "")
    assert re.match(r"^[0-9a-f-]{36}$", rid), f"X-Request-ID invalide : {rid}"


def test_request_id_middleware_preserves_inbound_header(client):
    """Si le client passe X-Request-ID, on le respecte (utile load balancer)."""
    incoming = str(uuid.uuid4())
    resp = client.get("/healthz/", HTTP_X_REQUEST_ID=incoming)
    assert resp.get("X-Request-ID") == incoming


def test_json_formatter_serializes_request_id_field():
    """Le JsonFormatter doit inclure le champ request_id."""
    import logging

    from core.logging import JsonFormatter, set_request_id

    set_request_id("test-rid-1234")
    fmt = JsonFormatter()
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="x",
        lineno=1,
        msg="hello %s",
        args=("world",),
        exc_info=None,
    )
    record.request_id = "test-rid-1234"

    line = fmt.format(record)
    import json
    data = json.loads(line)
    assert data["message"] == "hello world"
    assert data["request_id"] == "test-rid-1234"
    assert data["level"] == "INFO"

    set_request_id(None)
