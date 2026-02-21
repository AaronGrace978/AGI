"""
ARC-AGI-3 runner with LLM-driven reasoning via Ollama.

Uses the Ollama Cloud API to reason about game state and choose actions
intelligently, instead of blind cycling.

Flow per game:
  1) RESET  -> get initial state
  2) Ask LLM: "given this state, which action?"
  3) Execute chosen action -> get new state
  4) Repeat until WIN / GAME_OVER / step limit
"""

import argparse
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

ROOT_URL_DEFAULT = "https://three.arcprize.org"
DEFAULT_ACTIONS = ["ACTION1", "ACTION2", "ACTION3", "ACTION4", "ACTION5", "ACTION6", "ACTION7"]

OLLAMA_URL = os.environ.get("OLLAMA_URL", "https://ollama.com")
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3-coder:480b-cloud")


# ─── .env loader ────────────────────────────────────────────────

def _read_env_file(path: str) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not os.path.exists(path):
        return values
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw_line in fh:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    except Exception:
        return {}
    return values


def _load_env():
    """Load .env and set globals from it."""
    global OLLAMA_URL, OLLAMA_API_KEY, OLLAMA_MODEL
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")),
    ]
    for env_path in candidates:
        vals = _read_env_file(env_path)
        if vals:
            if not OLLAMA_API_KEY and vals.get("OLLAMA_API_KEY"):
                OLLAMA_API_KEY = vals["OLLAMA_API_KEY"]
            if vals.get("OLLAMA_URL"):
                OLLAMA_URL = vals["OLLAMA_URL"]
            if vals.get("OLLAMA_MODEL"):
                OLLAMA_MODEL = vals["OLLAMA_MODEL"]
            break


def resolve_arc_api_key(cli_key: Optional[str] = None) -> Optional[str]:
    if cli_key:
        os.environ["ARC_API_KEY"] = cli_key
        os.environ["ARC_AGI_API"] = cli_key
        return cli_key

    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")),
    ]
    for env_path in candidates:
        values = _read_env_file(env_path)
        key = values.get("ARC_API_KEY") or values.get("ARC_AGI_API")
        if key:
            os.environ["ARC_API_KEY"] = key
            os.environ["ARC_AGI_API"] = key
            return key

    env_key = os.environ.get("ARC_API_KEY") or os.environ.get("ARC_AGI_API")
    if env_key:
        return env_key
    return None


# ─── Ollama LLM client ─────────────────────────────────────────

def _normalize_model_for_cloud(model: str) -> str:
    """Strip -cloud / :cloud suffix for direct Ollama Cloud API."""
    if "ollama.com" in OLLAMA_URL.lower():
        return re.sub(r"[-:]cloud$", "", model, flags=re.IGNORECASE)
    return model


def ollama_chat(messages: list, temperature: float = 0.3,
                max_tokens: int = 1024, model: Optional[str] = None) -> str:
    used_model = _normalize_model_for_cloud(model or OLLAMA_MODEL)
    payload = json.dumps({
        "model": used_model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature, "num_predict": max_tokens},
    }).encode()

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"

    url = f"{OLLAMA_URL.rstrip('/')}/api/chat"
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            return data.get("message", {}).get("content", "")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:500]
        print(f"  [LLM] HTTP {exc.code}: {body}", file=sys.stderr)
        return ""
    except Exception as exc:
        print(f"  [LLM] Error: {exc}", file=sys.stderr)
        return ""


# ─── ARC HTTP client ───────────────────────────────────────────

class ArcHttpClient:
    def __init__(self, root_url: str, api_key: str, timeout_s: int = 30) -> None:
        self.root_url = root_url.rstrip("/")
        self.timeout_s = timeout_s
        self.headers = {
            "X-API-Key": api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url=f"{self.root_url}{path}",
            data=body,
            headers=self.headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                raw = resp.read().decode("utf-8")
                if not raw.strip():
                    return {}
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code} {path}: {raw}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"Network error {path}: {e}") from e

    def list_games(self) -> List[Dict[str, Any]]:
        data = self._request("GET", "/api/games")
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        return []

    def open_scorecard(self, tags: List[str], source_url: str) -> Dict[str, Any]:
        return self._request("POST", "/api/scorecard/open", {"tags": tags, "source_url": source_url})

    def close_scorecard(self, card_id: str) -> Dict[str, Any]:
        return self._request("POST", "/api/scorecard/close", {"card_id": card_id})

    def command(
        self,
        action: str,
        game_id: str,
        card_id: str,
        guid: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"game_id": game_id, "card_id": card_id}
        if guid:
            payload["guid"] = guid
        if data:
            payload.update(data)
        return self._request("POST", f"/api/cmd/{action}", payload)


