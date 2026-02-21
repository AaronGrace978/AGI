"""
Synthetic Demonstration Generator
===================================
Generates synthetic training data so NeuralCore can train WITHOUT
waiting for real cognitive runs. These are plausible desktop automation
patterns — click sequences, navigation flows, typing patterns — that
encode human-like behavior.

The key insight: we don't need real data to learn physics constraints.
Fitts's Law is Fitts's Law whether the mouse movement came from a
human or from a mathematical model of a human. By generating
demonstrations that obey realistic constraints, the PINN losses
can converge before real data even exists.

Usage:
    python -m neuralcore.training.generate_synthetic --output-dir <path> --count 200
"""

from __future__ import annotations

import argparse
import json
import math
import random
import time
from pathlib import Path
from typing import Optional
from uuid import uuid4


APPS = [
    "Google Chrome", "Firefox", "VS Code", "File Explorer",
    "Notepad", "Terminal", "Outlook", "Slack", "Discord",
    "Calculator", "Settings", "Task Manager",
]

GOALS = {
    "click": [
        "click the save button", "click the submit button",
        "click the close button", "click on the search bar",
        "click the settings icon", "click the file menu",
        "click the next page button", "click the login button",
        "click the download link", "click the notification bell",
    ],
    "type": [
        "type a search query", "type an email address",
        "type a file name", "type a password",
        "type a message", "type a URL in the address bar",
        "type a command in the terminal",
    ],
    "navigate": [
        "open a new tab", "switch to another window",
        "navigate to settings", "open the start menu",
        "go to the downloads folder", "open a recent file",
        "navigate to the home page",
    ],
    "file_operation": [
        "save the current file", "create a new folder",
        "rename a file", "copy a file to clipboard",
        "move a file to trash", "open a file from disk",
    ],
    "run_command": [
        "run a build command", "execute a script",
        "install a package", "run tests",
        "check git status",
    ],
}

# Realistic screen regions where UI elements typically live
UI_REGIONS = {
    "toolbar": {"x": (100, 1800), "y": (0, 50)},
    "sidebar": {"x": (0, 250), "y": (50, 900)},
    "content": {"x": (250, 1700), "y": (100, 900)},
    "statusbar": {"x": (0, 1920), "y": (1040, 1080)},
    "taskbar": {"x": (0, 1920), "y": (1040, 1080)},
    "dialog_center": {"x": (600, 1300), "y": (300, 700)},
    "menu": {"x": (0, 400), "y": (25, 400)},
    "address_bar": {"x": (200, 1200), "y": (30, 60)},
    "search_box": {"x": (400, 1500), "y": (60, 120)},
}


def fitts_time(distance: float, width: float = 40.0) -> float:
    """Fitts's Law predicted movement time in seconds."""
    a, b = 0.05, 0.15
    if distance < 1:
        return a
    return a + b * math.log2(distance / width + 1)


def jitter(value: float, amount: float = 3.0) -> float:
    """Add natural hand tremor."""
    return value + random.gauss(0, amount)


def generate_mouse_trajectory(
    start: tuple[float, float],
    end: tuple[float, float],
    target_width: float = 40.0,
) -> list[dict]:
    """Generate a realistic minimum-jerk mouse trajectory."""
    dx, dy = end[0] - start[0], end[1] - start[1]
    dist = math.sqrt(dx * dx + dy * dy)
    total_time = fitts_time(dist, target_width)
    num_points = max(5, int(total_time * 60))

    points = []
    for i in range(num_points):
        t = i / max(num_points - 1, 1)
        s = 10 * t**3 - 15 * t**4 + 6 * t**5
        x = start[0] + dx * s + random.gauss(0, 1.5 * (1 - abs(2 * t - 1)))
        y = start[1] + dy * s + random.gauss(0, 1.5 * (1 - abs(2 * t - 1)))
        points.append({"x": x, "y": y, "t": total_time * t * 1000})
    return points


def random_point_in_region(region: str) -> tuple[float, float]:
    """Get a random point within a UI region."""
    r = UI_REGIONS.get(region, UI_REGIONS["content"])
    return (
        random.uniform(r["x"][0], r["x"][1]),
        random.uniform(r["y"][0], r["y"][1]),
    )


