# Linkage + Gear Web Simulator (Python-based)

## Overview

LinkAndGear is a **self-hosted web application** designed to visualize and animate a **gear-driven linkage mechanism**. It simulates a deterministic kinematic system where a rotating gear drives a crank, which is connected to a slider (piston-cylinder style). This tool is ideal for educational purposes, prototyping, and exploring basic kinematic systems.

This is **not a physics engine**. It focuses solely on deterministic kinematics without considering forces, collisions, or dynamics.

## Features

- **Mechanism Topology**:
  - Single rotating gear with a configurable crank pin.
  - Rigid connecting rod linking the crank to a slider.
  - Slider constrained to 1D linear motion (horizontal or vertical).
- **Customizable Parameters**:
  - Gear radius, angular speed, and initial angle.
  - Crank radius and offset.
  - Connecting rod length.
  - Slider axis orientation and offset.
- **Rendering**:
  - Clear visualization of all components (gear, crank, rod, slider).
  - Configurable scene templates for colors, sizes, and styles.
- **UI Controls**:
  - Play/Pause simulation.
  - Reset time.
  - Adjust parameters via sliders or numeric inputs.

## Run Locally

1. **Start the development server**:
   - Activate the virtual environment: `source venv/bin/activate`
   - Run the backend: `./run-backend.sh`
2. **Access the application**:
   - Open `http://127.0.0.1:8000` in your browser.

Alternatively, you can run the app directly using Uvicorn:
`uvicorn backend.main:app --reload`

## File Structure

```
LinkAndGear/
├─ backend/
│  ├─ main.py          # FastAPI app
│  └─ static/
│     ├─ index.html    # Frontend entry point
│     ├─ app.js        # Core simulation logic
│     ├─ style.css     # Styling
│     ├─ templates/    # JSON scene templates
│     └─ workspaces/   # Example configurations
├─ TASK.md             # Development goals and scope
├─ README.md           # Project documentation
```

## Scene Templates

Scene templates are JSON files located in `backend/static/templates/`. These templates allow you to configure the visual appearance of the simulation, including:

- Colors
- Line widths
- Tooth density
- Component sizes

The default template is `default-scene.json`, but you can create and load custom templates.

## Debug Globals (Optional)

The app no longer always exposes `LinkAndGearsApp`, `LinkAndGearsController`,
`LinkAndGearsKinematics`, and `LinkAndGearsRenderer` on `globalThis`.
Those globals are **only** exposed when an explicit debug flag is enabled.

You can enable debug globals in either of these ways:

- URL param: open the app with `?debug_globals=1` (also accepts `true`, `yes`, or `on`)
- Pre-bootstrap global flag:
  `window.__LINK_AND_GEARS_DEBUG_GLOBALS__ = true`

This keeps the default runtime clean for embedding while still allowing
browser-console debugging when intentionally enabled.
