"""PINN-style training pipeline."""

from .demo_loader import DemoLoader, DemoDataset
from .trainer import NeuralTrainer

__all__ = ["DemoLoader", "DemoDataset", "NeuralTrainer"]