def generate_click_sequence() -> dict:
    """Generate a realistic click action sequence."""
    goal_text = random.choice(GOALS["click"])
    app = random.choice(APPS)
    target_region = random.choice(["toolbar", "content", "sidebar", "dialog_center", "menu"])
    target = random_point_in_region(target_region)

    start_pos = (random.uniform(400, 1500), random.uniform(200, 800))
    delay = fitts_time(
        math.sqrt((target[0] - start_pos[0])**2 + (target[1] - start_pos[1])**2)
    )

    steps = [{
        "type": "mouse_click",
        "params": {
            "x": int(jitter(target[0])),
            "y": int(jitter(target[1])),
            "button": "left",
        },
        "tier": "read-only",
        "delay": int(delay * 1000),
        "progress": 0.8,
    }]

    # Sometimes add a preceding move
    if random.random() < 0.4:
        steps.insert(0, {
            "type": "mouse_move",
            "params": {"x": int(jitter(target[0], 50)), "y": int(jitter(target[1], 50))},
            "tier": "read-only",
            "delay": int(delay * 500),
            "progress": 0.3,
        })

    # Sometimes add a verification screenshot after
    if random.random() < 0.3:
        steps.append({
            "type": "analyze_screen",
            "params": {"prompt": f"Verify that {goal_text} was successful"},
            "tier": "read-only",
            "delay": 500,
            "progress": 1.0,
        })

    return _build_run(goal_text, app, steps, success=True, progress=0.9)


def generate_type_sequence() -> dict:
    """Generate a realistic typing action sequence."""
    goal_text = random.choice(GOALS["type"])
    app = random.choice(APPS)
    target_region = random.choice(["address_bar", "search_box", "content"])
    target = random_point_in_region(target_region)

    texts = [
        "hello world", "test@example.com", "search query here",
        "npm install", "git status", "python main.py",
        "document.txt", "project-report", "meeting notes",
    ]

    steps = [
        {
            "type": "mouse_click",
            "params": {"x": int(jitter(target[0])), "y": int(jitter(target[1])), "button": "left"},
            "tier": "read-only",
            "delay": 300,
            "progress": 0.2,
        },
        {
            "type": "keyboard_type",
            "params": {"text": random.choice(texts)},
            "tier": "reversible",
            "delay": random.randint(500, 2000),
            "progress": 0.7,
        },
    ]

    if random.random() < 0.5:
        steps.append({
            "type": "keyboard_press",
            "params": {"key": "Enter"},
            "tier": "reversible",
            "delay": 200,
            "progress": 1.0,
        })

    return _build_run(goal_text, app, steps, success=True, progress=0.95)


def generate_navigation_sequence() -> dict:
    """Generate a navigation action sequence."""
    goal_text = random.choice(GOALS["navigate"])
    app = random.choice(APPS)

    steps = []

    if "tab" in goal_text:
        steps.append({
            "type": "keyboard_shortcut",
            "params": {"modifiers": ["Control"], "key": "t"},
            "tier": "read-only",
            "delay": 100,
            "progress": 1.0,
        })
    elif "window" in goal_text:
        steps.append({
            "type": "keyboard_shortcut",
            "params": {"modifiers": ["Alt"], "key": "Tab"},
            "tier": "read-only",
            "delay": 300,
            "progress": 0.8,
        })
    else:
        target = random_point_in_region(random.choice(["taskbar", "sidebar", "toolbar"]))
        steps.append({
            "type": "mouse_click",
            "params": {"x": int(jitter(target[0])), "y": int(jitter(target[1])), "button": "left"},
            "tier": "read-only",
            "delay": 400,
            "progress": 0.5,
        })

        if random.random() < 0.5:
            second = random_point_in_region("content")
            steps.append({
                "type": "mouse_click",
                "params": {"x": int(jitter(second[0])), "y": int(jitter(second[1])), "button": "left"},
                "tier": "read-only",
                "delay": 500,
                "progress": 1.0,
            })

    return _build_run(goal_text, app, steps, success=True, progress=1.0)


def generate_file_operation_sequence() -> dict:
    """Generate a file operation sequence."""
    goal_text = random.choice(GOALS["file_operation"])
    app = random.choice(["File Explorer", "VS Code", "Notepad"])

    steps = []

    if "save" in goal_text:
        steps.append({
            "type": "keyboard_shortcut",
            "params": {"modifiers": ["Control"], "key": "s"},
            "tier": "reversible",
            "delay": 100,
            "progress": 1.0,
        })
    elif "new folder" in goal_text or "create" in goal_text:
        steps.append({
            "type": "keyboard_shortcut",
            "params": {"modifiers": ["Control", "Shift"], "key": "n"},
            "tier": "reversible",
            "delay": 200,
            "progress": 0.5,
        })
        steps.append({
            "type": "keyboard_type",
            "params": {"text": f"new-folder-{random.randint(1, 99)}"},
            "tier": "reversible",
            "delay": 800,
            "progress": 0.8,
        })
        steps.append({
            "type": "keyboard_press",
            "params": {"key": "Enter"},
            "tier": "reversible",
            "delay": 200,
            "progress": 1.0,
        })
    else:
        target = random_point_in_region("content")
        steps.append({
            "type": "mouse_click",
            "params": {"x": int(target[0]), "y": int(target[1]), "button": "right"},
            "tier": "read-only",
            "delay": 300,
            "progress": 0.3,
        })
        menu_item = random_point_in_region("menu")
        steps.append({
            "type": "mouse_click",
            "params": {"x": int(menu_item[0]), "y": int(menu_item[1]), "button": "left"},
            "tier": "reversible",
            "delay": 400,
            "progress": 0.8,
        })

    return _build_run(goal_text, app, steps, success=True, progress=0.9)


