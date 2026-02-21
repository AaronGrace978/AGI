"""
UI Physics Constraint
======================
Models the structural "physics" of graphical user interfaces.

UI elements obey spatial and hierarchical rules analogous to physical laws:
    - Elements have bounding boxes that don't overlap arbitrarily
    - Child elements are contained within parent bounds
    - Click targets have minimum sizes (touch/click target guidelines)
    - Scroll position constrains which elements are visible
    - Focus follows a logical tab order
    - Modal dialogs block interaction with parent windows

These constraints regularize the policy network so it learns to reason
about UI structure rather than memorizing pixel coordinates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import torch
import torch.nn.functional as F
from torch import Tensor


@dataclass
class UIElement:
    """Representation of a UI element with spatial and semantic properties."""
    id: str
    label: str
    element_type: str            # button, input, menu, dialog, scrollable, etc.
    bounds: tuple[float, float, float, float]  # (x, y, width, height) — relative 0..1
    parent_id: Optional[str] = None
    is_interactive: bool = True
    is_visible: bool = True
    is_enabled: bool = True
    tab_order: int = -1


@dataclass
class UIState:
    """Snapshot of a UI's element tree."""
    elements: list[UIElement] = field(default_factory=list)
    window_size: tuple[int, int] = (1920, 1080)
    scroll_offset: tuple[float, float] = (0.0, 0.0)
    focused_element_id: Optional[str] = None
    modal_element_id: Optional[str] = None

    def get_element(self, eid: str) -> Optional[UIElement]:
        for el in self.elements:
            if el.id == eid:
                return el
        return None

    def get_interactive_elements(self) -> list[UIElement]:
        return [e for e in self.elements
                if e.is_interactive and e.is_visible and e.is_enabled]


class UIPhysics:
    """UI structure analysis and constraint computation."""

    MIN_CLICK_TARGET = 0.02     # 2% of window = ~38px on 1920 wide
    MAX_REASONABLE_DISTANCE = 1.5  # max distance between sequential clicks (normalized)

    def validate_click_position(
        self,
        click_pos: tuple[float, float],
        ui_state: UIState,
    ) -> dict:
        """Check if a click position targets a valid interactive element."""
        cx, cy = click_pos
        hits = []

        for el in ui_state.get_interactive_elements():
            ex, ey, ew, eh = el.bounds
            if ex <= cx <= ex + ew and ey <= cy <= ey + eh:
                hits.append(el)

        if ui_state.modal_element_id:
            modal = ui_state.get_element(ui_state.modal_element_id)
            if modal:
                mx, my, mw, mh = modal.bounds
                in_modal = mx <= cx <= mx + mw and my <= cy <= my + mh
                if not in_modal:
                    return {
                        "valid": False,
                        "reason": "click_outside_modal",
                        "modal_id": ui_state.modal_element_id,
                    }

        return {
            "valid": len(hits) > 0,
            "hits": [h.id for h in hits],
            "reason": None if hits else "no_interactive_element_at_position",
        }

    def compute_click_efficiency(
        self,
        click_positions: list[tuple[float, float]],
    ) -> float:
        """Score how efficient a sequence of clicks is (0=bad, 1=optimal).

        Penalizes unnecessary back-and-forth mouse movement.
        """
        if len(click_positions) < 2:
            return 1.0

        total_distance = 0.0
        for i in range(1, len(click_positions)):
            dx = click_positions[i][0] - click_positions[i - 1][0]
            dy = click_positions[i][1] - click_positions[i - 1][1]
            total_distance += (dx * dx + dy * dy) ** 0.5

        # Optimal = straight line through all points (traveling salesman lower bound)
        # For simplicity, use direct start-to-end distance as reference
        dx = click_positions[-1][0] - click_positions[0][0]
        dy = click_positions[-1][1] - click_positions[0][1]
        direct_distance = (dx * dx + dy * dy) ** 0.5 + 0.01

        efficiency = min(1.0, direct_distance / max(total_distance, 0.01))
        return efficiency

    def check_containment(self, ui_state: UIState) -> list[dict]:
        """Verify child elements are within parent bounds."""
        violations = []
        for el in ui_state.elements:
            if el.parent_id is None:
                continue
            parent = ui_state.get_element(el.parent_id)
            if parent is None:
                continue

            px, py, pw, ph = parent.bounds
            ex, ey, ew, eh = el.bounds

            if (ex < px or ey < py or
                    ex + ew > px + pw or ey + eh > py + ph):
                violations.append({
                    "child": el.id,
                    "parent": parent.id,
                    "reason": "child_outside_parent_bounds",
                })

        return violations


def ui_structure_loss(
    predicted_positions: Tensor,
    target_sizes: Tensor,
    sequential: bool = True,
    device: torch.device | str = "cpu",
) -> Tensor:
    """Compute UI structure constraint loss.

    Args:
        predicted_positions: (batch, steps, 2) — relative (x, y) in [0, 1]
        target_sizes: (batch, steps, 2) — estimated target (w, h) in [0, 1]
        sequential: whether positions represent a sequential interaction

    Returns:
        Scalar loss penalizing UI physics violations.
    """
    # Penalty 1: positions outside valid screen region [0, 1]
    oob = F.relu(-predicted_positions) + F.relu(predicted_positions - 1.0)
    oob_loss = oob.pow(2).mean()

    # Penalty 2: clicking targets that are too small (below minimum target size)
    min_target = 0.02
    small_target = F.relu(min_target - target_sizes)
    target_loss = small_target.pow(2).mean()

    # Penalty 3: sequential click distance (penalize teleportation)
    if sequential and predicted_positions.shape[1] >= 2:
        deltas = predicted_positions[:, 1:] - predicted_positions[:, :-1]
        distances = deltas.norm(dim=-1)
        max_dist = 1.5
        tele_violation = F.relu(distances - max_dist)
        teleport_loss = tele_violation.pow(2).mean()
    else:
        teleport_loss = torch.tensor(0.0, device=device)

    # Penalty 4: efficiency — penalize excessive back-and-forth
    if sequential and predicted_positions.shape[1] >= 3:
        v1 = predicted_positions[:, 1:-1] - predicted_positions[:, :-2]
        v2 = predicted_positions[:, 2:] - predicted_positions[:, 1:-1]
        cos_sim = F.cosine_similarity(v1, v2, dim=-1)
        # cos_sim = -1 means perfect reversal (bad)
        reversal_penalty = F.relu(-cos_sim - 0.5)
        reversal_loss = reversal_penalty.pow(2).mean()
    else:
        reversal_loss = torch.tensor(0.0, device=device)

    return oob_loss + target_loss + teleport_loss + 0.5 * reversal_loss
