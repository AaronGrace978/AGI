"""
Policy Network
===============
The core decision-maker.  Maps (UI state, user intent) → action sequence.

Architecture:
    - Takes state embedding + intent embedding as input
    - Outputs a sequence of action steps with:
        * action type (categorical)
        * relative position (x, y ∈ [0, 1])
        * timing/delay (ms)
        * risk level prediction

    - Trained with PINN-style composite loss:
        L = L_data + λ₁·L_fitts + λ₂·L_causality + λ₃·L_safety + λ₄·L_ui

Key design choice: outputs RELATIVE positions (0..1 within window),
not pixel coordinates. This is what makes it generalize across
resolutions, window sizes, and DPI settings.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor


class PolicyNet(nn.Module):
    """Constraint-informed action policy network.

    Given a state embedding and intent embedding, auto-regressively
    generates a sequence of action steps.
    """

    def __init__(
        self,
        state_dim: int = 256,
        intent_dim: int = 128,
        hidden_dim: int = 256,
        num_action_types: int = 31,
        max_steps: int = 20,
        num_layers: int = 3,
    ):
        super().__init__()
        self.max_steps = max_steps
        self.hidden_dim = hidden_dim

        # Fuse state + intent
        self.input_proj = nn.Sequential(
            nn.Linear(state_dim + intent_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
        )

        # Autoregressive step decoder
        self.step_rnn = nn.GRU(
            input_size=hidden_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.1 if num_layers > 1 else 0.0,
        )

        # Per-step input: previous action embedding
        self.prev_action_proj = nn.Linear(num_action_types + 2 + 1, hidden_dim)

        # Output heads
        self.action_head = nn.Linear(hidden_dim, num_action_types)
        self.position_head = nn.Sequential(
            nn.Linear(hidden_dim, 64),
            nn.GELU(),
            nn.Linear(64, 2),
            nn.Sigmoid(),  # clamp to [0, 1] relative coords
        )
        self.timing_head = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.GELU(),
            nn.Linear(32, 1),
            nn.Softplus(),  # positive delays only
        )
        self.risk_head = nn.Linear(hidden_dim, 3)  # green/yellow/red
        self.stop_head = nn.Linear(hidden_dim, 1)  # stop probability

    def forward(
        self,
        state: Tensor,    # (batch, state_dim)
        intent: Tensor,   # (batch, intent_dim)
        max_steps: int | None = None,
        teacher_actions: Tensor | None = None,
    ) -> dict[str, Tensor]:
        """Generate an action sequence.

        Args:
            state: encoded UI state
            intent: encoded user intent
            max_steps: override max sequence length
            teacher_actions: (batch, steps, action_feat_dim) for teacher forcing

        Returns:
            dict with keys:
                action_logits: (batch, steps, num_action_types)
                positions:     (batch, steps, 2)
                timings:       (batch, steps, 1)
                risk_logits:   (batch, steps, 3)
                stop_logits:   (batch, steps, 1)
        """
        steps = max_steps or self.max_steps
        batch_size = state.shape[0]
        device = state.device

        # Initial hidden state from fused input
        context = self.input_proj(torch.cat([state, intent], dim=-1))
        h = context.unsqueeze(0).expand(
            self.step_rnn.num_layers, -1, -1
        ).contiguous()

        # Start token: zero action
        prev_feat = torch.zeros(batch_size, 1, self.hidden_dim, device=device)

        all_actions = []
        all_positions = []
        all_timings = []
        all_risks = []
        all_stops = []

        for t in range(steps):
            output, h = self.step_rnn(prev_feat, h)  # (batch, 1, hidden)
            out = output.squeeze(1)                   # (batch, hidden)

            action_logits = self.action_head(out)     # (batch, num_types)
            position = self.position_head(out)        # (batch, 2)
            timing = self.timing_head(out)            # (batch, 1)
            risk = self.risk_head(out)                # (batch, 3)
            stop = self.stop_head(out)                # (batch, 1)

            all_actions.append(action_logits)
            all_positions.append(position)
            all_timings.append(timing)
            all_risks.append(risk)
            all_stops.append(stop)

            # Prepare input for next step
            if teacher_actions is not None and t < teacher_actions.shape[1]:
                prev_raw = teacher_actions[:, t]
            else:
                # Use own predictions (action probs + position + timing)
                action_probs = F.softmax(action_logits, dim=-1)
                prev_raw = torch.cat([action_probs, position, timing], dim=-1)

            prev_feat = self.prev_action_proj(prev_raw).unsqueeze(1)

        return {
            "action_logits": torch.stack(all_actions, dim=1),
            "positions": torch.stack(all_positions, dim=1),
            "timings": torch.stack(all_timings, dim=1),
            "risk_logits": torch.stack(all_risks, dim=1),
            "stop_logits": torch.stack(all_stops, dim=1),
        }

    def predict(
        self,
        state: Tensor,
        intent: Tensor,
        temperature: float = 0.7,
    ) -> list[dict]:
        """Inference-mode: generate action sequence and decode to dicts.

        Returns list of action step dicts compatible with AGI PRIME's cognitive actions.
        """
        self.eval()
        with torch.no_grad():
            out = self.forward(state.unsqueeze(0), intent.unsqueeze(0))

        steps = []
        stop_probs = torch.sigmoid(out["stop_logits"][0])

        for t in range(out["action_logits"].shape[1]):
            if stop_probs[t].item() > 0.5:
                break

            action_probs = F.softmax(
                out["action_logits"][0, t] / temperature, dim=-1
            )
            action_idx = action_probs.argmax().item()

            from .embeddings import ACTION_TYPES, RISK_LEVELS
            action_type = ACTION_TYPES[action_idx]
            pos = out["positions"][0, t].tolist()
            delay = out["timings"][0, t].item()
            risk_idx = out["risk_logits"][0, t].argmax().item()

            steps.append({
                "type": action_type,
                "position": {"x": pos[0], "y": pos[1]},
                "delay": max(10.0, delay * 1000),  # scale to ms
                "risk": RISK_LEVELS[risk_idx],
                "confidence": action_probs[action_idx].item(),
            })

        return steps
