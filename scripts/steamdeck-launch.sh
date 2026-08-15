#!/usr/bin/env bash
# Launch a packaged AGI PRIME AppImage on Steam Deck (Desktop Mode or as a
# non-Steam game). Steam's runtime can block Chromium's sandbox, so this
# wrapper uses the AppImage extract-and-run path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export STEAMDECK="${STEAMDECK:-1}"
export APPIMAGE_EXTRACT_AND_RUN="${APPIMAGE_EXTRACT_AND_RUN:-1}"

APPIMAGE=""
if [[ -n "${1:-}" && -f "$1" ]]; then
  APPIMAGE="$1"
  shift
else
  shopt -s nullglob
  candidates=(
    "$ROOT"/release/*.AppImage
    "$ROOT"/*.AppImage
    "$HOME"/Applications/AGI-PRIME*.AppImage
    "$HOME"/Desktop/AGI-PRIME*.AppImage
  )
  if ((${#candidates[@]})); then
    APPIMAGE="${candidates[0]}"
  fi
fi

if [[ -z "$APPIMAGE" ]]; then
  echo "AGI PRIME AppImage not found."
  echo "Build it with: npm run dist:steamdeck"
  echo "Or pass the AppImage path: $0 /path/to/AGI-PRIME.AppImage"
  exit 1
fi

chmod +x "$APPIMAGE" 2>/dev/null || true
exec "$APPIMAGE" --no-sandbox --ozone-platform-hint=auto "$@"
