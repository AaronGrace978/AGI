"""
Demonstration Loader (AGI PRIME)
=================================
Ingests AGI PRIME's cognitive run ledgers and converts them into
training tensors for the policy network.

Data flow:
    run-ledgers/*.json → CognitiveStep[] → DemoDataset → DataLoader → Trainer

AGI PRIME's cognitive loop stores runs as JSON ledger files.
Each run contains a sequence of steps with types:
    observe, think, act, reflect, replan

We extract 'act' steps that have actionType + actionParams to build
training demonstrations of successful action sequences.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Optional

import torch
import torch.nn.functional as F
from torch import Tensor
from torch.utils.data import Dataset, DataLoader

from ..models.embeddings import (
    ACTION_TYPE_TO_IDX,
    INTENT_ACTION_TO_IDX,
    RISK_TO_IDX,
    IntentEncoder,
)


TIER_TO_RISK = {
    "read-only": "read-only",
    "reversible": "reversible",
    "high-risk": "high-risk",
}


def _classify_intent(goal: str) -> str:
    """Infer a high-level intent category from a cognitive goal string."""
    g = goal.lower()
    if any(w in g for w in ("click", "press", "button", "tap")):
        return "click"
    if any(w in g for w in ("type", "write", "enter text", "input")):
        return "type"
    if any(w in g for w in ("open", "navigate", "go to", "visit", "url")):
        return "navigate"
    if any(w in g for w in ("file", "folder", "directory", "read", "copy", "move")):
        return "file_operation"
    if any(w in g for w in ("run", "execute", "command", "script", "install")):
        return "run_command"
    if any(w in g for w in ("search", "find", "look for", "grep")):
        return "search"
    if any(w in g for w in ("screenshot", "screen", "capture", "see")):
        return "screenshot"
    if any(w in g for w in ("mouse", "drag", "scroll", "move")):
        return "ui_interaction"
    if any(w in g for w in ("fetch", "download", "web", "api")):
        return "web_operation"
    return "complex_task"


def _char_indices(text: str, max_len: int = 64) -> list[int]:
    """Convert text to list of ASCII char indices."""
    return [min(ord(c), 127) for c in text[:max_len]]


def _pad_sequence(seq: list[list[float]], max_len: int, feat_dim: int) -> list[list[float]]:
    """Pad a variable-length sequence to max_len."""
    padded = seq[:max_len]
    while len(padded) < max_len:
        padded.append([0.0] * feat_dim)
    return padded


class Demo:
    """A single training demonstration from one cognitive run."""

    def __init__(
        self,
        run_id: str,
        goal: str,
        app_context: str,
        steps: list[dict],
        success: bool,
        goal_progress: float = 0.0,
    ):
        self.run_id = run_id
        self.goal = goal
        self.app_context = app_context
        self.steps = steps
        self.success = success
        self.confidence = goal_progress if goal_progress > 0 else (0.8 if success else 0.3)

    @staticmethod
    def from_ledger(run: dict) -> Optional["Demo"]:
        """Create Demo from an AGI PRIME cognitive run ledger."""
        metadata = run.get("metadata", {})
        goal = metadata.get("goal", run.get("goal", ""))
        run_id = run.get("runId", "unknown")
        success = run.get("status") == "completed"
        entries = run.get("entries", [])

        act_steps = []
        app_context = ""
        final_progress = 0.0

        for entry in entries:
            payload = entry.get("payload", {})
            step_type = payload.get("type", entry.get("entryType", ""))

            if step_type == "act" and payload.get("actionType"):
                action_type = payload["actionType"]
                params = payload.get("actionParams", {})
                result = payload.get("actionResult", {})
                tier = payload.get("executionTier", "reversible")
                progress = payload.get("goalProgress", 0.0)

                if progress > final_progress:
                    final_progress = progress

                if not result.get("success", True):
                    continue

                act_steps.append({
                    "type": action_type,
                    "params": params,
                    "tier": tier,
                    "progress": progress,
                })

                if action_type in ("analyze_screen", "screenshot_desktop"):
                    fg = params.get("foregroundApp", "")
                    if fg:
                        app_context = fg

        if len(act_steps) < 2:
            return None

        return Demo(
            run_id=run_id,
            goal=goal,
            app_context=app_context,
            steps=act_steps,
            success=success,
            goal_progress=final_progress,
        )

    def to_tensors(self, max_steps: int = 20) -> dict[str, Tensor]:
        """Convert this demonstration to training tensors."""
        step_features = []
        for step in self.steps[:max_steps]:
            action_idx = ACTION_TYPE_TO_IDX.get(step["type"], ACTION_TYPE_TO_IDX["unknown"])
            params = step.get("params", {})

            x = params.get("x", 0)
            y = params.get("y", 0)
            rel_x = min(x / 1920.0, 1.0) if x > 0 else 0.5
            rel_y = min(y / 1080.0, 1.0) if y > 0 else 0.5

            delay = min(step.get("delay", 500) / 1000.0, 5.0) if "delay" in step else 0.3
            risk_str = TIER_TO_RISK.get(step.get("tier", "reversible"), "reversible")
            risk_idx = RISK_TO_IDX.get(risk_str, 1)

            step_features.append([
                float(action_idx),
                rel_x,
                rel_y,
                delay,
                float(risk_idx),
            ])

        feat_dim = 5
        padded = _pad_sequence(step_features, max_steps, feat_dim)
        num_real_steps = min(len(self.steps), max_steps)
        mask = [1.0] * num_real_steps + [0.0] * (max_steps - num_real_steps)

        app_chars = _char_indices(self.app_context, 32)
        intent_chars = _char_indices(self.goal, 64)

        return {
            "steps": torch.tensor(padded, dtype=torch.float32),
            "mask": torch.tensor(mask, dtype=torch.float32),
            "app_chars": torch.tensor(app_chars, dtype=torch.long),
            "intent_chars": torch.tensor(intent_chars, dtype=torch.long),
            "confidence": torch.tensor([self.confidence], dtype=torch.float32),
            "num_steps": torch.tensor([num_real_steps], dtype=torch.long),
        }


class DemoDataset(Dataset):
    """PyTorch dataset of recorded cognitive demonstrations."""

    def __init__(self, demos: list[Demo], max_steps: int = 20):
        self.demos = demos
        self.max_steps = max_steps

    def __len__(self) -> int:
        return len(self.demos)

    def __getitem__(self, idx: int) -> dict[str, Tensor]:
        demo = self.demos[idx]
        tensors = demo.to_tensors(self.max_steps)

        if self.training_mode:
            steps = tensors["steps"]
            mask = tensors["mask"]

            pos_noise = torch.randn(steps.shape[0], 2) * 0.02
            steps[:, 1:3] = (steps[:, 1:3] + pos_noise).clamp(0.0, 1.0)

            time_noise = 1.0 + torch.randn(steps.shape[0]) * 0.2
            steps[:, 3] = (steps[:, 3] * time_noise.clamp(0.5, 2.0))

            tensors["steps"] = steps * mask.unsqueeze(-1)

        return tensors

    @property
    def training_mode(self) -> bool:
        return getattr(self, "_training", True)

    def eval(self):
        self._training = False
        return self

    def train(self):
        self._training = True
        return self


class DemoLoader:
    """Load demonstrations from AGI PRIME's cognitive run ledgers."""

    def __init__(self, user_data_path: str):
        self.ledger_dir = Path(user_data_path) / "agi-prime-data" / "run-ledgers"

    def load_patterns(self) -> list[Demo]:
        """Load all completed cognitive runs as Demo objects."""
        if not self.ledger_dir.exists():
            return []

        demos = []
        for ledger_file in sorted(self.ledger_dir.glob("*.json")):
            try:
                data = json.loads(ledger_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue

            if isinstance(data, dict):
                demo = Demo.from_ledger(data)
                if demo is not None:
                    demos.append(demo)
            elif isinstance(data, list):
                for run in data:
                    if isinstance(run, dict):
                        demo = Demo.from_ledger(run)
                        if demo is not None:
                            demos.append(demo)

        return demos

    def create_dataset(
        self,
        max_steps: int = 20,
        min_confidence: float = 0.0,
    ) -> DemoDataset:
        """Create a PyTorch dataset from loaded demonstrations."""
        demos = self.load_patterns()
        if min_confidence > 0:
            demos = [d for d in demos if d.confidence >= min_confidence]
        return DemoDataset(demos, max_steps)

    def create_dataloader(
        self,
        batch_size: int = 8,
        max_steps: int = 20,
        shuffle: bool = True,
    ) -> DataLoader:
        """Create a PyTorch DataLoader ready for training."""
        dataset = self.create_dataset(max_steps)

        def collate_fn(batch: list[dict]) -> dict[str, Tensor]:
            """Custom collation handling variable-length char sequences."""
            keys = batch[0].keys()
            collated = {}
            for key in keys:
                tensors = [item[key] for item in batch]
                if key in ("app_chars", "intent_chars"):
                    max_len = max(t.shape[0] for t in tensors)
                    padded = [F.pad(t, (0, max_len - t.shape[0]))
                              for t in tensors]
                    collated[key] = torch.stack(padded)
                else:
                    collated[key] = torch.stack(tensors)
            return collated

        # RandomSampler requires a positive dataset size. If no demonstrations
        # exist yet, keep shuffle disabled so callers can gracefully detect
        # an empty dataset (instead of crashing with num_samples=0).
        safe_shuffle = shuffle and len(dataset) > 0

        return DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=safe_shuffle,
            collate_fn=collate_fn,
            drop_last=False,
        )
