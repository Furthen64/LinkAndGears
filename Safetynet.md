Below is an **additive specification section** you can append to the 
existing `TASK.md`. It is intentionally concrete and defensive, assuming 
numerical/logic bugs will happen early.


## Runtime Sanity Monitor (V0.1 – Defensive Debug Layer)

### Purpose
Detect **numerical instability, invalid geometry, or runaway kinematics** early and stop the simulation before it visually explodes or silently corrupts state.

This system acts as a **watchdog**, not a fixer.

---

## Design Principles
- Cheap to compute
- Deterministic
- Fail-fast
- Explain *why* the simulation stopped
- Zero physics assumptions (pure kinematics)

---

## Monitoring Strategy

### Sampling Window
- Evaluate every **N frames** (default: `N = 10`)
- Maintain a rolling window of the last **M samples** (default: `M = 5`)

This avoids reacting to single-frame spikes.

---

## Observed Entities

### Required
- Crank pin
- Slider
- (Optional later) rod midpoint

Each entity tracks:
- Position `(x, y)`
- Instantaneous velocity magnitude
- Average velocity over window

---

## Velocity Computation

For each tracked entity:

```

v = distance(p_now, p_prev) / Δt

```

Where:
- `Δt` is real frame delta time
- Distance is Euclidean

Maintain:
- `v_inst` (last sample)
- `v_avg` (mean over window)

---

## Sanity Thresholds (Initial Defaults)

These are **relative**, not absolute.

### Hard Stop Conditions
Simulation halts immediately if **any** condition is met:

- Any coordinate is `NaN` or `Infinity`
- Slider solution does not exist
- Rod length constraint violated by > 1%
- Velocity exceeds `MAX_SPEED = K × angular_speed × gear_radius`

Where:
```

K = 10.0   (tunable safety multiplier)

```

This ties acceptable speed to expected angular motion.

---

## Soft Warning Conditions
Logged but does not immediately stop unless persistent:

- Sudden velocity jump:
```

v_inst > 5 × v_avg

```
- Oscillation flip detected (slider jumps sides)
- Rod angle changes > 120° between samples

If the same warning occurs in **2 consecutive checks**, escalate to hard stop.

---

## Simulation Halt Behavior

When halted:
- Animation loop stops
- Controls are disabled except:
- Reset
- Parameter edit
- Current frame remains visible
- Debug overlay opens automatically

---

## Debug Overlay (Required UI)

A fixed panel or modal showing:

### Header
```

⚠ Simulation halted — Sanity Monitor triggered

````

### Reason (exact condition)
Examples:
- `Slider position became NaN`
- `Crank pin speed exceeded limit (4120 > 980)`
- `Rod constraint violation (error = 3.4%)`

### Snapshot Data
- Frame number
- Time `t`
- Angular speed
- All tracked positions
- Last velocities (inst + avg)

### Suggested Fix (heuristic text)
Examples:
- “Rod length too short for crank radius”
- “Angular speed too high for current geometry”
- “Slider offset unreachable”

---

## Visual Debug Aids (Optional but Valuable)

When halted:
- Highlight offending entity in red
- Draw rod constraint error visually
- Draw last valid vs current position ghost

---

## Configuration Knobs (Dev-Only)
Exposed in a debug config block:

```js
monitor = {
  enabled: true,
  frameInterval: 10,
  windowSize: 5,
  speedMultiplier: 10.0,
  jumpMultiplier: 5.0
}
````

Must be tweakable without rebuild.

---

## Logging

All monitor events should be logged to:

* Console
* Internal circular log buffer (last ~100 events)

This enables future “export debug log” functionality.

---

## Success Criteria

* Broken geometry does not cause canvas explosions
* Simulation halts predictably
* User can understand *why* it stopped
* Debug info is actionable, not vague

---

## Explicit Non-Goals

* No automatic correction
* No silent clamping
* No “best guess” fixes

If it’s wrong, **stop and explain**.