# ─── Action extraction ─────────────────────────────────────────

def _normalize_action_name(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, str):
        name = raw.split(".")[-1].strip().upper()
        if name.startswith("ACTION"):
            return name
    if isinstance(raw, dict):
        for key in ("name", "action", "id"):
            val = raw.get(key)
            if isinstance(val, str):
                name = _normalize_action_name(val)
                if name:
                    return name
    return None


def _extract_actions(resp: Dict[str, Any]) -> List[str]:
    raw_actions = resp.get("available_actions") or resp.get("actions") or []
    actions: List[str] = []
    if isinstance(raw_actions, list):
        for item in raw_actions:
            name = _normalize_action_name(item)
            if name and name not in actions:
                actions.append(name)
    return actions or DEFAULT_ACTIONS


# ─── Policies ──────────────────────────────────────────────────

def _truncate_state(resp: Dict[str, Any], max_chars: int = 3000) -> str:
    """Produce a compact representation of the game state for the LLM."""
    filtered = {}
    for k, v in resp.items():
        if k in ("guid",):
            continue
        filtered[k] = v
    raw = json.dumps(filtered, indent=1, default=str)
    if len(raw) > max_chars:
        raw = raw[:max_chars] + "\n... (truncated)"
    return raw


SYSTEM_PROMPT_ARC = """You are an expert ARC-AGI-3 game player. You analyze game states and choose optimal actions.

You receive:
- The game ID
- Available actions (ACTION1, ACTION2, ... ACTION7)
- The current game state (JSON from the ARC API)
- History of your recent actions and their outcomes

Your job: choose the SINGLE best action to take next, and if the action is ACTION6 (which requires x,y coordinates), also provide the coordinates.

STRATEGY GUIDELINES:
- Study the state carefully. Look for patterns, scores, level progress, any hints in the response.
- If a previous action improved the score or completed a level, consider repeating or building on it.
- If an action had no effect or reduced score, try a different one.
- ACTION6 with coordinates is often a spatial/grid interaction — try systematic positions.
- Try to complete levels. Each level completed is progress.
- Vary your approach if you're stuck — don't repeat the exact same failing sequence.

RESPOND WITH EXACTLY ONE LINE in this format:
  ACTION_NAME
or for ACTION6:
  ACTION6 x y

Examples:
  ACTION1
  ACTION3
  ACTION6 15 22

No explanation, no markdown, no extra text. Just the action line."""


def _ask_llm_for_action(
    game_id: str,
    step_idx: int,
    actions: List[str],
    current_state: Dict[str, Any],
    history: List[Dict[str, str]],
    model: Optional[str] = None,
) -> Tuple[str, Optional[Dict[str, int]]]:
    """Ask the LLM which action to take given current game state."""

    history_text = ""
    if history:
        recent = history[-8:]
        lines = []
        for h in recent:
            line = f"  Step {h['step']}: {h['action']}"
            if h.get('coords'):
                line += f" (x={h['coords']['x']}, y={h['coords']['y']})"
            line += f" → score={h.get('score', '?')}, state={h.get('result_state', '?')}"
            if h.get('levels_completed'):
                line += f", levels={h['levels_completed']}"
            lines.append(line)
        history_text = "\nRecent action history:\n" + "\n".join(lines)

    user_msg = f"""Game: {game_id}
Step: {step_idx}
Available actions: {', '.join(actions)}
{history_text}

Current game state:
{_truncate_state(current_state)}

Choose your next action:"""

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT_ARC},
        {"role": "user", "content": user_msg},
    ]

    response = ollama_chat(messages, temperature=0.2, max_tokens=64, model=model)
    return _parse_llm_action(response.strip(), actions)


def _parse_llm_action(
    text: str,
    available: List[str],
) -> Tuple[str, Optional[Dict[str, int]]]:
    """Parse the LLM's response into an action + optional coordinates."""
    if not text:
        return available[0] if available else "ACTION1", None

    # Take only the first non-empty line
    for line in text.strip().splitlines():
        line = line.strip()
        if line:
            text = line
            break

    # Check for ACTION6 with coordinates
    m = re.match(r"(ACTION\d+)\s+(\d+)\s+(\d+)", text, re.IGNORECASE)
    if m:
        action = m.group(1).upper()
        x = int(m.group(2))
        y = int(m.group(3))
        if action in available:
            return action, {"x": min(x, 29), "y": min(y, 29)}

    # Plain action name
    m = re.match(r"(ACTION\d+)", text, re.IGNORECASE)
    if m:
        action = m.group(1).upper()
        if action in available:
            data = None
            if action == "ACTION6":
                data = {"x": random.randint(0, 29), "y": random.randint(0, 29)}
            return action, data

    # Fallback: couldn't parse, use first available
    return available[0] if available else "ACTION1", None


