from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from .models import ProjectConfig, SecurityLevel

OSTACK_DIR = ".ostack"
CONFIG_FILE = "config.json"


def config_path(root: Path) -> Path:
    return root / OSTACK_DIR / CONFIG_FILE


def initialize_project(root: Path, name: str, provider: str = "ollama") -> ProjectConfig:
    root = root.resolve()
    directory = root / OSTACK_DIR
    directory.mkdir(parents=True, exist_ok=True)
    config = ProjectConfig(name=name, root=root, provider=provider)
    payload: Dict[str, Any] = {
        "schema_version": "1.0",
        "name": config.name,
        "provider": config.provider,
        "model": config.model,
        "security_level": int(config.security_level),
        "metadata": config.metadata,
    }
    config_path(root).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    (directory / "runs").mkdir(exist_ok=True)
    (directory / "knowledge").mkdir(exist_ok=True)
    return config


def load_config(root: Path) -> ProjectConfig:
    path = config_path(root.resolve())
    if not path.exists():
        raise FileNotFoundError("OStack is not initialized. Run `ostack init` first.")
    payload = json.loads(path.read_text(encoding="utf-8"))
    return ProjectConfig(
        name=payload["name"],
        root=root.resolve(),
        provider=payload.get("provider", "ollama"),
        model=payload.get("model"),
        security_level=SecurityLevel(payload.get("security_level", 2)),
        metadata=payload.get("metadata", {}),
    )

