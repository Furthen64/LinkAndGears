#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python}"

cd "$SCRIPT_DIR"
exec "$PYTHON_BIN" - <<'PY'
from copy import deepcopy
from math import isclose

from backend.physics import FallbackPhysicsWorld, PHYSICS_SCHEMA_VERSION, validate_scene

scene = {
    "schemaVersion": PHYSICS_SCHEMA_VERSION,
    "gravity": {"x": 0.0, "y": -9.81},
    "fixedTimeStep": 1.0 / 60.0,
    "bodies": [
        {
            "id": "probe",
            "bodyType": "dynamic",
            "position": {"x": 0.0, "y": 10.0},
            "velocity": {"x": 1.0, "y": 0.0},
        }
    ],
}

errors = validate_scene(scene)
if errors:
    raise SystemExit(f"valid scene rejected: {errors}")

world = FallbackPhysicsWorld(scene)
initial = deepcopy(world.state())
state = world.step(count=2)

if state["backend"] != "fallback":
    raise SystemExit(f"unexpected backend: {state['backend']}")
if not isclose(state["time"], 2.0 / 60.0):
    raise SystemExit(f"unexpected simulation time: {state['time']}")
body = state["bodies"][0]
if body["position"]["x"] <= initial["bodies"][0]["position"]["x"]:
    raise SystemExit("dynamic body did not advance on the x axis")
if body["position"]["y"] >= initial["bodies"][0]["position"]["y"]:
    raise SystemExit("gravity did not advance the body on the y axis")

world.reset()
reset_state = world.state()
if not isclose(reset_state["time"], 0.0) or reset_state["bodies"] != initial["bodies"]:
    raise SystemExit("reset did not restore the initial state")

print("Physics computation checks passed.")
PY
