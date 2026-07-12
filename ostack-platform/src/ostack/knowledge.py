from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


@dataclass(frozen=True)
class KnowledgeDocument:
    path: str
    kind: str
    digest: str
    size: int


class KnowledgeScanner:
    DEFAULT_NAMES = {"AGENTS.md", "README.md", "CONTRIBUTING.md", "CHANGELOG.md", "openapi.json", "openapi.yaml"}
    DEFAULT_SUFFIXES = {".md", ".rst", ".txt", ".yaml", ".yml", ".json"}
    EXCLUDED_PARTS = {".git", ".ostack", "node_modules", "venv", ".venv", "dist", "build"}

    def scan(self, root: Path) -> List[KnowledgeDocument]:
        documents = []
        for path in root.rglob("*"):
            if not path.is_file() or any(part in self.EXCLUDED_PARTS for part in path.parts):
                continue
            if path.name not in self.DEFAULT_NAMES and path.suffix.lower() not in self.DEFAULT_SUFFIXES:
                continue
            content = path.read_bytes()
            documents.append(KnowledgeDocument(str(path.relative_to(root)), self._kind(path), hashlib.sha256(content).hexdigest(), len(content)))
        return sorted(documents, key=lambda item: item.path)

    def _kind(self, path: Path) -> str:
        lowered = str(path).lower()
        for kind in ("architecture", "api", "workflow", "schema", "standard", "business"):
            if kind in lowered:
                return kind
        return "documentation"

