"""Tests for NeuralCore constraint modules.

All constraint modules import torch at the top level. These tests
import them normally but skip gracefully if torch is unavailable
or too slow (CI without GPU).
"""

import pytest
import math

torch = pytest.importorskip("torch", reason="torch required for NeuralCore constraint tests")

from ..constraints.fitts import FittsLaw, FittsParams
from ..constraints.safety import SafetyRules, SafetyRule
from ..constraints.causality import CausalityGraph


# ═══════════════════════════════════════════════════════════════
#  Fitts' Law
# ═══════════════════════════════════════════════════════════════


class TestFittsLaw:
    def setup_method(self):
        self.fl = FittsLaw()

    def test_predicted_movement_time_positive(self):
        mt = self.fl.predicted_movement_time(distance=100.0, target_width=40.0)
        assert mt > 0

    def test_farther_distance_slower(self):
        near = self.fl.predicted_movement_time(distance=50, target_width=40)
        far = self.fl.predicted_movement_time(distance=500, target_width=40)
        assert far > near

    def test_larger_target_faster(self):
        small = self.fl.predicted_movement_time(distance=200, target_width=10)
        large = self.fl.predicted_movement_time(distance=200, target_width=100)
        assert small > large

    def test_zero_distance(self):
        mt = self.fl.predicted_movement_time(distance=0.0, target_width=40.0)
        assert mt >= 0

    def test_negative_target_width_clamped(self):
        mt = self.fl.predicted_movement_time(distance=100.0, target_width=-5.0)
        assert mt > 0

    def test_generate_trajectory_returns_points(self):
        traj = self.fl.generate_trajectory(
            start=(0.0, 0.0), end=(100.0, 100.0), target_width=40.0, num_points=10
        )
        assert len(traj) == 10
        for x, y, t in traj:
            assert isinstance(x, float)
            assert isinstance(y, float)
            assert isinstance(t, float)

    def test_generate_trajectory_short_distance(self):
        traj = self.fl.generate_trajectory(
            start=(50.0, 50.0), end=(50.1, 50.1), target_width=40.0
        )
        assert len(traj) >= 1

    def test_is_humanly_possible_slow_movement(self):
        possible, violation = self.fl.is_humanly_possible(
            distance=200, actual_time_ms=5000, target_width=40
        )
        assert possible

    def test_is_humanly_possible_instant_movement(self):
        possible, violation = self.fl.is_humanly_possible(
            distance=500, actual_time_ms=1, target_width=40
        )
        assert not possible


# ═══════════════════════════════════════════════════════════════
#  Safety Rules
# ═══════════════════════════════════════════════════════════════


class TestSafetyRules:
    def setup_method(self):
        self.rules = SafetyRules()

    def test_destructive_commands_are_red(self):
        assert self.rules.classify("rm -rf /") == "red"
        assert self.rules.classify("format C:") == "red"

    def test_benign_commands_are_green(self):
        assert self.rules.classify("ls -la") == "green"
        assert self.rules.classify("read file.txt") == "green"

    def test_is_irreversible(self):
        assert self.rules.is_irreversible("rm -rf /home")
        assert not self.rules.is_irreversible("echo hello")

    def test_classify_batch(self):
        actions = ["ls", "rm -rf /", "echo hi"]
        results = self.rules.classify_batch(actions)
        assert len(results) == 3
        assert results[1] == "red"

    def test_get_violations(self):
        actions = ["ls", "rm -rf /", "echo hi"]
        violations = self.rules.get_violations(actions)
        assert len(violations) >= 1
        assert violations[0]["index"] == 1

    def test_extra_red_rules(self):
        extra = [SafetyRule(pattern=r"drop\s+table", risk=1.0, reason="SQL injection")]
        rules = SafetyRules(extra_red=extra)
        assert rules.classify("DROP TABLE users") == "red"

    def test_safety_rule_matches(self):
        rule = SafetyRule(pattern=r"shutdown", risk=1.0, reason="system shutdown")
        assert rule.matches("shutdown -h now")
        assert not rule.matches("hello world")


# ═══════════════════════════════════════════════════════════════
#  Causality Graph
# ═══════════════════════════════════════════════════════════════


class TestCausalityGraph:
    def setup_method(self):
        self.graph = CausalityGraph()

    def test_default_transitions_loaded(self):
        assert len(self.graph.nodes) > 0

    def test_valid_ordering_no_violations(self):
        valid = self.graph.get_valid_next_actions(set())
        if valid:
            violations = self.graph.check_ordering([valid[0]])
            assert len(violations) == 0

    def test_get_valid_next_actions_with_empty_state(self):
        valid = self.graph.get_valid_next_actions(set())
        for action_id in valid:
            node = self.graph.nodes[action_id]
            assert len(node.preconditions) == 0

    def test_add_transition(self):
        initial_count = len(self.graph.nodes)
        self.graph.add_transition({
            "name": "test_action",
            "preconditions": [],
            "postconditions": ["test_done"],
            "is_reversible": True,
        })
        assert len(self.graph.nodes) == initial_count + 1

    def test_custom_graph_ordering(self):
        transitions = [
            {"name": "open_door", "preconditions": [], "postconditions": ["door_open"], "is_reversible": True},
            {"name": "walk_through", "preconditions": ["door_open"], "postconditions": ["inside"], "is_reversible": True},
        ]
        g = CausalityGraph(transitions)
        assert len(g.nodes) == 2
        violations = g.check_ordering(["walk_through"])
        assert len(violations) >= 1
        violations2 = g.check_ordering(["open_door", "walk_through"])
        assert len(violations2) == 0