def _sample_action_random(
    actions: List[str],
    rng: random.Random,
) -> Tuple[str, Optional[Dict[str, int]]]:
    """Random policy fallback."""
    action = rng.choice(actions) if actions else "ACTION1"
    data: Optional[Dict[str, int]] = None
    if action == "ACTION6":
        data = {"x": rng.randint(0, 29), "y": rng.randint(0, 29)}
    return action, data


# ─── Game play ─────────────────────────────────────────────────

def play_game(
    client: ArcHttpClient,
    game_id: str,
    card_id: str,
    max_steps: int,
    policy: str,
    seed: int,
    model: Optional[str] = None,
    llm_interval: int = 1,
) -> Dict[str, Any]:
    rng = random.Random(seed)
    first = client.command("RESET", game_id=game_id, card_id=card_id)
    guid = first.get("guid")
    state = str(first.get("state", "NOT_FINISHED"))
    local_score = float(first.get("score", 0.0) or 0.0)
    levels_completed = int(first.get("levels_completed", 0) or 0)
    actions_taken = 0
    last_resp = first
    history: List[Dict[str, str]] = []
    best_score = local_score

    for step_idx in range(max_steps):
        if state in ("WIN", "GAME_OVER"):
            break
        actions = _extract_actions(last_resp)

        # Choose action based on policy
        if policy == "search" and step_idx % llm_interval == 0:
            action, data = _ask_llm_for_action(
                game_id, step_idx, actions, last_resp, history, model=model,
            )
        elif policy == "random":
            action, data = _sample_action_random(actions, rng)
        else:
            # LLM on every step for "search" policy
            action, data = _ask_llm_for_action(
                game_id, step_idx, actions, last_resp, history, model=model,
            )

        last_resp = client.command(action, game_id=game_id, card_id=card_id, guid=guid, data=data)
        guid = last_resp.get("guid", guid)
        state = str(last_resp.get("state", state))
        actions_taken += 1

        try:
            step_score = float(last_resp.get("score", local_score) or local_score)
            local_score = max(local_score, step_score)
        except Exception:
            step_score = local_score

        try:
            levels_completed = max(levels_completed, int(last_resp.get("levels_completed", levels_completed) or levels_completed))
        except Exception:
            pass

        # Track history for LLM context
        h_entry: Dict[str, Any] = {
            "step": step_idx,
            "action": action,
            "score": step_score,
            "result_state": state,
            "levels_completed": levels_completed,
        }
        if data:
            h_entry["coords"] = data
        history.append(h_entry)

        # Progress logging
        if step_score > best_score:
            best_score = step_score
            print(f"    step {step_idx}: {action} → score improved to {step_score:.2f}", file=sys.stderr)
        elif step_idx % 50 == 0:
            print(f"    step {step_idx}: {action} → score={step_score:.2f}, levels={levels_completed}", file=sys.stderr)

    return {
        "game_id": game_id,
        "actions_taken": actions_taken,
        "levels_completed": levels_completed,
        "won": state == "WIN",
        "game_over": state == "GAME_OVER",
        "last_state": state,
        "local_score": local_score,
        "completed": True,
        "policy": policy,
        "model": model or OLLAMA_MODEL,
    }


# ─── Main runner ───────────────────────────────────────────────

