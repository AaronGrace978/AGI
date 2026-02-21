"""
PINN-Style Trainer
===================
The heart of NeuralCore — trains all models with composite loss:

    L_total = L_data + λ₁·L_fitts + λ₂·L_causality + λ₃·L_safety + λ₄·L_ui

This is where the physics-informed paradigm lives. The constraint losses
act as massive regularizers, allowing the network to learn correct behavior
from very few demonstrations (5-10 patterns instead of thousands).

Training phases:
    1. Pre-train: train perception network on screenshot crops (unsupervised)
    2. Policy training: train policy net with constraint losses
    3. World model: train transition predictor on observed state sequences
    4. Joint fine-tuning: end-to-end with all losses active
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR

from ..models.policy import PolicyNet
from ..models.perception import PerceptionNet
from ..models.world_model import WorldModel
from ..models.embeddings import (
    StateEncoder, IntentEncoder,
    ACTION_TYPES, ACTION_TYPE_TO_IDX, RISK_TO_IDX,
)
from ..constraints.fitts import FittsLaw, fitts_loss, FittsParams
from ..constraints.causality import CausalityGraph, causality_loss
from ..constraints.safety import SafetyRules, safety_loss
from ..constraints.ui_physics import ui_structure_loss
from .demo_loader import DemoLoader


@dataclass
class TrainConfig:
    """Training hyperparameters."""
    epochs: int = 100
    batch_size: int = 8
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4

    # Constraint loss weights (λ values)
    lambda_fitts: float = 0.5
    lambda_causality: float = 2.0
    lambda_safety: float = 10.0
    lambda_ui: float = 1.0
    lambda_world: float = 0.5

    # Model dimensions
    state_dim: int = 256
    intent_dim: int = 128
    hidden_dim: int = 256
    perception_dim: int = 128
    max_steps: int = 20

    # Checkpoint
    save_every: int = 10
    checkpoint_dir: str = ""

    # Early stopping
    patience: int = 15
    min_delta: float = 1e-4


@dataclass
class TrainResult:
    """Result of a training run."""
    epoch: int
    total_loss: float
    data_loss: float
    fitts_loss: float
    causality_loss: float
    safety_loss: float
    ui_loss: float
    world_loss: float
    elapsed_s: float


class NeuralTrainer:
    """Physics-informed trainer for the AGI PRIME neural agent."""

    def __init__(
        self,
        user_data_path: str,
        config: Optional[TrainConfig] = None,
    ):
        self.config = config or TrainConfig()
        self.user_data_path = user_data_path

        checkpoint_dir = self.config.checkpoint_dir or str(
            Path(user_data_path) / "neuralcore-checkpoints"
        )
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self.device = torch.device("cpu")  # CPU-only by design

        # Initialize models
        self.policy = PolicyNet(
            state_dim=self.config.state_dim,
            intent_dim=self.config.intent_dim,
            hidden_dim=self.config.hidden_dim,
            num_action_types=len(ACTION_TYPES),
            max_steps=self.config.max_steps,
        ).to(self.device)

        self.perception = PerceptionNet(
            feature_dim=self.config.perception_dim,
        ).to(self.device)

        self.world_model = WorldModel(
            state_dim=self.config.state_dim,
            action_dim=64,
            hidden_dim=self.config.hidden_dim,
        ).to(self.device)

        self.state_encoder = StateEncoder(
            embed_dim=self.config.state_dim,
            perception_dim=self.config.perception_dim,
        ).to(self.device)

        self.intent_encoder = IntentEncoder(
            embed_dim=self.config.intent_dim,
        ).to(self.device)

        # Constraint engines
        self.fitts = FittsLaw()
        self.causality_graph = CausalityGraph()
        self.safety_rules = SafetyRules()

        # Data loader
        self.demo_loader = DemoLoader(user_data_path)

        # Training state
        self.history: list[TrainResult] = []
        self.best_loss = float("inf")
        self.patience_counter = 0

    def _build_optimizer(self) -> tuple[AdamW, CosineAnnealingLR]:
        """Create optimizer over all trainable parameters."""
        all_params = (
            list(self.policy.parameters())
            + list(self.state_encoder.parameters())
            + list(self.intent_encoder.parameters())
            + list(self.world_model.parameters())
            + list(self.perception.parameters())
        )
        optimizer = AdamW(
            all_params,
            lr=self.config.learning_rate,
            weight_decay=self.config.weight_decay,
        )
        scheduler = CosineAnnealingLR(
            optimizer, T_max=self.config.epochs, eta_min=1e-6
        )
        return optimizer, scheduler

    def train(self, verbose: bool = True) -> list[TrainResult]:
        """Run the full PINN-style training loop.

        Returns training history.
        """
        dataloader = self.demo_loader.create_dataloader(
            batch_size=self.config.batch_size,
            max_steps=self.config.max_steps,
        )

        if len(dataloader.dataset) == 0:
            if verbose:
                print("[NeuralTrainer] No demonstrations found. Run some"
                      " cognitive tasks first, then retrain.")
            return []

        if verbose:
            print(f"[NeuralTrainer] Training on {len(dataloader.dataset)} demonstrations")
            print(f"[NeuralTrainer] Config: {self.config.epochs} epochs, "
                  f"lr={self.config.learning_rate}, batch={self.config.batch_size}")
            print(f"[NeuralTrainer] Constraint weights: "
                  f"fitts={self.config.lambda_fitts}, "
                  f"causality={self.config.lambda_causality}, "
                  f"safety={self.config.lambda_safety}, "
                  f"ui={self.config.lambda_ui}")

        optimizer, scheduler = self._build_optimizer()

        self.policy.train()
        self.state_encoder.train()
        self.intent_encoder.train()
        self.world_model.train()

        for epoch in range(1, self.config.epochs + 1):
            t0 = time.time()
            epoch_losses = {
                "data": 0.0, "fitts": 0.0, "causality": 0.0,
                "safety": 0.0, "ui": 0.0, "world": 0.0, "total": 0.0,
            }
            num_batches = 0

            for batch in dataloader:
                optimizer.zero_grad()
                losses = self._compute_batch_loss(batch)

                total = (
                    losses["data"]
                    + self.config.lambda_fitts * losses["fitts"]
                    + self.config.lambda_causality * losses["causality"]
                    + self.config.lambda_safety * losses["safety"]
                    + self.config.lambda_ui * losses["ui"]
                    + self.config.lambda_world * losses["world"]
                )

                total.backward()
                nn.utils.clip_grad_norm_(self.policy.parameters(), 1.0)
                optimizer.step()

                for k in epoch_losses:
                    if k == "total":
                        epoch_losses[k] += total.item()
                    else:
                        epoch_losses[k] += losses[k].item()
                num_batches += 1

            scheduler.step()

            # Average losses
            for k in epoch_losses:
                epoch_losses[k] /= max(num_batches, 1)

            elapsed = time.time() - t0
            result = TrainResult(
                epoch=epoch,
                total_loss=epoch_losses["total"],
                data_loss=epoch_losses["data"],
                fitts_loss=epoch_losses["fitts"],
                causality_loss=epoch_losses["causality"],
                safety_loss=epoch_losses["safety"],
                ui_loss=epoch_losses["ui"],
                world_loss=epoch_losses["world"],
                elapsed_s=elapsed,
            )
            self.history.append(result)

            if verbose and (epoch % 5 == 0 or epoch == 1):
                print(
                    f"  [{epoch:3d}/{self.config.epochs}] "
                    f"loss={epoch_losses['total']:.4f} "
                    f"(data={epoch_losses['data']:.4f} "
                    f"fitts={epoch_losses['fitts']:.4f} "
                    f"causal={epoch_losses['causality']:.4f} "
                    f"safety={epoch_losses['safety']:.4f} "
                    f"ui={epoch_losses['ui']:.4f}) "
                    f"{elapsed:.1f}s"
                )

            # Checkpointing
            if epoch % self.config.save_every == 0:
                self.save_checkpoint(f"epoch_{epoch}")

            # Early stopping
            if epoch_losses["total"] < self.best_loss - self.config.min_delta:
                self.best_loss = epoch_losses["total"]
                self.patience_counter = 0
                self.save_checkpoint("best")
            else:
                self.patience_counter += 1
                if self.patience_counter >= self.config.patience:
                    if verbose:
                        print(f"  [Early stopping at epoch {epoch}]")
                    break

        self.save_checkpoint("latest")
        if verbose:
            print(f"[NeuralTrainer] Training complete. "
                  f"Best loss: {self.best_loss:.4f}")

        return self.history

    def _compute_batch_loss(self, batch: dict[str, Tensor]) -> dict[str, Tensor]:
        """Compute all loss components for a single batch."""
        steps = batch["steps"].to(self.device)       # (B, max_steps, 5)
        mask = batch["mask"].to(self.device)          # (B, max_steps)
        app_chars = batch["app_chars"].to(self.device)
        intent_chars = batch["intent_chars"].to(self.device)
        confidence = batch["confidence"].to(self.device)

        B = steps.shape[0]

        # Encode state (simplified: use app chars + action history)
        app_offsets = torch.arange(B, device=self.device) * app_chars.shape[1]
        history_types = steps[:, :10, 0].long().clamp(0, len(ACTION_TYPES) - 1)
        history_positions = steps[:, :10, 1:3]

        # Pad history to 10 steps
        if history_types.shape[1] < 10:
            pad = 10 - history_types.shape[1]
            history_types = F.pad(history_types, (0, pad))
            history_positions = F.pad(history_positions, (0, 0, 0, pad))

        state_emb = self.state_encoder(
            app_chars.reshape(-1),
            app_offsets,
            history_types,
            history_positions,
        )

        # Encode intent
        intent_offsets = torch.arange(B, device=self.device) * intent_chars.shape[1]
        action_idx = steps[:, 0, 0].long().clamp(0, 9)
        intent_emb = self.intent_encoder(
            action_idx,
            confidence,
            intent_chars.reshape(-1),
            intent_offsets,
        )

        # Teacher forcing: provide ground-truth previous actions
        teacher = torch.cat([
            F.one_hot(steps[:, :, 0].long().clamp(0, 9), 10).float(),
            steps[:, :, 1:3],
            steps[:, :, 3:4],
        ], dim=-1)  # (B, max_steps, 13)

        # Policy forward pass
        output = self.policy(state_emb, intent_emb, teacher_actions=teacher)

        # === DATA LOSS ===
        # Action type classification
        target_actions = steps[:, :, 0].long().clamp(0, 9)
        action_loss = F.cross_entropy(
            output["action_logits"].reshape(-1, 10),
            target_actions.reshape(-1),
            reduction="none",
        ).reshape(B, -1) * mask
        action_loss = action_loss.sum() / mask.sum().clamp(min=1)

        # Position regression
        target_pos = steps[:, :, 1:3]
        pos_loss = F.mse_loss(
            output["positions"] * mask.unsqueeze(-1),
            target_pos * mask.unsqueeze(-1),
        )

        # Timing regression
        target_timing = steps[:, :, 3:4]
        timing_loss = F.mse_loss(
            output["timings"] * mask.unsqueeze(-1),
            target_timing * mask.unsqueeze(-1),
        )

        # Stop prediction
        stop_target = (1 - mask).unsqueeze(-1)
        stop_loss = F.binary_cross_entropy_with_logits(
            output["stop_logits"], stop_target,
        )

        data_loss = action_loss + pos_loss + timing_loss + 0.5 * stop_loss

        # === CONSTRAINT LOSSES ===

        # Fitts's Law: check predicted mouse trajectories
        positions_3d = torch.cat([
            output["positions"],
            output["timings"] * 1000,  # convert to ms scale
        ], dim=-1)  # (B, steps, 3)
        target_sizes = torch.full((B,), 40.0, device=self.device)
        l_fitts = fitts_loss(positions_3d, target_sizes)

        # Causality: check action ordering (operates on discrete IDs)
        pred_action_ids = output["action_logits"].argmax(dim=-1)
        from ..models.embeddings import ACTION_TYPES
        batch_action_ids = []
        for b in range(B):
            n = int(mask[b].sum().item())
            ids = [ACTION_TYPES[pred_action_ids[b, t].item()] for t in range(n)]
            batch_action_ids.append(ids)
        l_causality = causality_loss(
            output["action_logits"], batch_action_ids, self.causality_graph
        )

        # Safety: check action descriptions
        batch_descriptions: list[list[str]] = []
        for b in range(B):
            n = int(mask[b].sum().item())
            descs = [ACTION_TYPES[pred_action_ids[b, t].item()] for t in range(n)]
            batch_descriptions.append(descs)
        l_safety = safety_loss(batch_descriptions, self.safety_rules, self.device)

        # UI structure
        target_sizes_2d = torch.full(
            (B, output["positions"].shape[1], 2), 0.05, device=self.device
        )
        l_ui = ui_structure_loss(output["positions"], target_sizes_2d, device=self.device)

        # World model: predict next state from current state + action
        action_feat = output["action_logits"][:, :-1, :10]  # (B, steps-1, 10)
        # Pad to action_dim=64
        action_feat_padded = F.pad(action_feat, (0, 54))
        state_seq = state_emb.unsqueeze(1).expand(-1, action_feat_padded.shape[1], -1)
        state_flat = state_seq.reshape(-1, self.config.state_dim)
        action_flat = action_feat_padded.reshape(-1, 64)
        world_out = self.world_model(state_flat, action_flat)
        # Self-consistency: predicted next state should be close to current state
        l_world = F.mse_loss(
            world_out["next_state"],
            state_flat.detach(),
        ) * 0.1  # light weight — world model learns slowly

        return {
            "data": data_loss,
            "fitts": l_fitts,
            "causality": l_causality,
            "safety": l_safety,
            "ui": l_ui,
            "world": l_world,
        }

    # ===========================================
    # Checkpointing
    # ===========================================

    def save_checkpoint(self, name: str) -> Path:
        """Save all model weights and training state."""
        path = self.checkpoint_dir / f"{name}.pt"
        torch.save({
            "policy": self.policy.state_dict(),
            "perception": self.perception.state_dict(),
            "world_model": self.world_model.state_dict(),
            "state_encoder": self.state_encoder.state_dict(),
            "intent_encoder": self.intent_encoder.state_dict(),
            "config": {**self.config.__dict__, "num_action_types": len(ACTION_TYPES)},
            "best_loss": self.best_loss,
            "history": [
                {
                    "epoch": r.epoch, "total_loss": r.total_loss,
                    "data_loss": r.data_loss, "fitts_loss": r.fitts_loss,
                    "causality_loss": r.causality_loss,
                    "safety_loss": r.safety_loss, "ui_loss": r.ui_loss,
                    "world_loss": r.world_loss, "elapsed_s": r.elapsed_s,
                }
                for r in self.history
            ],
        }, path)
        return path

    def load_checkpoint(self, name: str = "best") -> bool:
        """Load model weights from a checkpoint."""
        path = self.checkpoint_dir / f"{name}.pt"
        if not path.exists():
            return False

        checkpoint = torch.load(path, map_location=self.device, weights_only=False)
        self.policy.load_state_dict(checkpoint["policy"])
        self.perception.load_state_dict(checkpoint["perception"])
        self.world_model.load_state_dict(checkpoint["world_model"])
        self.state_encoder.load_state_dict(checkpoint["state_encoder"])
        self.intent_encoder.load_state_dict(checkpoint["intent_encoder"])
        self.best_loss = checkpoint.get("best_loss", float("inf"))
        return True

    def get_model_stats(self) -> dict:
        """Return model sizes and training stats."""
        def count_params(model: nn.Module) -> int:
            return sum(p.numel() for p in model.parameters())

        return {
            "policy_params": count_params(self.policy),
            "perception_params": count_params(self.perception),
            "world_model_params": count_params(self.world_model),
            "state_encoder_params": count_params(self.state_encoder),
            "intent_encoder_params": count_params(self.intent_encoder),
            "total_params": sum(
                count_params(m) for m in [
                    self.policy, self.perception, self.world_model,
                    self.state_encoder, self.intent_encoder,
                ]
            ),
            "best_loss": self.best_loss,
            "epochs_trained": len(self.history),
            "has_checkpoint": (self.checkpoint_dir / "best.pt").exists(),
        }
