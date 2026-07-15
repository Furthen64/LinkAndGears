#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
RELOAD="${RELOAD:-1}"
APP_MODULE="${APP_MODULE:-backend.main:app}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/0.checkreqs.sh"

if [[ "$RELOAD" == "1" ]]; then
  exec python -m uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT" --reload
else
  exec python -m uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT"
fi
