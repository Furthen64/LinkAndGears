# Linkage + Gear Web Simulator (Python-based)

## Goal
LinkAndGear is a **minimal, self-hosted web application** that visualizes and animates a **single rotating gear driving a linkage connected to a slider (piston-cylinder style)**.

This is **not a physics engine**. It is a **deterministic kinematic visualizer**.

The first version should be intentionally simple, correct, and extensible.

See TASK.md
## Run locally

1. Start the development server (uses a local `venv` virtual environment, no global install required):
   - `./run-backend.sh`
2. Open `http://127.0.0.1:8000` in your browser.

Optional direct run (if you manage dependencies yourself):
- `uvicorn backend.main:app --reload`


## Scene templates

Visual styling for the canvas scene is configurable via JSON templates in `backend/static/templates/`.
The app loads `default-scene.json` at runtime so colors, line widths, tooth density, and component sizes can be adjusted without changing JavaScript.