def generate_command_sequence() -> dict:
    """Generate a command execution sequence."""
    goal_text = random.choice(GOALS["run_command"])
    app = random.choice(["Terminal", "VS Code"])

    commands = [
        "npm run build", "python -m pytest", "git status",
        "pip install requests", "npm install", "cargo build",
        "dotnet run", "go test ./...", "make all",
    ]

    steps = [{
        "type": "execute_command",
        "params": {"command": random.choice(commands)},
        "tier": "reversible",
        "delay": random.randint(1000, 5000),
        "progress": 1.0,
    }]

    return _build_run(goal_text, app, steps, success=random.random() > 0.2, progress=0.85)


def _build_run(
    goal: str, app: str, steps: list[dict],
    success: bool, progress: float,
) -> dict:
    """Build a complete run ledger from steps."""
    run_id = str(uuid4())[:8]
    started_at = int(time.time() * 1000) - random.randint(5000, 30000)

    entries = []
    current_time = started_at

    # Opening observe entry
    entries.append({
        "entryType": "step",
        "timestamp": current_time,
        "payload": {
            "type": "observe",
            "content": f'Goal received: "{goal}". Gathering initial state...',
            "timestamp": current_time,
            "goalProgress": 0,
        },
    })
    current_time += random.randint(200, 800)

    for step in steps:
        # Think step before action
        entries.append({
            "entryType": "step",
            "timestamp": current_time,
            "payload": {
                "type": "think",
                "content": f"Planning to execute {step['type']}",
                "timestamp": current_time,
                "goalProgress": step.get("progress", 0) * 0.5,
            },
        })
        current_time += random.randint(100, 500)

        # Act step
        entries.append({
            "entryType": "step",
            "timestamp": current_time,
            "payload": {
                "type": "act",
                "actionType": step["type"],
                "actionParams": step["params"],
                "executionTier": step.get("tier", "reversible"),
                "goalProgress": step.get("progress", 0.5),
                "actionResult": {
                    "success": True,
                    "output": f"{step['type']} executed successfully",
                },
                "timestamp": current_time,
            },
        })
        current_time += step.get("delay", 500)

    # Closing reflect entry
    entries.append({
        "entryType": "step",
        "timestamp": current_time,
        "payload": {
            "type": "reflect",
            "content": "Goal achieved." if success else "Goal could not be completed.",
            "timestamp": current_time,
            "goalProgress": progress if success else 0.3,
        },
    })

    return {
        "runId": f"syn_{run_id}",
        "kind": "cognitive",
        "status": "completed" if success else "failed",
        "startedAt": started_at,
        "completedAt": current_time,
        "metadata": {
            "goal": goal,
            "origin": "synthetic_generator",
            "hasContextAddendum": False,
            "maxIterations": 25,
            "startedFrom": "synthetic",
        },
        "entries": entries,
        "foregroundApp": app,
    }


GENERATORS = [
    (generate_click_sequence, 40),
    (generate_type_sequence, 25),
    (generate_navigation_sequence, 15),
    (generate_file_operation_sequence, 12),
    (generate_command_sequence, 8),
]


def generate_dataset(count: int = 200) -> list[dict]:
    """Generate a full synthetic dataset."""
    runs = []
    total_weight = sum(w for _, w in GENERATORS)

    for gen, weight in GENERATORS:
        n = max(1, int(count * weight / total_weight))
        for _ in range(n):
            runs.append(gen())

    random.shuffle(runs)
    return runs[:count]


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic NeuralCore training data")
    parser.add_argument("--output-dir", type=str, required=True, help="Output directory for ledger files")
    parser.add_argument("--count", type=int, default=200, help="Number of synthetic runs to generate")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    args = parser.parse_args()

    random.seed(args.seed)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    runs = generate_dataset(args.count)

    for run in runs:
        path = out_dir / f"{run['runId']}.json"
        path.write_text(json.dumps(run, indent=2), encoding="utf-8")

    print(f"[SyntheticGen] Generated {len(runs)} synthetic demonstrations in {out_dir}")
    print(f"  Click sequences: {sum(1 for r in runs if any('mouse_click' in str(e) for e in r['entries']))}")
    print(f"  Type sequences:  {sum(1 for r in runs if any('keyboard_type' in str(e) for e in r['entries']))}")
    print(f"  Navigation:      {sum(1 for r in runs if any('keyboard_shortcut' in str(e) for e in r['entries']))}")
    print(f"  File ops:        {sum(1 for r in runs if any('rename' in str(r.get('metadata', {}).get('goal', '')) or 'save' in str(r.get('metadata', {}).get('goal', '')) for _ in [None]))}")
    print(f"  Commands:        {sum(1 for r in runs if any('execute_command' in str(e) for e in r['entries']))}")


if __name__ == "__main__":
    main()
