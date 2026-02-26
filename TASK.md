# Linkage + Gear Web Simulator (Python-based)

## Goal
Create a **minimal, self-hosted web application** that visualizes and animates a **single rotating gear driving a linkage connected to a slider (piston-cylinder style)**.

This is **not a physics engine**. It is a **deterministic kinematic visualizer**.

The first version should be intentionally simple, correct, and extensible.

---

## Scope (V0 – Super Basic)

### Mechanism Topology
- One **rotating gear** (circle)
- One **crank pin / joint** mounted on the gear at a configurable radius
- One **connecting rod** (rigid linkage)
- One **slider** constrained to 1D linear motion (horizontal or vertical)

This is effectively:
> **Gear-driven crank → connecting rod → slider**

No collisions, no forces, no inertia.

---

## Non-Goals (Explicitly Out of Scope for V0)
- No gear meshing (only one gear)
- No involute teeth geometry
- No friction, torque, mass, or dynamics
- No arbitrary linkage graphs
- No multi-gear trains
- No persistence or saving (initially)

---

## Architecture

### Backend
- **Python 3.11+**
- **FastAPI** (preferred) or Flask
- Backend responsibilities:
  - Serve static frontend
  - Provide parameter defaults
  - Provide kinematic computation API (optional; can also be frontend-only math)

### Frontend
- Plain **HTML + CSS + JavaScript**
- Rendering via:
  - `<canvas>` **OR**
  - SVG (acceptable if simpler)
- No frontend frameworks required (React/Vue explicitly unnecessary)

---

## Coordinate System
- 2D Cartesian
- Origin `(0,0)` at center of gear
- Units are **arbitrary but consistent** (e.g. pixels == mm conceptually)

---

## Core Parameters (User-Adjustable)

### Gear
- `gear_radius` (float)
- `angular_speed` (rad/s)
- `initial_angle` (rad)

### Crank / Joint
- `crank_radius` (distance from gear center)
- `crank_angle_offset` (optional)

### Connecting Rod
- `rod_length`

### Slider
- `slider_axis`: `horizontal | vertical`
- `slider_offset` (distance from gear center line)

---

## Kinematic Model (Deterministic)

At time `t`:

1. Gear angle:
```

θ = initial_angle + angular_speed * t

```

2. Crank joint position:
```

x_c = crank_radius * cos(θ)
y_c = crank_radius * sin(θ)

```

3. Slider constraint:
- Slider moves only along its axis
- Slider position is solved via **circle–line intersection**
- One valid configuration chosen consistently (no flipping)

Example (horizontal slider at y = slider_offset):
```

(x - x_c)^2 + (slider_offset - y_c)^2 = rod_length^2

```

Solve for `x`.

---

## Rendering Requirements

### Must Draw
- Gear (circle)
- Gear center
- Crank pin (small filled circle)
- Connecting rod (line)
- Slider (rectangle constrained to axis)
- Slider guide (line or rail)

### Visual Clarity
- Different colors for:
  - Gear
  - Crank pin
  - Rod
  - Slider
- Show rotation direction (small arrow on gear)

---

## UI Controls (Minimal)

### Required
- Play / Pause
- Reset time
- Sliders or numeric inputs for:
  - Gear radius
  - Crank radius
  - Rod length
  - Angular speed

### Optional (Nice-to-have)
- Toggle axis orientation
- Show/hide construction geometry
- Display numeric slider position

---

## Update Loop
- Fixed timestep (e.g. `requestAnimationFrame`)
- Time tracked in seconds
- Deterministic output for same parameters

---

## File Structure (Initial)

```

linkage-gear-sim/
├─ backend/
│  ├─ main.py          # FastAPI app
│  └─ static/
│     ├─ index.html
│     ├─ app.js
│     └─ style.css
├─ TASK.md
└─ README.md

```

---

## API (Optional for V0)
If backend participates in math:

- `GET /api/state?t=...`
  - Returns computed positions:
    ```json
    {
      "gear_angle": 1.23,
      "crank": { "x": 12.3, "y": 4.5 },
      "slider": { "x": 56.7, "y": 10.0 }
    }
    ```

Frontend-only math is acceptable for V0.

---

## Validation Rules
- `crank_radius <= gear_radius`
- `rod_length > crank_radius`
- Slider solution must exist (otherwise show warning)

---

## Success Criteria (V0)
- You can open the app in a browser
- Press Play
- See a rotating gear
- See a joint on the gear driving a rod
- See a slider smoothly oscillating
- Parameter changes update motion live
- No console errors

---

## Planned Extensions (Not Implemented Yet)
- Second gear with ratio
- Gear meshing constraint
- Multiple linkages
- Export SVG / GIF
- Snap joints visually
- Save/load mechanism JSON

---

## Guiding Principle
> **Kinematics first, visuals second, physics never (unless explicitly added later).**

Keep everything inspectable, deterministic, and hackable.
