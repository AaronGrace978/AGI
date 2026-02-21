"""
Causality Constraint
=====================
Models the state-machine structure of UI interaction.

Desktop applications are state machines: menus must be opened before items
can be clicked, dialogs must be addressed before the parent window is
accessible, files must exist before they can be opened, etc.

This constraint encodes those causal dependencies so the policy network
can't propose impossible action orderings.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import torch
import torch.nn.functional as F
from torch import Tensor


@dataclass
class StateNode:
    """A node in the UI state graph."""
    id: str
    name: str
    preconditions: list[str] = field(default_factory=list)
    postconditions: list[str] = field(default_factory=list)
    is_reversible: bool = True


# Common UI state transitions that hold across applications
DEFAULT_TRANSITIONS: list[dict] = [
    {
        "id": "menu_open",
        "name": "Open menu",
        "preconditions": [],
        "postconditions": ["menu_visible"],
    },
    {
        "id": "menu_click",
        "name": "Click menu item",
        "preconditions": ["menu_visible"],
        "postconditions": ["menu_action_done"],
    },
    {
        "id": "dialog_open",
        "name": "Dialog appears",
        "preconditions": [],
        "postconditions": ["dialog_visible", "parent_blocked"],
    },
    {
        "id": "dialog_dismiss",
        "name": "Dismiss dialog",
        "preconditions": ["dialog_visible"],
        "postconditions": ["parent_unblocked"],
    },
    {
        "id": "file_save",
        "name": "Save file",
        "preconditions": ["file_open"],
        "postconditions": ["file_saved"],
    },
    {
        "id": "text_select",
        "name": "Select text",
        "preconditions": ["text_field_focused"],
        "postconditions": ["text_selected"],
    },
    {
        "id": "text_copy",
        "name": "Copy text",
        "preconditions": ["text_selected"],
        "postconditions": ["clipboard_has_text"],
    },
    {
        "id": "text_paste",
        "name": "Paste text",
        "preconditions": ["text_field_focused", "clipboard_has_text"],
        "postconditions": ["text_inserted"],
    },
    {
        "id": "scroll_to_element",
        "name": "Scroll to make element visible",
        "preconditions": [],
        "postconditions": ["element_visible"],
    },
    {
        "id": "click_element",
        "name": "Click an element",
        "preconditions": ["element_visible"],
        "postconditions": ["element_activated"],
    },
]


class CausalityGraph:
    """Directed graph of UI state transitions and their preconditions."""

    def __init__(self, transitions: Optional[list[dict]] = None):
        self.nodes: dict[str, StateNode] = {}
        raw = transitions if transitions is not None else DEFAULT_TRANSITIONS
        for t in raw:
            node = StateNode(
                id=t["id"],
                name=t["name"],
                preconditions=t.get("preconditions", []),
                postconditions=t.get("postconditions", []),
                is_reversible=t.get("is_reversible", True),
            )
            self.nodes[node.id] = node

        self._build_precondition_index()

    def _build_precondition_index(self) -> None:
        """Map each state condition to the actions that produce it."""
        self.producers: dict[str, list[str]] = {}
        for node in self.nodes.values():
            for post in node.postconditions:
                self.producers.setdefault(post, []).append(node.id)

    def check_ordering(self, action_ids: list[str]) -> list[dict]:
        """Check a sequence of actions for causality violations.

        Returns list of violations: {index, action, missing_precondition}.
        """
        satisfied: set[str] = set()
        violations: list[dict] = []

        for i, aid in enumerate(action_ids):
            node = self.nodes.get(aid)
            if node is None:
                continue

            for pre in node.preconditions:
                if pre not in satisfied:
                    violations.append({
                        "index": i,
                        "action": aid,
                        "missing_precondition": pre,
                    })

            for post in node.postconditions:
                satisfied.add(post)

        return violations

    def get_valid_next_actions(self, current_state: set[str]) -> list[str]:
        """Given current satisfied conditions, return which actions are valid."""
        valid = []
        for node in self.nodes.values():
            if all(pre in current_state for pre in node.preconditions):
                valid.append(node.id)
        return valid

    def add_transition(self, transition: dict) -> None:
        """Register a new state transition (learned from observation)."""
        node = StateNode(
            id=transition["id"],
            name=transition.get("name", transition["id"]),
            preconditions=transition.get("preconditions", []),
            postconditions=transition.get("postconditions", []),
            is_reversible=transition.get("is_reversible", True),
        )
        self.nodes[node.id] = node
        self._build_precondition_index()


def causality_loss(
    action_logits: Tensor,
    action_ids: list[list[str]],
    graph: CausalityGraph,
) -> Tensor:
    """Compute causality constraint loss for predicted action sequences.

    Args:
        action_logits: (batch, max_steps, num_actions) — predicted probabilities
        action_ids: list of action ID sequences, one per batch item
        graph: the causality graph to check against

    Returns:
        Scalar loss penalizing causal ordering violations.
    """
    total_violations = 0.0
    total_actions = 0

    for b, seq in enumerate(action_ids):
        violations = graph.check_ordering(seq)
        total_violations += len(violations)
        total_actions += max(len(seq), 1)

    violation_rate = total_violations / max(total_actions, 1)

    loss = torch.tensor(violation_rate, dtype=torch.float32,
                        device=action_logits.device, requires_grad=True)
    return loss
