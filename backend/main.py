from pathlib import Path
from threading import Lock

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .physics import FallbackPhysicsWorld, PHYSICS_SCHEMA_VERSION, validate_scene

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
physics_world = None
physics_world_lock = Lock()


@app.get("/", include_in_schema=False)
def read_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/v1/physics/validate")
def validate_physics_scene(scene: dict):
    errors = validate_scene(scene)
    return {"schemaVersion": PHYSICS_SCHEMA_VERSION, "valid": not errors, "errors": errors}


@app.post("/api/v1/physics/reset")
def reset_physics_scene(scene: dict):
    global physics_world
    with physics_world_lock:
        physics_world = FallbackPhysicsWorld(scene)
        return physics_world.state()


@app.post("/api/v1/physics/step")
def step_physics_scene(request: dict):
    with physics_world_lock:
        if physics_world is None:
            return {"valid": False, "error": "physics world is not initialized"}
        return physics_world.step(request.get("steps", 1), request.get("dt"))


@app.get("/api/v1/physics/state")
def read_physics_state():
    with physics_world_lock:
        if physics_world is None:
            return {"valid": False, "error": "physics world is not initialized"}
        return physics_world.state()
