from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .models import AgentSpec
from .registry import AgentRegistry


@dataclass(frozen=True)
class Assignment:
    agent: AgentSpec
    reason: str


class AgentOrchestrator:
    ROUTING = {
        "feature": ["product-owner", "solution-architect", "backend-engineer", "test-engineer", "security-auditor", "technical-writer"],
        "bug": ["backend-engineer", "test-engineer", "security-auditor"],
        "audit": ["software-architect", "security-auditor", "performance-engineer", "technical-writer"],
        "discover": ["business-analyst", "software-architect", "data-architect"],
        "release": ["release-manager", "devsecops-engineer", "site-reliability-engineer"],
    }

    def __init__(self, registry: AgentRegistry) -> None:
        self.registry = registry

    def select(self, task_type: str) -> List[Assignment]:
        ids = self.ROUTING.get(task_type, ["solution-architect"])
        return [Assignment(self.registry.get(agent_id), f"selected for {task_type}") for agent_id in ids]

