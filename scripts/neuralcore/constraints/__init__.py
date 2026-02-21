"""Constraint losses — the "physics" of UI interaction."""

from .fitts import FittsLaw, fitts_loss
from .causality import CausalityGraph, causality_loss
from .safety import SafetyRules, safety_loss
from .ui_physics import UIPhysics, ui_structure_loss

__all__ = [
    "FittsLaw", "fitts_loss",
    "CausalityGraph", "causality_loss",
    "SafetyRules", "safety_loss",
    "UIPhysics", "ui_structure_loss",
]
