"""
World Model
=============
Predicts the next UI state given current state + action.

This is the "imagination" — it lets the agent plan ahead by simulating
action consequences without actually executing them.  Think of it as
a chess engine evaluating moves before committing.

Architecture: Encoder-decoder that maps
    (state_embedding, action_embedding) → predicted_next_state_embedding

The world model enables:
    1. Look-ahead planning: evaluate multiple action sequences in imagination
    2. Anomaly detection: if actual next state ≠ predicted, something unexpected happened
    3. Safety verification: predict whether an action leads to a dangerous state
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor


class WorldModel(nn.Module):
    """Predicts next UI state from current state + action.

    Small enough to run thousands of rollouts per second on CPU,
    enabling tree-search style planning.
    """

    def __init__(
        self,
        state_dim: int = 256,
        action_dim: int = 64,
        hidden_dim: int = 256,
        num_layers: int = 2,
    ):
        super().__init__()
        self.state_dim = state_dim

        # Action encoder: compress action features into dense vector
        self.action_encoder = nn.Sequential(
            nn.Linear(action_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, action_dim),
        )

        # State transition network
        self.transition = nn.Sequential(
            nn.Linear(state_dim + action_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            *[layer for _ in range(num_layers - 1) for layer in (
                nn.Linear(hidden_dim, hidden_dim),
                nn.LayerNorm(hidden_dim),
                nn.GELU(),
            )],
            nn.Linear(hidden_dim, state_dim),
        )

        # Residual gate: learn how much of the state changes
        self.gate = nn.Sequential(
            nn.Linear(state_dim + action_dim, state_dim),
            nn.Sigmoid(),
        )

        # Reward/value head: predict how "good" the resulting state is
        self.value_head = nn.Sequential(
            nn.Linear(state_dim, 64),
            nn.GELU(),
            nn.Linear(64, 1),
            nn.Tanh(),  # normalized to [-1, 1]
        )

        # Done head: predict if the task is complete
        self.done_head = nn.Sequential(
            nn.Linear(state_dim, 32),
            nn.GELU(),
            nn.Linear(32, 1),
        )

    def forward(
        self,
        state: Tensor,    # (batch, state_dim)
        action: Tensor,   # (batch, action_dim)
    ) -> dict[str, Tensor]:
        """Predict next state, value, and done probability.

        Returns dict with:
            next_state: (batch, state_dim)
            value:      (batch, 1) in [-1, 1]
            done_logit: (batch, 1) — logit for task completion
        """
        action_enc = self.action_encoder(action)
        combined = torch.cat([state, action_enc], dim=-1)

        # Gated residual: new_state = gate * transition + (1 - gate) * old_state
        delta = self.transition(combined)
        gate = self.gate(combined)
        next_state = gate * delta + (1 - gate) * state

        value = self.value_head(next_state)
        done = self.done_head(next_state)

        return {
            "next_state": next_state,
            "value": value,
            "done_logit": done,
        }

    def rollout(
        self,
        initial_state: Tensor,
        action_sequence: Tensor,  # (steps, action_dim)
    ) -> dict[str, Tensor]:
        """Simulate a full action sequence in imagination.

        Args:
            initial_state: (state_dim,) starting state
            action_sequence: (steps, action_dim) actions to simulate

        Returns dict with:
            states:  (steps+1, state_dim) — trajectory of states
            values:  (steps, 1) — predicted value at each step
            dones:   (steps, 1) — done logits at each step
        """
        state = initial_state.unsqueeze(0)  # (1, state_dim)
        states = [state.squeeze(0)]
        values = []
        dones = []

        for t in range(action_sequence.shape[0]):
            action = action_sequence[t].unsqueeze(0)
            result = self.forward(state, action)

            state = result["next_state"]
            states.append(state.squeeze(0))
            values.append(result["value"].squeeze(0))
            dones.append(result["done_logit"].squeeze(0))

        return {
            "states": torch.stack(states),
            "values": torch.stack(values),
            "dones": torch.stack(dones),
        }

    def evaluate_plans(
        self,
        initial_state: Tensor,
        candidate_plans: list[Tensor],
    ) -> list[dict]:
        """Evaluate multiple candidate action plans and rank them.

        Returns list sorted by cumulative value (best plan first).
        """
        results = []

        for i, plan in enumerate(candidate_plans):
            rollout = self.rollout(initial_state, plan)
            total_value = rollout["values"].sum().item()
            done_prob = torch.sigmoid(rollout["dones"][-1]).item()
            num_steps = plan.shape[0]

            results.append({
                "plan_idx": i,
                "total_value": total_value,
                "done_probability": done_prob,
                "num_steps": num_steps,
                "efficiency": total_value / max(num_steps, 1),
                "final_state": rollout["states"][-1],
            })

        results.sort(key=lambda r: r["total_value"], reverse=True)
        return results
