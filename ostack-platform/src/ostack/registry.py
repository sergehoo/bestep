from __future__ import annotations

from typing import Dict, Iterable, List

from .models import AgentSpec


AGENT_CATALOG = {
    "product": ["Product Owner", "Business Analyst", "Functional Analyst"],
    "architecture": ["Solution Architect", "Software Architect", "Data Architect", "API Architect"],
    "ux": ["UX Expert", "UI Expert", "Accessibility Expert"],
    "engineering": ["Backend Engineer", "Frontend Engineer", "Mobile Engineer", "AI Engineer", "Integration Engineer", "Database Engineer"],
    "quality": ["QA Engineer", "Test Engineer", "Performance Engineer"],
    "security": ["Security Auditor", "DevSecOps Engineer", "Compliance Officer"],
    "operations": ["DevOps Engineer", "Release Manager", "Site Reliability Engineer"],
    "documentation": ["Technical Writer", "API Writer", "User Documentation Specialist"],
}


def slugify(value: str) -> str:
    return value.lower().replace(" ", "-")


def default_agents() -> List[AgentSpec]:
    agents = []
    for category, names in AGENT_CATALOG.items():
        for name in names:
            agents.append(
                AgentSpec(
                    id=slugify(name),
                    name=name,
                    category=category,
                    role=f"Act as OStack's {name}.",
                    responsibilities=["analyze assigned scope", "produce actionable evidence", "identify risks and assumptions"],
                    tools=["project knowledge", "repository inspection"],
                    limits=["no production action without approval", "do not exceed assigned scope"],
                    quality_criteria=["traceable", "testable", "secure", "concise"],
                )
            )
    return agents


class AgentRegistry:
    def __init__(self, agents: Iterable[AgentSpec] = ()) -> None:
        initial = list(agents) or default_agents()
        self._agents: Dict[str, AgentSpec] = {agent.id: agent for agent in initial}

    def all(self) -> List[AgentSpec]:
        return sorted(self._agents.values(), key=lambda item: (item.category, item.name))

    def get(self, agent_id: str) -> AgentSpec:
        try:
            return self._agents[agent_id]
        except KeyError as exc:
            raise KeyError(f"Unknown agent: {agent_id}") from exc

