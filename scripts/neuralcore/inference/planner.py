"""
Look-Ahead Planner
===================
Uses the world model to evaluate and rank action plans before execution.

The planner generates multiple candidate plans (from the policy network
at different temperatures), simulates each through the world model,
and picks the one with the best predicted outcome.

This is analogous to Monte Carlo Tree Search in game AI — but for
desktop automation. The agent "imagines" what will happen before it acts.
"""

from __future__ import annotations

from typing import Optional

import torch
import torch.nn.functional as F
from torch import Tensor

from ..models.policy import PolicyNet
from ..models.world_model import WorldModel
from ..models.embeddings import ACTION_TYPES, RISK_LEVELS
from ..constraints.safety import SafetyRules


class LookAheadPlanner:
    """Plan evaluation via world model rollouts."""

    def __init__(
        self,
        policy: PolicyNet,
        world_model: WorldModel,
        safety_rules: Optional[SafetyRules] = None,
        num_candidates: int = 5,
        temperature_range: tuple[float, float] = (0.3, 1.2),
    ):
        self.policy = policy
        self.world_model = world_model
        self.safety_rules = safety_rules or SafetyRules()
        self.num_candidates = num_candidates
        self.temp_low, self.temp_high = temperature_range

    @torch.no_grad()
    def generate_plans(
        self,
        state: Tensor,    # (state_dim,)
        intent: Tensor,   # (intent_dim,)
        max_steps: int = 20,
    ) -> list[dict]:
        """Generate and evaluate multiple candidate action plans.

        Returns plans sorted best-first, each with:
            - steps: list of predicted action dicts
            - score: world model value
            - safety_score: safety assessment
            - done_probability: predicted task completion probability
        """
        self.policy.eval()
        self.world_model.eval()

        candidates = []

        for i in range(self.num_candidates):
            # Vary temperature across candidates
            t = i / max(self.num_candidates - 1, 1)
            temperature = self.temp_low + t * (self.temp_high - self.temp_low)

            # Generate action sequence
            output = self.policy(
                state.unsqueeze(0),
                intent.unsqueeze(0),
                max_steps=max_steps,
            )

            # Extract action features for world model
            action_probs = F.softmax(
                output["action_logits"][0] / max(temperature, 0.01), dim=-1
            )
            stop_probs = torch.sigmoid(output["stop_logits"][0])

            # Find sequence length (where stop > 0.5)
            seq_len = max_steps
            for t_idx in range(max_steps):
                if stop_probs[t_idx].item() > 0.5:
                    seq_len = t_idx + 1
                    break

            # Build action tensor for world model (padded to 64)
            action_features = torch.cat([
                action_probs[:seq_len],
                output["positions"][0, :seq_len],
                output["timings"][0, :seq_len],
            ], dim=-1)  # (seq_len, 13)
            action_padded = F.pad(action_features, (0, 64 - action_features.shape[-1]))

            # World model rollout
            rollout = self.world_model.rollout(state, action_padded)
            total_value = rollout["values"].sum().item()
            done_prob = torch.sigmoid(rollout["dones"][-1]).item()

            # Decode steps
            steps = []
            for t_idx in range(seq_len):
                action_idx = action_probs[t_idx].argmax().item()
                steps.append({
                    "type": ACTION_TYPES[action_idx],
                    "position": {
                        "x": output["positions"][0, t_idx, 0].item(),
                        "y": output["positions"][0, t_idx, 1].item(),
                    },
                    "delay": max(10, output["timings"][0, t_idx].item() * 1000),
                    "risk": RISK_LEVELS[
                        output["risk_logits"][0, t_idx].argmax().item()
                    ],
                    "confidence": action_probs[t_idx].max().item(),
                })

            # Safety assessment
            descriptions = [s["type"] for s in steps]
            safety_violations = self.safety_rules.get_violations(descriptions)
            safety_score = 1.0 - len(safety_violations) / max(len(steps), 1)

            candidates.append({
                "plan_idx": i,
                "steps": steps,
                "score": total_value,
                "safety_score": safety_score,
                "safety_violations": safety_violations,
                "done_probability": done_prob,
                "temperature": temperature,
                "num_steps": seq_len,
                "composite_score": (
                    total_value * 0.4
                    + safety_score * 0.3
                    + done_prob * 0.2
                    + (1.0 / max(seq_len, 1)) * 0.1  # prefer shorter plans
                ),
            })

        candidates.sort(key=lambda c: c["composite_score"], reverse=True)
        return candidates

    @torch.no_grad()
    def verify_plan(
        self,
        state: Tensor,
        plan_actions: Tensor,
    ) -> dict:
        """Verify a plan by simulating it through the world model.

        Returns safety and outcome assessment.
        """
        rollout = self.world_model.rollout(state, plan_actions)
        values = rollout["values"]
        dones = torch.sigmoid(rollout["dones"])

        # Check for value drops (potential failures)
        value_drops = []
        for t in range(1, values.shape[0]):
            drop = values[t - 1].item() - values[t].item()
            if drop > 0.3:
                value_drops.append({"step": t, "drop": drop})

        return {
            "feasible": len(value_drops) == 0,
            "final_value": values[-1].item(),
            "done_probability": dones[-1].item(),
            "value_trajectory": values.squeeze(-1).tolist(),
            "potential_issues": value_drops,
            "recommendation": (
                "safe_to_execute" if not value_drops
                else "review_steps" if len(value_drops) < 2
                else "high_risk_plan"
            ),
        }
