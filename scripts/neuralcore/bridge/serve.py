"""
NeuralCore IPC Bridge
======================
Bidirectional JSON-over-stdio communication between the NeuralCore
Python process and the Electron main process.

Protocol:
    - Each message is a single line of JSON
    - Request:  {"id": "req_1", "method": "predict", "params": {...}}
    - Response: {"id": "req_1", "result": {...}} or {"id": "req_1", "error": "..."}
    - Events:   {"event": "training_progress", "data": {...}}

The bridge is designed as a long-lived subprocess — Electron spawns it
once and keeps it alive, sending requests as needed. This avoids the
overhead of spawning Python on every prediction.

Usage:
    python -m neuralcore.bridge.serve --user-data-path <path>
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path
from typing import Any, Optional

# Ensure parent package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))


class NeuralBridgeServer:
    """JSON-RPC-style IPC server over stdin/stdout."""

    def __init__(self, user_data_path: str):
        self.user_data_path = user_data_path
        self.checkpoint_dir = str(
            Path(user_data_path) / "neuralcore-checkpoints"
        )

        self.predictor = None
        self.trainer = None

        self.planner = None

        # Method dispatch table
        self.methods: dict[str, Any] = {
            "ping": self._ping,
            "status": self._status,
            "load": self._load_models,
            "predict": self._predict,
            "train": self._train,
            "train_status": self._train_status,
            "model_stats": self._model_stats,
            "generate_trajectory": self._generate_trajectory,
            "plan": self._plan,
            "generate_synthetic": self._generate_synthetic,
        }

    def _send(self, msg: dict) -> None:
        """Send a JSON message to stdout."""
        line = json.dumps(msg, default=str)
        sys.stdout.write(line + "\n")
        sys.stdout.flush()

    def _send_event(self, event: str, data: dict) -> None:
        """Send an unsolicited event to the Electron side."""
        self._send({"event": event, "data": data})

    def run(self) -> None:
        """Main loop: read requests from stdin, dispatch, respond."""
        self._send_event("ready", {"version": "0.1.0"})

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                request = json.loads(line)
            except json.JSONDecodeError as e:
                self._send({"error": f"Invalid JSON: {e}"})
                continue

            req_id = request.get("id")
            method = request.get("method")
            params = request.get("params", {})

            if method not in self.methods:
                self._send({
                    "id": req_id,
                    "error": f"Unknown method: {method}",
                })
                continue

            try:
                result = self.methods[method](**params)
                self._send({"id": req_id, "result": result})
            except Exception as e:
                self._send({
                    "id": req_id,
                    "error": str(e),
                    "traceback": traceback.format_exc(),
                })

    # =========================================
    # Method Handlers
    # =========================================

    def _ping(self) -> dict:
        return {"pong": True}

    def _status(self) -> dict:
        return {
            "predictor_loaded": self.predictor is not None and self.predictor.is_loaded,
            "has_checkpoint": (Path(self.checkpoint_dir) / "best.pt").exists(),
            "user_data_path": self.user_data_path,
        }

    def _load_models(self, checkpoint: str = "best") -> dict:
        """Load trained models for inference."""
        if self.predictor is None:
            from ..inference.predict import NeuralPredictor
            self.predictor = NeuralPredictor(self.checkpoint_dir)

        success = self.predictor.load(checkpoint)
        return {"loaded": success, "checkpoint": checkpoint}

    def _predict(
        self,
        intent_action: str = "unknown",
        intent_target: str = "",
        intent_confidence: float = 0.5,
        app_name: str = "",
        recent_actions: list[dict] | None = None,
        screenshot_b64: str | None = None,
        window_size: list[int] | None = None,
        temperature: float = 0.7,
    ) -> dict:
        """Generate action plan from intent + state."""
        if self.predictor is None or not self.predictor.is_loaded:
            return {"steps": [], "error": "Models not loaded. Call 'load' first."}

        screenshot_bytes = None
        if screenshot_b64:
            import base64
            screenshot_bytes = base64.b64decode(screenshot_b64)

        wsize = tuple(window_size) if window_size else (1920, 1080)

        steps = self.predictor.predict(
            intent_action=intent_action,
            intent_target=intent_target,
            intent_confidence=intent_confidence,
            app_name=app_name,
            recent_actions=recent_actions or [],
            screenshot_bytes=screenshot_bytes,
            window_size=wsize,
            temperature=temperature,
        )

        return {"steps": steps, "count": len(steps)}

    def _train(
        self,
        epochs: int = 100,
        batch_size: int = 8,
        learning_rate: float = 1e-3,
        lambda_fitts: float = 0.5,
        lambda_causality: float = 2.0,
        lambda_safety: float = 10.0,
        lambda_ui: float = 1.0,
    ) -> dict:
        """Start training the neural models."""
        from ..training.trainer import NeuralTrainer, TrainConfig

        config = TrainConfig(
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            lambda_fitts=lambda_fitts,
            lambda_causality=lambda_causality,
            lambda_safety=lambda_safety,
            lambda_ui=lambda_ui,
            checkpoint_dir=self.checkpoint_dir,
        )

        self.trainer = NeuralTrainer(self.user_data_path, config)

        # Send progress events during training
        history = self.trainer.train(verbose=False)

        if len(history) == 0:
            return {
                "error": (
                    "No training demonstrations found yet. "
                    "Run a few HANDS tasks first so AGI PRIME can record action ledgers."
                ),
                "epochs_completed": 0,
                "checkpoint_saved": False,
            }

        for result in history:
            self._send_event("training_progress", {
                "epoch": result.epoch,
                "total_loss": result.total_loss,
                "data_loss": result.data_loss,
                "fitts_loss": result.fitts_loss,
                "causality_loss": result.causality_loss,
                "safety_loss": result.safety_loss,
                "ui_loss": result.ui_loss,
                "elapsed_s": result.elapsed_s,
            })

        # Reload predictor with new weights
        if self.predictor is not None:
            self.predictor.load("best")

        return {
            "epochs_completed": len(history),
            "best_loss": self.trainer.best_loss if self.trainer else None,
            "checkpoint_saved": True,
        }

    def _train_status(self) -> dict:
        if self.trainer is None:
            return {"status": "not_started"}

        return {
            "status": "completed" if self.trainer.history else "idle",
            "stats": self.trainer.get_model_stats(),
        }

    def _model_stats(self) -> dict:
        if self.trainer is None:
            from ..training.trainer import NeuralTrainer
            self.trainer = NeuralTrainer(self.user_data_path)

        return self.trainer.get_model_stats()

    def _generate_trajectory(
        self,
        start_x: float,
        start_y: float,
        end_x: float,
        end_y: float,
        target_width: float = 40.0,
        num_points: int = 20,
    ) -> dict:
        """Generate a Fitts's Law mouse trajectory."""
        from ..constraints.fitts import FittsLaw

        fitts = FittsLaw()
        trajectory = fitts.generate_trajectory(
            start=(start_x, start_y),
            end=(end_x, end_y),
            target_width=target_width,
            num_points=num_points,
        )

        return {
            "points": [{"x": p[0], "y": p[1], "t": p[2]} for p in trajectory],
            "predicted_time_ms": fitts.predicted_movement_time(
                ((end_x - start_x)**2 + (end_y - start_y)**2)**0.5,
                target_width,
            ),
        }


    def _generate_synthetic(self, count: int = 200, seed: int = 42) -> dict:
        """Generate synthetic training demonstrations for bootstrap training."""
        from ..training.generate_synthetic import generate_dataset
        import random

        random.seed(seed)
        runs = generate_dataset(count)

        ledger_dir = Path(self.user_data_path) / "agi-prime-data" / "run-ledgers"
        ledger_dir.mkdir(parents=True, exist_ok=True)

        written = 0
        for run in runs:
            path = ledger_dir / f"{run['runId']}.json"
            if not path.exists():
                path.write_text(json.dumps(run), encoding="utf-8")
                written += 1

        return {
            "generated": len(runs),
            "written": written,
            "directory": str(ledger_dir),
        }

    def _ensure_planner(self) -> None:
        """Lazily initialize the LookAheadPlanner from loaded models."""
        if self.planner is not None:
            return
        if self.predictor is None or not self.predictor.is_loaded:
            raise RuntimeError("Models not loaded. Call 'load' first.")

        from ..inference.planner import LookAheadPlanner

        self.planner = LookAheadPlanner(
            policy=self.predictor.policy_net,
            world_model=self.predictor.world_model,
            num_candidates=5,
            temperature_range=(0.3, 1.2),
        )

    def _plan(
        self,
        intent_action: str = "unknown",
        intent_target: str = "",
        intent_confidence: float = 0.5,
        app_name: str = "",
        recent_actions: list[dict] | None = None,
        max_steps: int = 20,
        num_candidates: int = 5,
    ) -> dict:
        """Generate ranked action plans using world model rollouts.

        Returns the best plan and alternatives, each scored on value,
        safety, and completion probability.
        """
        self._ensure_planner()

        import torch
        import torch.nn.functional as F

        state = self.predictor.encode_state(
            intent_action=intent_action,
            intent_target=intent_target,
            intent_confidence=intent_confidence,
            app_name=app_name,
            recent_actions=recent_actions or [],
        )
        intent = self.predictor.encode_intent(
            intent_action=intent_action,
            intent_target=intent_target,
            intent_confidence=intent_confidence,
        )

        if num_candidates != self.planner.num_candidates:
            self.planner.num_candidates = num_candidates

        plans = self.planner.generate_plans(
            state=state,
            intent=intent,
            max_steps=max_steps,
        )

        # Verify the top plan through a full world model rollout
        verification = None
        if plans and plans[0]["steps"]:
            best = plans[0]
            num_steps = len(best["steps"])

            # Build proper action tensors (steps, 64) from the plan's decoded steps
            action_features = []
            from ..models.embeddings import ACTION_TYPE_TO_IDX, ACTION_TYPES
            for step in best["steps"]:
                action_idx = ACTION_TYPE_TO_IDX.get(step.get("type", "unknown"), 0)
                one_hot = F.one_hot(torch.tensor(action_idx), len(ACTION_TYPES)).float()
                pos = step.get("position", {})
                pos_x = pos.get("x", 0.5) if isinstance(pos, dict) else 0.5
                pos_y = pos.get("y", 0.5) if isinstance(pos, dict) else 0.5
                timing = step.get("delay", 300) / 1000.0
                feat = torch.cat([
                    one_hot,
                    torch.tensor([pos_x, pos_y, timing]),
                ])
                # Pad to action_dim=64
                feat = F.pad(feat, (0, max(0, 64 - feat.shape[0])))[:64]
                action_features.append(feat)

            action_tensor = torch.stack(action_features)
            try:
                verification = self.planner.verify_plan(state, action_tensor)
            except Exception:
                verification = None

        return {
            "plans": plans,
            "best_plan": plans[0] if plans else None,
            "verification": verification,
            "num_candidates": len(plans),
        }


def main():
    parser = argparse.ArgumentParser(description="NeuralCore IPC Bridge")
    parser.add_argument(
        "--user-data-path", type=str, required=True,
        help="Path to Electron userData directory",
    )
    args = parser.parse_args()

    server = NeuralBridgeServer(args.user_data_path)
    server.run()


if __name__ == "__main__":
    main()
