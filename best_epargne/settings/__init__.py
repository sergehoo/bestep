"""
best_epargne/settings/__init__.py

Auto-loader de .env tolérant (pas de dépendance dure à python-dotenv) +
sélecteur dev/prod via DJANGO_ENV.

CORRECTIF (régression observée en prod) :
- ``from dotenv import load_dotenv`` plantait au démarrage si la lib
  ``python-dotenv`` n'était pas installée. On charge maintenant le .env
  via ``python-dotenv`` si présent, sinon via un parser natif minimal,
  sinon on ne fait rien (les variables d'environnement du conteneur
  Docker / systemd unit suffisent en prod).
"""
from __future__ import annotations

import os
from pathlib import Path


def _load_env_file_native(env_path: Path) -> None:
    """
    Parser .env minimal (KEY=VALUE, # commentaires, quotes simples/doubles).
    N'écrase pas les variables déjà définies dans ``os.environ`` —
    conformité avec le comportement par défaut de ``python-dotenv``.
    """
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export "):].lstrip()
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if not key:
                continue
            value = value.strip()
            # Strip quotes (single or double) si entourage complet.
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            os.environ.setdefault(key, value)
    except OSError:
        # Permissions, FS readonly, etc. — on ne casse pas le boot.
        pass


# 1) Tentative via python-dotenv si présent (UX dev classique).
try:
    from dotenv import load_dotenv as _load_dotenv  # type: ignore
    _load_dotenv()
except Exception:
    # 2) Fallback natif : cherche un .env à la racine du projet.
    _BASE_DIR = Path(__file__).resolve().parent.parent.parent
    _load_env_file_native(_BASE_DIR / ".env")


# Sélection dev/prod.
env = os.environ.get("DJANGO_ENV")

if env == "prod":
    print(">>> USING PROD SETTINGS")
    from .prod import *  # noqa: F401,F403,E402
else:
    print(">>> USING DEV SETTINGS")
    from .dev import *  # noqa: F401,F403,E402
