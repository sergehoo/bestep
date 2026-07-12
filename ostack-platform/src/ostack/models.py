from __future__ import annotations

from dataclasses import dataclass, field
from enum import IntEnum
from pathlib import Path
from typing import Any, Dict, List, Optional


class SecurityLevel(IntEnum):
    READ_ONLY = 1
    LOCAL_WRITE = 2
    SENSITIVE = 3
    PRODUCTION = 4


@dataclass(frozen=True)
class AgentSpec:
    id: str
    name: str
    category: str
    role: str
    responsibilities: List[str]
    tools: List[str] = field(default_factory=list)
    limits: List[str] = field(default_factory=list)
    quality_criteria: List[str] = field(default_factory=list)
    output_format: str = "markdown"


@dataclass(frozen=True)
class WorkflowStep:
    id: str
    agent: str
    action: str
    security_level: SecurityLevel = SecurityLevel.READ_ONLY
    requires_approval: bool = False


@dataclass(frozen=True)
class WorkflowSpec:
    id: str
    name: str
    steps: List[WorkflowStep]


@dataclass
class ProjectConfig:
    name: str
    root: Path
    provider: str = "ollama"
    model: Optional[str] = None
    security_level: SecurityLevel = SecurityLevel.LOCAL_WRITE
    metadata: Dict[str, Any] = field(default_factory=dict)

