# kinematics.js Reference

## Purpose

`kinematics.js` is the simulation math layer. It validates canonical gear parameters, resolves scene-graph gear relationships, computes angular motion through gear meshes, and solves the slider-crank position for the current time.

It serves two related use cases:

- validating whether a scene configuration is mechanically coherent,
- producing the live render state consumed by `renderer.js` and `controller.js`.

## Exported Constants

### `MIN_PRACTICAL_TOOTH_COUNT`

Set to `6`.

Used by `validateGearParams` to reject unrealistically small tooth counts for the canonical driver and driven gears.

### `CENTER_DISTANCE_TOLERANCE`

Set to `1e-6`.

Used when comparing expected center distance against actual center distance for meshed gears.

This keeps the graph solver strict enough to catch invalid geometry while tolerating tiny floating-point error.

## Helper Functions

### `toFiniteNumber(value, fallback = 0)`

Returns `value` when it is finite, otherwise returns `fallback`.

This is the file’s basic numeric sanitation helper. It prevents `NaN` from leaking through geometric calculations unless the code deliberately wants to signal invalid state.

### `getNodeRadius(node, sceneDefaults = {})`

Computes a usable radius for a gear node.

Resolution order:

1. use `node.radius` when `radiusMode === "manual"` and the radius is positive,
2. otherwise derive radius from `module * toothCount / 2`,
3. otherwise fall back to any positive `node.radius`,
4. otherwise return `NaN`.

Important detail:

It can derive module and tooth count from either the node or `sceneDefaults`, which lets the solver handle partially specified nodes.

### `getNodeCenter(node)`

Returns a normalized `{ x, y }` center for a node.

Accepted source fields:

- `node.center`
- `node.pose`

Each component is sanitized with `toFiniteNumber`, so missing coordinates collapse to zero instead of breaking the solver immediately.

### `resolveGraphRootGear(sceneGraph = {})`

Determines the root gear ID for a scene graph.

Resolution order:

1. `sceneGraph.rootNodeId` if it exists in `nodeRegistry` and is a motor or gear,
2. `"motor-1"` if present,
3. otherwise the raw configured root ID.

This is the canonical root resolution helper used by the higher-level state solver.

### `resolvePrimaryDrivenGear(sceneGraph = {}, rootId = "motor-1")`

Determines the primary driven gear connected to the root.

How it works:

- looks up the root node in `nodeRegistry`,
- scans other nodes for a gear whose attachment points to the root,
- falls back to `"gear-1"` if available,
- otherwise falls back to the root itself.

This keeps the canonical driver/driven pair working even when the graph is sparse or partially customized.

### `nodeRegistryToGearList(sceneGraph = {}, params = {})`

Converts a scene graph into a flat gear list suitable for the solver.

Sources considered:

- `sceneGraph.nodeRegistry`,
- fallback `sceneGraph.gears`,
- fallback `sceneGraph.extraGears`.

Normalized fields include:

- `id`,
- `angle`,
- `angularSpeed`,
- `module`,
- `toothCount`,
- `radiusMode`,
- `radius`,
- `center`,
- `meshWith`,
- `parentId`,
- `role`,
- `showIndicator`.

This function is important because it translates editor-oriented graph data into solver-oriented node data.

## Validation

### `validateGearParams(params)`

Checks that the canonical gear inputs are mechanically plausible.

It validates:

- module must be positive when provided,
- tooth counts must be integers when provided,
- tooth counts must be at least `MIN_PRACTICAL_TOOTH_COUNT`,
- center distance must equal the sum of pitch radii when all three values are present.

Return shape:

- `{ valid: true }` on success,
- `{ valid: false, reason }` on failure.

This is the fast preflight validation step used before the full scene solver runs.

## Scene-Graph Gear Solver

### `computeSceneState(sceneGraph, t)`

Resolves the angular state of every gear node in a scene graph at time `t`.

Input flexibility:

- accepts a raw array of gears,
- or an object with `gears`,
- or an object with `nodes`.

What it builds:

- `gearsById`: normalized gear nodes keyed by ID,
- `jointsById`: normalized joint nodes keyed by ID.

How the solver works:

1. Normalizes each gear node and validates uniqueness and radius.
2. Determines the root node.
3. Repeatedly resolves unresolved nodes until no unresolved nodes remain or progress stops.
4. Assigns angular speed and angle based on either direct input speed or parent mesh ratio.

Root gear behavior:

- if a node is a motor or identified root, it does not depend on a parent,
- its angular speed comes from `inputAngularSpeed`, defaulting to zero,
- its angle evolves as:

$$
	heta(t) = \theta_0 + \omega t
$$

Meshed gear behavior:

- the node must have a resolved parent,
- center distance must equal `parent.radius + node.radius` within tolerance,
- angular speed is computed by radius ratio:

$$
\omega_{child} = -\omega_{parent} \cdot \frac{r_{parent}}{r_{child}}
$$

- angle is updated from the parent’s traveled angle plus optional phase offset.

Unmeshed child behavior:

- if the node has a parent but no `meshWith`, it can either inherit explicit speed or reuse the parent angular speed.

Failure modes:

- missing IDs,
- duplicate IDs,
- missing parent references,
- invalid radii,
- illegal root dependencies,
- center-distance mismatches,
- dependency cycles or missing root speed.

Return shape:

- valid state with `gearsById` and `jointsById`,
- or invalid state with `invalidCategory`, `invalidReason`, and whatever partial maps were built.

## High-Level Mechanism State Solver

### `computeState(params, t)`

This is the main export used by the controller.

It combines:

- canonical gear parameter validation,
- scene-graph gear solving,
- slider-crank geometry solving.

### Phase 1: Validate canonical inputs

It first calls `validateGearParams(params)`. If validation fails, it returns a fully shaped invalid state object with `NaN` geometry placeholders.

It then checks that:

- `driver_radius` is positive,
- `gear_radius` is positive.

### Phase 2: Resolve graph context

The function identifies:

- root gear ID,
- driven gear ID,
- root and driven registry nodes,
- module and tooth counts to use for fallback graph construction.

It then builds a solver-friendly gear list from either the scene graph or a canonical fallback pair.

### Phase 3: Solve gear motion

It calls `computeSceneState(...)` using a normalized graph description.

On success it extracts:

- `driverTheta`,
- `drivenTheta`,
- a render-friendly `gearNodes` array,
- base crank orientation.

### Phase 4: Compute crank point

The crank pin position is:

$$
x = r_c \cos(\theta)
$$

$$
y = r_c \sin(\theta)
$$

where `theta = drivenTheta + crank_angle_offset`.

### Phase 5: Solve slider position

For a horizontal slider axis:

- the slider `y` coordinate is fixed to `slider_offset`,
- the rod-length constraint is solved for `x`,
- the larger of the two real roots is chosen.

For a vertical slider axis:

- the slider `x` coordinate is fixed to `slider_offset`,
- the rod-length constraint is solved for `y`,
- the larger of the two real roots is chosen.

If the discriminant is negative, the mechanism has no real intersection and the state is returned as invalid.

### Returned fields

Important fields in the final result include:

- `valid`
- `invalidCategory`
- `invalidReason`
- `gear_angle`
- `driver_angle`
- `rootGearId`
- `drivenGearId`
- `gearsById`
- `gearNodes`
- `jointsById`
- `crank`
- `slider`

This shape is designed to support both rendering and UI inspection.

## Global Export

When `globalThis` exists, the file publishes `LinkAndGearsKinematics` with:

- `computeState`
- `computeSceneState`
- `validateGearParams`
- `MIN_PRACTICAL_TOOTH_COUNT`
- `CENTER_DISTANCE_TOLERANCE`

This makes the solver accessible from the browser console and non-module integrations.

## Summary

`kinematics.js` is the mathematical core of the app. It validates parameters, infers radii and centers from partially specified nodes, propagates angular motion through the gear graph, and solves the slider-crank position that the renderer ultimately displays.
