#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo
echo "  ================================================================"
echo "     A G I   P R I M E"
echo "     The Ultimate AI Consciousness Platform"
echo "     Created by Aaron Grace"
echo "  ================================================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  [!] Node.js not found. Install from https://nodejs.org"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "  [*] First run — installing dependencies..."
  npm install
  echo "  [+] Dependencies installed."
fi

echo "  [*] Starting AGI PRIME..."
echo
exec npm run dev
