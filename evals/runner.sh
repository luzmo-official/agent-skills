#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRIVER="$ROOT_DIR/evals/lib/driver.py"

if [[ -f "$ROOT_DIR/evals/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/evals/.env.local"
  set +a
fi

exec python3 "$DRIVER" "$@"
