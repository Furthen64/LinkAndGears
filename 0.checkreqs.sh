#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQ_FILE="${REQ_FILE:-$SCRIPT_DIR/backend/requirements.txt}"
VENV_HINT="${VENV_HINT:-venv}"

if [[ -z "${VIRTUAL_ENV:-}" ]]; then
  echo "No virtual environment is active."
  echo "Activate one first, for example: source $VENV_HINT/bin/activate"
  exit 1
fi

if ! command -v python >/dev/null 2>&1; then
  echo "python is not available in the active virtual environment."
  exit 1
fi

if [[ ! -f "$REQ_FILE" ]]; then
  echo "Requirements file not found: $REQ_FILE"
  exit 1
fi

if ! python -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  echo "Installing backend dependencies into $VIRTUAL_ENV ..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$VIRTUAL_ENV/bin/python" --upgrade pip
    uv pip install --python "$VIRTUAL_ENV/bin/python" -r "$REQ_FILE"
  else
    if ! python -m pip --version >/dev/null 2>&1; then
      echo "pip is not available in the active virtual environment, and uv is not installed."
      exit 1
    fi

    python -m pip install --upgrade pip
    python -m pip install -r "$REQ_FILE"
  fi
fi

echo "Python environment checks passed: $VIRTUAL_ENV"
echo "Next: run ./1.launch.sh to start the backend server."
