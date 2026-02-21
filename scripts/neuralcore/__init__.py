"""
NeuralCore — Physics-Informed Neural Engine for AGI Prime
==========================================================
A locally-trained, constraint-informed neural network module that gives
the cognitive agent generalizable action policies instead of brittle macro replay.

Core idea (borrowed from PINNs):
    total_loss = L_data + λ₁·L_causality + λ₂·L_safety + λ₃·L_fitts + λ₄·L_ui

The constraint losses encode "physics of UI interaction" so the network
learns correct behavior from very few demonstrations.
"""

__version__ = "0.1.0"
