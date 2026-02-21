"""
Safety Constraint
==================
Prevents the policy network from proposing dangerous or irreversible actions.

This constraint works in tandem with AGI PRIME's Guardian system but
operates at training time — teaching the network to inherently avoid dangerous
action sequences rather than catching them at execution time.

Heavy penalty on:
    - Destructive file operations (rm -rf, format, del /f)
    - System modification commands (registry, services, users)
    - Credential/secret exposure
    - Unconfirmed irreversible state transitions
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import torch
import torch.nn.functional as F
from torch import Tensor


@dataclass
class SafetyRule:
    """A rule that classifies actions by risk."""
    pattern: str
    risk: str          # 'green', 'yellow', 'red'
    reason: str
    _compiled: re.Pattern = field(init=False, repr=False)

    def __post_init__(self):
        self._compiled = re.compile(self.pattern, re.IGNORECASE)

    def matches(self, action_text: str) -> bool:
        return bool(self._compiled.search(action_text))


ALWAYS_RED: list[SafetyRule] = [
    SafetyRule(r"rm\s+(-rf?|--recursive)", "red", "Recursive file deletion"),
    SafetyRule(r"del\s+/[sfq]", "red", "Force file deletion"),
    SafetyRule(r"format\s+[a-z]:", "red", "Drive formatting"),
    SafetyRule(r"DROP\s+(TABLE|DATABASE)", "red", "Database destruction"),
    SafetyRule(r"shutdown|reboot|restart.*system", "red", "System shutdown"),
    SafetyRule(r"reg\s+delete", "red", "Registry deletion"),
    SafetyRule(r"net\s+user.*(/delete|/add)", "red", "User account modification"),
    SafetyRule(r"chmod\s+777", "red", "Dangerous permission change"),
    SafetyRule(r"mkfs\.", "red", "Filesystem creation"),
    SafetyRule(r"dd\s+if=", "red", "Raw disk write"),
    SafetyRule(r">(>?)\s*/dev/sd[a-z]", "red", "Direct device write"),
    SafetyRule(r"curl.*\|\s*(bash|sh|python)", "red", "Piped remote execution"),
    SafetyRule(r"password|passwd|secret|token|credential|api.?key", "red",
               "Potential credential exposure"),
]

YELLOW_PATTERNS: list[SafetyRule] = [
    SafetyRule(r"npm\s+(install|i)\s+(-g|--global)", "yellow", "Global package install"),
    SafetyRule(r"pip\s+install", "yellow", "Python package install"),
    SafetyRule(r"git\s+(push|reset|rebase)", "yellow", "Git state modification"),
    SafetyRule(r"mv\s+", "yellow", "File move/rename"),
    SafetyRule(r"cp\s+-r", "yellow", "Recursive copy"),
    SafetyRule(r"kill|taskkill", "yellow", "Process termination"),
]


class SafetyRules:
    """Safety classification engine for action descriptions."""

    def __init__(
        self,
        extra_red: list[SafetyRule] | None = None,
        extra_yellow: list[SafetyRule] | None = None,
    ):
        self.red_rules = ALWAYS_RED + (extra_red or [])
        self.yellow_rules = YELLOW_PATTERNS + (extra_yellow or [])

    def classify(self, action_text: str) -> str:
        """Classify an action's risk level."""
        for rule in self.red_rules:
            if rule.matches(action_text):
                return "red"
        for rule in self.yellow_rules:
            if rule.matches(action_text):
                return "yellow"
        return "green"

    def classify_batch(self, actions: list[str]) -> list[str]:
        return [self.classify(a) for a in actions]

    def is_irreversible(self, action_text: str) -> bool:
        """Check if an action is likely irreversible."""
        return self.classify(action_text) == "red"

    def get_violations(self, actions: list[str]) -> list[dict]:
        """Return all red-flagged actions with reasons."""
        violations = []
        for i, action in enumerate(actions):
            for rule in self.red_rules:
                if rule.matches(action):
                    violations.append({
                        "index": i,
                        "action": action,
                        "reason": rule.reason,
                        "pattern": rule.pattern,
                    })
                    break
        return violations


# Risk weights for loss computation
RISK_WEIGHTS = {"green": 0.0, "yellow": 1.0, "red": 10.0}


def safety_loss(
    action_descriptions: list[list[str]],
    rules: SafetyRules | None = None,
    device: torch.device | str = "cpu",
) -> Tensor:
    """Compute safety constraint loss for predicted action sequences.

    Heavily penalizes red actions, mildly penalizes yellow ones.

    Args:
        action_descriptions: (batch, steps) — textual action descriptions
        rules: SafetyRules instance
        device: torch device

    Returns:
        Scalar loss penalizing dangerous actions.
    """
    r = rules or SafetyRules()
    total_penalty = 0.0
    total_actions = 0

    for seq in action_descriptions:
        for action in seq:
            risk = r.classify(action)
            total_penalty += RISK_WEIGHTS.get(risk, 0.0)
            total_actions += 1

    if total_actions == 0:
        return torch.tensor(0.0, device=device)

    normalized = total_penalty / total_actions
    return torch.tensor(normalized, dtype=torch.float32,
                        device=device, requires_grad=True)
