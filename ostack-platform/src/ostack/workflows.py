from __future__ import annotations

from typing import Dict, List

from .models import SecurityLevel, WorkflowSpec, WorkflowStep


def delivery_workflow() -> WorkflowSpec:
    definitions = [
        ("discovery", "business-analyst", "discover project and domain", 1, False),
        ("business-analysis", "functional-analyst", "formalize requirements", 1, False),
        ("architecture", "solution-architect", "design solution", 1, False),
        ("architecture-approval", "product-owner", "validate architecture", 3, True),
        ("development", "backend-engineer", "implement scoped change", 2, False),
        ("testing", "test-engineer", "verify acceptance criteria", 2, False),
        ("security-audit", "security-auditor", "assess security", 1, False),
        ("documentation", "technical-writer", "update documentation", 2, False),
        ("release-preparation", "release-manager", "prepare release", 3, True),
        ("production-release", "devops-engineer", "deploy release", 4, True),
    ]
    return WorkflowSpec(
        id="software-delivery",
        name="Software Delivery",
        steps=[WorkflowStep(step_id, agent, action, SecurityLevel(level), approval) for step_id, agent, action, level, approval in definitions],
    )


class WorkflowRegistry:
    def __init__(self) -> None:
        workflow = delivery_workflow()
        self._workflows: Dict[str, WorkflowSpec] = {workflow.id: workflow}

    def all(self) -> List[WorkflowSpec]:
        return list(self._workflows.values())

    def get(self, workflow_id: str) -> WorkflowSpec:
        try:
            return self._workflows[workflow_id]
        except KeyError as exc:
            raise KeyError(f"Unknown workflow: {workflow_id}") from exc

