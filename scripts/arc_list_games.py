import json
import os
import urllib.error
import urllib.request

ROOT_URL_DEFAULT = "https://three.arcprize.org"


def _read_env_file(path: str) -> dict:
    values = {}
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


def resolve_arc_api_key() -> str | None:
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

    key = os.environ.get("ARC_API_KEY") or os.environ.get("ARC_AGI_API")
    if key:
        os.environ["ARC_API_KEY"] = key
        os.environ["ARC_AGI_API"] = key
        return key
    return None


def list_games(root_url: str, api_key: str) -> list[dict]:
    req = urllib.request.Request(
        url=f"{root_url.rstrip('/')}/api/games",
        headers={"X-API-Key": api_key, "Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data if isinstance(data, list) else []
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        print(f"error: HTTP {e.code} /api/games -> {raw}")
        return []
    except Exception as e:
        print(f"error: {e}")
        return []


def main() -> None:
    api_key = resolve_arc_api_key()
    if not api_key:
        print("error: missing ARC API key (ARC_API_KEY or ARC_AGI_API)")
        return

    root_url = os.environ.get("ARC_ROOT_URL", ROOT_URL_DEFAULT)
    games = list_games(root_url=root_url, api_key=api_key)
    print("count", len(games))
    print([g.get("game_id") for g in games if isinstance(g, dict)])


if __name__ == "__main__":
    main()
