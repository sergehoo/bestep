from dataclasses import dataclass

from .models import SecurityLevel


class PolicyViolation(PermissionError):
    pass


@dataclass(frozen=True)
class PolicyDecision:
    allowed: bool
    requires_human_approval: bool
    reason: str


class PolicyEngine:
    def evaluate(
        self,
        action_level: SecurityLevel,
        granted_level: SecurityLevel,
        human_approved: bool = False,
    ) -> PolicyDecision:
        if action_level > granted_level:
            return PolicyDecision(False, action_level >= 3, "insufficient security level")
        if action_level == SecurityLevel.PRODUCTION and not human_approved:
            return PolicyDecision(False, True, "production always requires explicit approval")
        if action_level == SecurityLevel.SENSITIVE and not human_approved:
            return PolicyDecision(False, True, "sensitive action requires approval")
        return PolicyDecision(True, False, "policy requirements satisfied")

    def enforce(self, action_level: SecurityLevel, granted_level: SecurityLevel, human_approved: bool = False) -> None:
        decision = self.evaluate(action_level, granted_level, human_approved)
        if not decision.allowed:
            raise PolicyViolation(decision.reason)

