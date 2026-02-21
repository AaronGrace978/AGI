"""
Embedding Networks
===================
Encode heterogeneous inputs (intent text, UI state, action history)
into dense vector representations the policy network can reason over.

These are deliberately small — the constraint losses do the heavy lifting,
so the network capacity is kept low to prevent overfitting on few demos.

Adapted for AGI PRIME's cognitive action vocabulary.
"""

from __future__ import annotations

from typing import Optional

import torch
import torch.nn as nn
from torch import Tensor


# Vocabulary for action types (maps to AGI PRIME's cognitive actions)
ACTION_TYPES = [
    "mouse_click", "mouse_move", "mouse_scroll", "mouse_drag",
    "keyboard_type", "keyboard_press", "keyboard_shortcut",
    "execute_command", "read_file", "write_file",
    "list_directory", "create_directory", "delete_file",
    "open_url", "open_file", "open_application",
    "screenshot_desktop", "analyze_screen",
    "web_fetch", "web_search",
    "clipboard_read", "clipboard_write",
    "minimize_self", "get_mouse_position",
    "search_files", "rename_file",
    "system_info", "list_processes",
    "neural_predict", "neural_generate_trajectory",
    "unknown",
]
ACTION_TYPE_TO_IDX = {t: i for i, t in enumerate(ACTION_TYPES)}

# Vocabulary for intent actions (goal-level cognitive intents)
INTENT_ACTIONS = [
    "click", "type", "navigate", "file_operation",
    "run_command", "search", "screenshot", "ui_interaction",
    "web_operation", "complex_task", "unknown",
]
INTENT_ACTION_TO_IDX = {a: i for i, a in enumerate(INTENT_ACTIONS)}

# Vocabulary for execution tiers (AGI PRIME's risk classification)
RISK_LEVELS = ["read-only", "reversible", "high-risk"]
RISK_TO_IDX = {r: i for i, r in enumerate(RISK_LEVELS)}


class IntentEncoder(nn.Module):
    """Encode a user intent into a dense vector.

    Input features:
        - action type (categorical)
        - confidence (scalar)
        - target text (bag-of-characters embedding)
    """

    def __init__(self, embed_dim: int = 128, char_vocab_size: int = 128):
        super().__init__()
        self.action_embed = nn.Embedding(len(INTENT_ACTIONS), 32)
        self.char_embed = nn.EmbeddingBag(char_vocab_size, 48, mode="mean")
        # 32 (action) + 48 (target chars) + 1 (confidence) = 81
        self.fc = nn.Sequential(
            nn.Linear(81, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.GELU(),
            nn.Linear(embed_dim, embed_dim),
        )

    def forward(
        self,
        action_idx: Tensor,       # (batch,) int
        confidence: Tensor,        # (batch, 1) float
        target_chars: Tensor,      # (batch, max_chars) int
        target_offsets: Tensor,    # (batch,) int — offsets for EmbeddingBag
    ) -> Tensor:
        """Returns (batch, embed_dim) intent embedding."""
        act = self.action_embed(action_idx)                    # (batch, 32)
        chars = self.char_embed(target_chars, target_offsets)  # (batch, 48)
        x = torch.cat([act, chars, confidence], dim=-1)        # (batch, 81)
        return self.fc(x)                                      # (batch, embed_dim)

    @staticmethod
    def encode_target_text(text: str, max_chars: int = 64) -> list[int]:
        """Convert target text to character indices."""
        return [min(ord(c), 127) for c in text[:max_chars]]


class StateEncoder(nn.Module):
    """Encode the current UI state into a dense vector.

    Input features:
        - active window info (app name as char embedding)
        - screen region features (from PerceptionNet, if available)
        - recent action history (last N action embeddings)
    """

    def __init__(
        self,
        embed_dim: int = 256,
        char_vocab_size: int = 128,
        max_history: int = 10,
        perception_dim: int = 128,
    ):
        super().__init__()

        self.app_embed = nn.EmbeddingBag(char_vocab_size, 48, mode="mean")

        self.action_type_embed = nn.Embedding(len(ACTION_TYPES), 16)
        self.action_pos_fc = nn.Linear(2, 16)   # (x, y) position
        self.action_combine = nn.Linear(32, 32)  # 16 + 16

        self.history_rnn = nn.GRU(
            input_size=32,
            hidden_size=64,
            batch_first=True,
        )

        # 48 (app) + 64 (history) + perception_dim (visual)
        total = 48 + 64 + perception_dim
        self.fc = nn.Sequential(
            nn.Linear(total, embed_dim),
            nn.LayerNorm(embed_dim),
            nn.GELU(),
            nn.Linear(embed_dim, embed_dim),
        )

        self.perception_dim = perception_dim

    def forward(
        self,
        app_chars: Tensor,          # (batch, max_chars) int
        app_offsets: Tensor,         # (batch,) int
        history_types: Tensor,       # (batch, max_history) int
        history_positions: Tensor,   # (batch, max_history, 2) float
        perception_features: Optional[Tensor] = None,  # (batch, perception_dim)
    ) -> Tensor:
        """Returns (batch, embed_dim) state embedding."""
        app = self.app_embed(app_chars, app_offsets)  # (batch, 48)

        # Encode action history
        h_type = self.action_type_embed(history_types)   # (batch, hist, 16)
        h_pos = self.action_pos_fc(history_positions)     # (batch, hist, 16)
        h_combined = self.action_combine(
            torch.cat([h_type, h_pos], dim=-1)
        )                                                 # (batch, hist, 32)
        _, h_n = self.history_rnn(h_combined)             # (1, batch, 64)
        history = h_n.squeeze(0)                          # (batch, 64)

        # Visual features (zero if perception unavailable)
        if perception_features is None:
            perception_features = torch.zeros(
                app.shape[0], self.perception_dim,
                device=app.device,
            )

        x = torch.cat([app, history, perception_features], dim=-1)
        return self.fc(x)
