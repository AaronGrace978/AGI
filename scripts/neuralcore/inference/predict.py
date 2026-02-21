"""
Neural Predictor (AGI PRIME)
=============================
Real-time action prediction from trained models.

This is the runtime inference engine that the Electron app calls
via the IPC bridge. Given the current UI state and user intent,
it generates an action plan using the trained policy network.

Outputs are in AGI PRIME's cognitive action format so they can be
fed directly to executeSingleAction in the cognitive loop.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import torch
import torch.nn.functional as F
from torch import Tensor

from ..models.policy import PolicyNet
from ..models.perception import PerceptionNet
from ..models.world_model import WorldModel
from ..models.embeddings import (
    StateEncoder, IntentEncoder,
    ACTION_TYPES, ACTION_TYPE_TO_IDX, INTENT_ACTION_TO_IDX, RISK_LEVELS,
)
from ..constraints.fitts import FittsLaw


class NeuralPredictor:
    """Runtime inference engine for the AGI PRIME cognitive agent.

    Loads trained model checkpoints and provides real-time
    action prediction with optional visual perception.
    """

    def __init__(self, checkpoint_dir: str, device: str = "cpu"):
        self.device = torch.device(device)
        self.checkpoint_dir = Path(checkpoint_dir)
        self.is_loaded = False

        self.policy: Optional[PolicyNet] = None
        self.perception: Optional[PerceptionNet] = None
        self.world_model: Optional[WorldModel] = None
        self.state_encoder: Optional[StateEncoder] = None
        self.intent_encoder: Optional[IntentEncoder] = None
        self.fitts = FittsLaw()

    def load(self, checkpoint_name: str = "best") -> bool:
        """Load trained models from checkpoint."""
        path = self.checkpoint_dir / f"{checkpoint_name}.pt"
        if not path.exists():
            return False

        checkpoint = torch.load(path, map_location=self.device, weights_only=False)
        config = checkpoint.get("config", {})

        state_dim = config.get("state_dim", 256)
        intent_dim = config.get("intent_dim", 128)
        hidden_dim = config.get("hidden_dim", 256)
        perception_dim = config.get("perception_dim", 128)
        max_steps = config.get("max_steps", 20)

        num_action_types = config.get("num_action_types", len(ACTION_TYPES))

        self.policy = PolicyNet(
            state_dim=state_dim, intent_dim=intent_dim,
            hidden_dim=hidden_dim, num_action_types=num_action_types,
            max_steps=max_steps,
        ).to(self.device)

        self.perception = PerceptionNet(
            feature_dim=perception_dim,
        ).to(self.device)

        self.world_model = WorldModel(
            state_dim=state_dim, action_dim=64,
            hidden_dim=hidden_dim,
        ).to(self.device)

        self.state_encoder = StateEncoder(
            embed_dim=state_dim, perception_dim=perception_dim,
        ).to(self.device)

        self.intent_encoder = IntentEncoder(
            embed_dim=intent_dim,
        ).to(self.device)

        self.policy.load_state_dict(checkpoint["policy"])
        self.perception.load_state_dict(checkpoint["perception"])
        self.world_model.load_state_dict(checkpoint["world_model"])
        self.state_encoder.load_state_dict(checkpoint["state_encoder"])
        self.intent_encoder.load_state_dict(checkpoint["intent_encoder"])

        for model in [self.policy, self.perception, self.world_model,
                       self.state_encoder, self.intent_encoder]:
            model.eval()

        self.is_loaded = True
        return True

    def predict(
        self,
        intent_action: str,
        intent_target: str,
        intent_confidence: float,
        app_name: str,
        recent_actions: list[dict],
        screenshot_bytes: Optional[bytes] = None,
        window_size: tuple[int, int] = (1920, 1080),
        temperature: float = 0.7,
    ) -> list[dict]:
        """Generate an action plan for a given intent and UI state.

        Args:
            intent_action: intent category (e.g. "click", "type", "navigate")
            intent_target: target description (e.g. "save button", "hello world")
            intent_confidence: 0..1 confidence score
            app_name: active application or foreground window name
            recent_actions: last N action dicts from cognitive history
            screenshot_bytes: optional PNG bytes for visual perception
            window_size: current window dimensions
            temperature: sampling temperature (lower = more deterministic)

        Returns:
            List of cognitive action dicts compatible with executeSingleAction.
        """
        if not self.is_loaded:
            return []

        with torch.no_grad():
            action_idx = torch.tensor(
                [INTENT_ACTION_TO_IDX.get(intent_action, INTENT_ACTION_TO_IDX["unknown"])],
                device=self.device,
            )
            confidence = torch.tensor(
                [[intent_confidence]], device=self.device,
            )
            target_chars = torch.tensor(
                [IntentEncoder.encode_target_text(intent_target)],
                device=self.device,
            ).reshape(-1)
            target_offsets = torch.tensor([0], device=self.device)

            intent_emb = self.intent_encoder(
                action_idx, confidence, target_chars, target_offsets,
            )

            app_chars = torch.tensor(
                [min(ord(c), 127) for c in app_name[:32]],
                device=self.device,
            )
            app_offsets = torch.tensor([0], device=self.device)

            history_types = torch.zeros(1, 10, dtype=torch.long, device=self.device)
            history_positions = torch.zeros(1, 10, 2, device=self.device)

            for i, action in enumerate(recent_actions[-10:]):
                act_type = action.get("actionType", action.get("type", "unknown"))
                history_types[0, i] = ACTION_TYPE_TO_IDX.get(act_type, ACTION_TYPE_TO_IDX["unknown"])
                params = action.get("actionParams", action.get("params", {}))
                history_positions[0, i, 0] = params.get("x", 0) / window_size[0]
                history_positions[0, i, 1] = params.get("y", 0) / window_size[1]

            perception_features = None
            if screenshot_bytes and self.perception:
                img = PerceptionNet.preprocess(screenshot_bytes)
                perception_features = self.perception(img.unsqueeze(0))

            state_emb = self.state_encoder(
                app_chars, app_offsets,
                history_types, history_positions,
                perception_features,
            )

            output = self.policy(state_emb, intent_emb)

        return self._decode_output(output, window_size, temperature)

    def _decode_output(
        self,
        output: dict[str, Tensor],
        window_size: tuple[int, int],
        temperature: float,
    ) -> list[dict]:
        """Convert policy network output to AGI PRIME cognitive action dicts."""
        steps = []
        stop_probs = torch.sigmoid(output["stop_logits"][0])
        W, H = window_size

        prev_x, prev_y = W / 2, H / 2

        for t in range(output["action_logits"].shape[1]):
            if stop_probs[t].item() > 0.5:
                break

            action_probs = F.softmax(
                output["action_logits"][0, t] / max(temperature, 0.01),
                dim=-1,
            )
            action_idx = action_probs.argmax().item()
            action_type = ACTION_TYPES[action_idx]

            rel_x = output["positions"][0, t, 0].item()
            rel_y = output["positions"][0, t, 1].item()
            abs_x = int(rel_x * W)
            abs_y = int(rel_y * H)

            delay_s = output["timings"][0, t].item()
            delay_ms = max(10, int(delay_s * 1000))

            risk_idx = output["risk_logits"][0, t].argmax().item()
            risk_level = RISK_LEVELS[min(risk_idx, len(RISK_LEVELS) - 1)]

            conf = action_probs[action_idx].item()

            params: dict = {}
            if action_type in ("mouse_click",):
                params = {"x": abs_x, "y": abs_y, "button": "left"}
            elif action_type == "mouse_move":
                params = {"x": abs_x, "y": abs_y, "smooth": True}
            elif action_type == "mouse_scroll":
                params = {"x": abs_x, "y": abs_y, "amount": -120}
            elif action_type == "mouse_drag":
                params = {"fromX": int(prev_x), "fromY": int(prev_y), "toX": abs_x, "toY": abs_y}
            elif action_type == "keyboard_type":
                params = {"text": ""}
            elif action_type == "keyboard_press":
                params = {"key": "Enter"}
            elif action_type == "keyboard_shortcut":
                params = {"modifiers": ["Control"], "key": "s"}
            elif action_type == "minimize_self":
                params = {}

            step = {
                "action": action_type,
                "params": params,
                "executionTier": risk_level,
                "timing_ms": delay_ms,
                "confidence": round(conf, 3),
                "source": "neuralcore",
            }

            if action_type in ("mouse_click", "mouse_move", "mouse_drag"):
                trajectory = self.fitts.generate_trajectory(
                    start=(prev_x, prev_y),
                    end=(abs_x, abs_y),
                    target_width=40,
                )
                step["trajectory"] = [
                    {"x": p[0], "y": p[1], "t": p[2]}
                    for p in trajectory
                ]
                prev_x, prev_y = abs_x, abs_y

            steps.append(step)

        return steps

    @property
    def policy_net(self) -> Optional[PolicyNet]:
        return self.policy

    def encode_state(
        self,
        intent_action: str = "unknown",
        intent_target: str = "",
        intent_confidence: float = 0.5,
        app_name: str = "",
        recent_actions: list[dict] | None = None,
        window_size: tuple[int, int] = (1920, 1080),
    ) -> Tensor:
        """Encode the current UI context into a state vector for the planner."""
        if not self.is_loaded or self.state_encoder is None:
            raise RuntimeError("Models not loaded")

        with torch.no_grad():
            app_chars = torch.tensor(
                [min(ord(c), 127) for c in app_name[:32]],
                device=self.device,
            )
            app_offsets = torch.tensor([0], device=self.device)

            history_types = torch.zeros(1, 10, dtype=torch.long, device=self.device)
            history_positions = torch.zeros(1, 10, 2, device=self.device)

            for i, action in enumerate((recent_actions or [])[-10:]):
                act_type = action.get("actionType", action.get("type", "unknown"))
                history_types[0, i] = ACTION_TYPE_TO_IDX.get(act_type, ACTION_TYPE_TO_IDX["unknown"])
                params = action.get("actionParams", action.get("params", {}))
                history_positions[0, i, 0] = params.get("x", 0) / window_size[0]
                history_positions[0, i, 1] = params.get("y", 0) / window_size[1]

            state_emb = self.state_encoder(
                app_chars, app_offsets,
                history_types, history_positions,
                None,
            )
            return state_emb.squeeze(0)

    def encode_intent(
        self,
        intent_action: str = "unknown",
        intent_target: str = "",
        intent_confidence: float = 0.5,
    ) -> Tensor:
        """Encode user intent into an intent vector for the planner."""
        if not self.is_loaded or self.intent_encoder is None:
            raise RuntimeError("Models not loaded")

        with torch.no_grad():
            action_idx = torch.tensor(
                [INTENT_ACTION_TO_IDX.get(intent_action, INTENT_ACTION_TO_IDX["unknown"])],
                device=self.device,
            )
            confidence = torch.tensor(
                [[intent_confidence]], device=self.device,
            )
            target_chars = torch.tensor(
                [IntentEncoder.encode_target_text(intent_target)],
                device=self.device,
            ).reshape(-1)
            target_offsets = torch.tensor([0], device=self.device)

            intent_emb = self.intent_encoder(
                action_idx, confidence, target_chars, target_offsets,
            )
            return intent_emb.squeeze(0)

    def get_status(self) -> dict:
        """Return predictor status for IPC."""
        return {
            "loaded": self.is_loaded,
            "checkpoint_dir": str(self.checkpoint_dir),
            "has_checkpoint": (self.checkpoint_dir / "best.pt").exists(),
            "device": str(self.device),
        }
