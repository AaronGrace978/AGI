"""
Fitts's Law Constraint
=======================
Models the physics of human pointing movement.

Fitts's Law:  MT = a + b · log₂(D / W + 1)

Where:
    MT = movement time (ms)
    D  = distance to target (pixels)
    W  = target width (pixels)
    a  = intercept (device-dependent, ~50ms)
    b  = slope (device-dependent, ~150ms/bit)

This constraint penalizes mouse trajectories that violate human motor
capabilities — superhuman speed, impossible acceleration, or teleportation.
It also provides a generative model for producing realistic mouse paths.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import torch
import torch.nn.functional as F
from torch import Tensor


@dataclass
class FittsParams:
    """Calibrated Fitts's Law parameters."""
    a: float = 50.0          # intercept (ms)
    b: float = 150.0         # slope (ms/bit)
    min_speed: float = 0.5   # pixels/ms lower bound
    max_speed: float = 15.0  # pixels/ms upper bound (superhuman threshold)
    jitter_std: float = 2.0  # natural hand tremor (pixels)


class FittsLaw:
    """Fitts's Law engine for mouse trajectory physics."""

    def __init__(self, params: Optional[FittsParams] = None):
        self.params = params or FittsParams()

    def predicted_movement_time(self, distance: float, target_width: float) -> float:
        """Predict movement time in ms using Fitts's Law."""
        if target_width <= 0:
            target_width = 1.0
        index_of_difficulty = math.log2(distance / target_width + 1)
        return self.params.a + self.params.b * index_of_difficulty

    def generate_trajectory(
        self,
        start: tuple[float, float],
        end: tuple[float, float],
        target_width: float = 40.0,
        num_points: int = 20,
    ) -> list[tuple[float, float, float]]:
        """Generate a realistic mouse trajectory from start to end.

        Returns list of (x, y, timestamp_ms) points following a
        minimum-jerk profile (smooth bell-shaped velocity curve).
        """
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        distance = math.sqrt(dx * dx + dy * dy)

        if distance < 1.0:
            return [(end[0], end[1], 0.0)]

        total_time = self.predicted_movement_time(distance, target_width)
        points: list[tuple[float, float, float]] = []

        for i in range(num_points):
            t = i / (num_points - 1)  # normalized 0..1

            # Minimum-jerk profile: x(t) = 10t³ - 15t⁴ + 6t⁵
            s = 10 * t**3 - 15 * t**4 + 6 * t**5

            x = start[0] + dx * s
            y = start[1] + dy * s
            ts = total_time * t

            points.append((x, y, ts))

        return points

    def is_humanly_possible(
        self,
        distance: float,
        actual_time_ms: float,
        target_width: float = 40.0,
    ) -> tuple[bool, float]:
        """Check if a mouse movement is within human capabilities.

        Returns (is_possible, violation_magnitude).
        violation_magnitude > 0 means the movement was too fast.
        """
        predicted = self.predicted_movement_time(distance, target_width)
        ratio = actual_time_ms / max(predicted, 1.0)

        # Allow 3x faster than Fitts predicts (fast users exist)
        # but flag anything beyond that as superhuman
        is_possible = ratio > 0.33
        violation = max(0.0, 0.33 - ratio)

        return is_possible, violation


def fitts_loss(
    trajectories: Tensor,
    target_sizes: Tensor,
    params: Optional[FittsParams] = None,
) -> Tensor:
    """Compute Fitts's Law constraint loss for a batch of trajectories.

    Args:
        trajectories: (batch, num_points, 3) — x, y, timestamp_ms
        target_sizes: (batch,) — target widths in pixels

    Returns:
        Scalar loss penalizing violations of Fitts's Law.
    """
    p = params or FittsParams()

    positions = trajectories[:, :, :2]  # (batch, points, 2)
    timestamps = trajectories[:, :, 2]  # (batch, points)

    # Segment distances
    deltas = positions[:, 1:] - positions[:, :-1]           # (batch, points-1, 2)
    segment_dists = deltas.norm(dim=-1)                     # (batch, points-1)

    # Segment times
    segment_times = timestamps[:, 1:] - timestamps[:, :-1]  # (batch, points-1)
    segment_times = segment_times.clamp(min=1.0)

    # Instantaneous speed (px/ms)
    speeds = segment_dists / segment_times

    # Penalty 1: superhuman speed
    speed_violation = F.relu(speeds - p.max_speed)
    speed_loss = speed_violation.pow(2).mean()

    # Penalty 2: total time vs Fitts prediction
    total_dist = segment_dists.sum(dim=-1)                  # (batch,)
    total_time = timestamps[:, -1] - timestamps[:, 0]       # (batch,)
    total_time = total_time.clamp(min=1.0)

    w = target_sizes.clamp(min=1.0)
    fitts_predicted = p.a + p.b * torch.log2(total_dist / w + 1)

    # Penalize if actual time < 33% of Fitts prediction (impossibly fast)
    time_ratio = total_time / fitts_predicted.clamp(min=1.0)
    time_violation = F.relu(0.33 - time_ratio)
    time_loss = time_violation.pow(2).mean()

    # Penalty 3: jerk minimization (smoothness)
    # Second derivative of position should be small for natural movement
    if positions.shape[1] >= 3:
        accel = deltas[:, 1:] - deltas[:, :-1]
        jerk_loss = accel.norm(dim=-1).pow(2).mean() * 0.001
    else:
        jerk_loss = torch.tensor(0.0, device=trajectories.device)

    return speed_loss + time_loss + jerk_loss
