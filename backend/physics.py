"""Versioned physics scene model and deterministic fallback simulator.

The fallback deliberately has no Box3D dependency.  It provides the API
contract used by the native adapter while keeping the application runnable
when the optional native library is not installed.
"""

from copy import deepcopy
from math import isfinite


PHYSICS_SCHEMA_VERSION = 1


def _number(value, default=0.0):
    return float(value) if isinstance(value, (int, float)) and isfinite(value) else default


def validate_scene(scene):
    if not isinstance(scene, dict):
        return ["scene must be an object"]
    errors = []
    if scene.get("schemaVersion", PHYSICS_SCHEMA_VERSION) != PHYSICS_SCHEMA_VERSION:
        errors.append(f"unsupported schemaVersion: {scene.get('schemaVersion')}")
    bodies = scene.get("bodies", [])
    if not isinstance(bodies, list):
        errors.append("bodies must be an array")
        return errors
    ids = set()
    for body in bodies:
        if not isinstance(body, dict) or not isinstance(body.get("id"), str):
            errors.append("every body requires a string id")
            continue
        if body["id"] in ids:
            errors.append(f"duplicate body id: {body['id']}")
        ids.add(body["id"])
        if _number(body.get("mass"), 1.0) < 0:
            errors.append(f"body {body['id']} mass must be non-negative")
        for fixture in body.get("fixtures", []):
            if fixture.get("shape", {}).get("type") not in {"box", "circle", "polygon"}:
                errors.append(f"body {body['id']} has an unsupported fixture shape")
    for joint in scene.get("joints", []):
        if joint.get("bodyA") not in ids or joint.get("bodyB") not in ids:
            errors.append(f"joint references an unknown body: {joint.get('id', '<unnamed>')}")
    return errors


def normalize_scene(scene):
    normalized = deepcopy(scene)
    normalized.setdefault("schemaVersion", PHYSICS_SCHEMA_VERSION)
    normalized.setdefault("mode", "physics")
    normalized.setdefault("gravity", {"x": 0.0, "y": -9.81})
    normalized.setdefault("fixedTimeStep", 1.0 / 60.0)
    normalized.setdefault("solverIterations", 8)
    normalized.setdefault("bodies", [])
    normalized.setdefault("fixtures", [])
    normalized.setdefault("joints", [])
    normalized.setdefault("motors", [])
    return normalized


class FallbackPhysicsWorld:
    """Small deterministic body integrator used until the native adapter exists."""

    def __init__(self, scene):
        errors = validate_scene(scene)
        if errors:
            raise ValueError("; ".join(errors))
        self.scene = normalize_scene(scene)
        self.time = 0.0
        gravity = self.scene["gravity"]
        self.gravity = (_number(gravity.get("x")), _number(gravity.get("y"), -9.81))
        self.bodies = {}
        for body in self.scene["bodies"]:
            position = body.get("position", {})
            velocity = body.get("velocity", {})
            self.bodies[body["id"]] = {
                "id": body["id"],
                "position": {"x": _number(position.get("x")), "y": _number(position.get("y"))},
                "angle": _number(body.get("angle")),
                "velocity": {"x": _number(velocity.get("x")), "y": _number(velocity.get("y"))},
                "angularVelocity": _number(body.get("angularVelocity")),
                "bodyType": body.get("bodyType", "dynamic"),
            }

    def reset(self):
        self.__init__(self.scene)

    def step(self, count=1, dt=None):
        dt = _number(dt, _number(self.scene.get("fixedTimeStep"), 1.0 / 60.0))
        count = max(0, min(int(count), 10_000))
        for _ in range(count):
            for body in self.bodies.values():
                if body["bodyType"] != "dynamic":
                    continue
                body["velocity"]["x"] += self.gravity[0] * dt
                body["velocity"]["y"] += self.gravity[1] * dt
                body["position"]["x"] += body["velocity"]["x"] * dt
                body["position"]["y"] += body["velocity"]["y"] * dt
                body["angle"] += body["angularVelocity"] * dt
            self.time += dt
        return self.state()

    def state(self):
        return {
            "schemaVersion": PHYSICS_SCHEMA_VERSION,
            "mode": "physics",
            "backend": "fallback",
            "time": self.time,
            "bodies": list(self.bodies.values()),
            "contacts": [],
            "constraintErrors": [],
            "warnings": ["native Box3D backend is not installed"],
        }
