#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
RELOAD="${RELOAD:-1}"
APP_MODULE="${APP_MODULE:-backend.main:app}"
VENV_DIR="${VENV_DIR:-venv}"
REQ_FILE="${REQ_FILE:-backend/requirements.txt}"

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

if ! python -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  echo "Installing backend dependencies into $VENV_DIR ..."
  python -m pip install --upgrade pip
  python -m pip install -r "$REQ_FILE"
fi

if [[ "$RELOAD" == "1" ]]; then
  exec python -m uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT" --reload
else
  exec python -m uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT"
fi
