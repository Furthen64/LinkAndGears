#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CC_BIN="${CC:-cc}"
PYTHON_BIN="${PYTHON_BIN:-python}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "Host compatibility check failed: $*" >&2
  exit 1
}

host_value() {
  "$@" 2>/dev/null || echo unknown
}

command -v "$CC_BIN" >/dev/null 2>&1 || fail "C compiler not found: $CC_BIN"
command -v cargo >/dev/null 2>&1 || fail "cargo is not installed"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || fail "Python is not available: $PYTHON_BIN"

echo "Host: $(host_value uname -s) $(host_value uname -m)"
echo "C compiler: $("$CC_BIN" --version 2>/dev/null | head -n 1)"
echo "Rust: $(rustc --version)"
echo "Python: $("$PYTHON_BIN" --version 2>&1)"

"$CC_BIN" \
  -std=c11 -Wall -Wextra -Werror \
  -I"$SCRIPT_DIR/native" \
  "$SCRIPT_DIR/native/box3d_adapter.c" \
  "$SCRIPT_DIR/native/box3d_adapter_probe.c" \
  -o "$TMP_DIR/box3d_adapter_probe"

"$TMP_DIR/box3d_adapter_probe"

cargo check --manifest-path "$SCRIPT_DIR/native/rust/Cargo.toml" --quiet

echo "Host compatibility checks passed."
