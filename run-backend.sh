#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
RELOAD="${RELOAD:-1}"
APP_MODULE="${APP_MODULE:-backend.main:app}"
REQ_FILE="${REQ_FILE:-backend/requirements.txt}"

if [[ -z "${VIRTUAL_ENV:-}" ]]; then
  echo "No virtual environment is active."
  echo "Activate one first, for example: source venv/bin/activate"
  exit 1
fi

if ! python -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  echo "Installing backend dependencies into $VIRTUAL_ENV ..."
  python -m pip install --upgrade pip
  python -m pip install -r "$REQ_FILE"
fi

if [[ "$RELOAD" == "1" ]]; then
  exec python -m uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT" --reload
else
  exec python -m uvicorn "$APP_MODULE" --host "$HOST" --port "$PORT"
fi