def run(args: argparse.Namespace) -> None:
    _load_env()

    # CLI overrides
    global OLLAMA_URL, OLLAMA_API_KEY, OLLAMA_MODEL
    if args.ollama_url:
        OLLAMA_URL = args.ollama_url
    if args.ollama_key:
        OLLAMA_API_KEY = args.ollama_key
    if args.model:
        OLLAMA_MODEL = args.model

    api_key = resolve_arc_api_key(args.arc_api_key)
    if not api_key:
        print(json.dumps({"success": False, "error": "Missing ARC API key. Set ARC_API_KEY/ARC_AGI_API or pass --arc-api-key."}))
        return

    root_url = (args.root_url or os.environ.get("ARC_ROOT_URL") or ROOT_URL_DEFAULT).rstrip("/")
    client = ArcHttpClient(root_url=root_url, api_key=api_key)

    print(f"ARC-AGI-3 | model={OLLAMA_MODEL} | policy={args.policy} | steps={args.steps}", file=sys.stderr)

    games = client.list_games()
    if not games:
        print(json.dumps({"success": False, "error": "No games available from ARC API"}))
        return

    all_ids = [g.get("game_id") for g in games if isinstance(g.get("game_id"), str)]
    if args.list:
        listing = [{"game_id": g.get("game_id"), "title": g.get("title", g.get("game_id"))} for g in games]
        print(json.dumps({"success": True, "games": listing, "count": len(listing)}, indent=2))
        return

    if args.game:
        game_ids = [args.game]
    else:
        count = min(args.games, len(all_ids))
        if args.policy == "search":
            preferred_prefixes = ["ls20", "ft09", "vc33"]
            ordered: List[str] = []
            for prefix in preferred_prefixes:
                ordered.extend([gid for gid in all_ids if gid.startswith(prefix)])
            ordered.extend([gid for gid in all_ids if gid not in ordered])
            game_ids = ordered[:count]
        else:
            game_ids = random.sample(all_ids, count)

    opened = client.open_scorecard(
        tags=["agiprime", "ai", "llm-reasoning", f"model-{OLLAMA_MODEL.split(':')[0]}", f"run-{int(time.time())}"],
        source_url="https://github.com/AGIPRIME",
    )
    scorecard_id = str(opened.get("card_id") or opened.get("id") or "")
    if not scorecard_id:
        print(json.dumps({"success": False, "error": f"Failed to open scorecard: {opened}"}))
        return
    print(f"scorecard: {scorecard_id}", file=sys.stderr)

    results: List[Dict[str, Any]] = []
    base_seed = int(time.time())
    for idx, gid in enumerate(game_ids):
        print(f"Playing {gid} ({idx+1}/{len(game_ids)})...", file=sys.stderr)
        try:
            result = play_game(
                client=client,
                game_id=gid,
                card_id=scorecard_id,
                max_steps=args.steps,
                policy=args.policy,
                seed=base_seed + idx,
                model=args.model,
                llm_interval=args.llm_interval,
            )
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            result = {"game_id": gid, "completed": False, "error": str(e)}
        results.append(result)

    close_data: Dict[str, Any] = {}
    if not args.keep_open:
        try:
            close_data = client.close_scorecard(scorecard_id)
            print("scorecard closed", file=sys.stderr)
        except Exception as e:
            print(f"close failed: {e}", file=sys.stderr)

    final_score = close_data.get("score")
    if final_score is None:
        final_score = max((float(r.get("local_score", 0.0) or 0.0) for r in results), default=0.0)

    output = {
        "success": True,
        "scorecard_id": scorecard_id,
        "games_played": len(results),
        "results": results,
        "total_actions": sum(int(r.get("actions_taken", 0) or 0) for r in results),
        "games_won": sum(1 for r in results if r.get("won")),
        "score": float(final_score or 0.0),
        "scorecard_url": f"{root_url}/scorecards/{scorecard_id}",
        "model": OLLAMA_MODEL,
        "agent": f"{args.policy}-policy-llm",
        "timestamp": int(time.time()),
        "transport": "direct-api",
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ARC-AGI-3 LLM-driven runner for AGI PRIME")
    parser.add_argument("--game", type=str, help="Specific game_id to play")
    parser.add_argument("--games", type=int, default=1, help="Number of games to play")
    parser.add_argument("--steps", type=int, default=100, help="Max actions per game")
    parser.add_argument("--policy", choices=["search", "random"], default="search", help="Action policy (search=LLM-driven)")
    parser.add_argument("--search-trials", type=int, default=40, help="Reserved for future multi-trial search")
    parser.add_argument("--llm-interval", type=int, default=1, help="Call LLM every N steps (1=every step, 3=every 3rd)")
    parser.add_argument("--model", type=str, help="Override Ollama model")
    parser.add_argument("--arc-api-key", type=str, help="Explicit ARC API key (overrides env)")
    parser.add_argument("--root-url", type=str, help="ARC base URL (default: https://three.arcprize.org)")
    parser.add_argument("--ollama-url", type=str, help="Override Ollama API URL")
    parser.add_argument("--ollama-key", type=str, help="Override Ollama API key")
    parser.add_argument("--keep-open", action="store_true", help="Do not close scorecard at end of run")
    parser.add_argument("--list", action="store_true", help="List available games")
    run(parser.parse_args())
