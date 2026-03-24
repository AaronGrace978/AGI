"""Tests for NeuralCore demo_loader — requires torch for import."""

import pytest

torch = pytest.importorskip("torch", reason="torch required for demo_loader tests")

from ..training.demo_loader import _classify_intent, _char_indices, _pad_sequence, Demo


class TestClassifyIntent:
    def test_click_intent(self):
        assert _classify_intent("click the button") == "click"

    def test_type_intent(self):
        assert _classify_intent("type hello world") == "type"

    def test_scroll_intent(self):
        assert _classify_intent("scroll down the page") == "scroll"

    def test_navigate_intent(self):
        assert _classify_intent("navigate to settings") == "navigate"

    def test_complex_task(self):
        result = _classify_intent("do something completely unrelated")
        assert result == "complex_task"

    def test_empty_string(self):
        result = _classify_intent("")
        assert isinstance(result, str)


class TestCharIndices:
    def test_basic_ascii(self):
        result = _char_indices("abc", max_len=5)
        assert result == [97, 98, 99]

    def test_truncation(self):
        result = _char_indices("hello world", max_len=5)
        assert len(result) == 5

    def test_high_unicode_clamped(self):
        result = _char_indices("\u2603", max_len=5)
        assert result[0] == 127

    def test_empty_string(self):
        result = _char_indices("", max_len=5)
        assert result == []


class TestPadSequence:
    def test_padding(self):
        seq = [[1.0, 2.0], [3.0, 4.0]]
        padded = _pad_sequence(seq, max_len=4, feat_dim=2)
        assert len(padded) == 4
        assert padded[2] == [0.0, 0.0]

    def test_truncation(self):
        seq = [[1.0], [2.0], [3.0], [4.0]]
        padded = _pad_sequence(seq, max_len=2, feat_dim=1)
        assert len(padded) == 2

    def test_exact_length(self):
        seq = [[1.0, 2.0]]
        padded = _pad_sequence(seq, max_len=1, feat_dim=2)
        assert len(padded) == 1


class TestDemoFromLedger:
    def test_valid_ledger_entry(self):
        run = {
            "runId": "run_001",
            "goal": "Click the submit button",
            "appContext": "browser",
            "entries": [
                {"step": {"action": "mouse_click", "params": {"x": 100, "y": 200}}, "result": {"success": True}},
            ],
            "success": True,
            "goalProgress": 0.9,
        }
        demo = Demo.from_ledger(run)
        assert demo is not None
        assert demo.run_id == "run_001"
        assert demo.success is True

    def test_missing_goal_returns_none(self):
        run = {"runId": "run_002", "entries": []}
        demo = Demo.from_ledger(run)
        assert demo is None
