# renderer.js Reference

## Purpose

`renderer.js` is the canvas rendering layer for the LinkAndGears frontend. It takes canonical mechanism parameters, the current simulation state, scene styling, and optional camera/view settings, then:

- computes the world-to-canvas transform,
- derives renderable gear and joint nodes from the scene graph,
- draws the grid, gears, linkage, slider, rails, and selection affordances,
- returns hit-test regions used by the UI for object picking,
- exposes metadata about selected objects for inspector panels.

The file is not just a painter. It also contains a fair amount of view-model logic: scene graph normalization, fallback geometry generation, selection slot placement, and object-detail formatting.

## Main Exports

### `createTransform(canvas, params, camera = {})`

Builds a coordinate transform object that converts between world coordinates and canvas coordinates.

What it does:

- Estimates the maximum scene extent from the linkage, gear train, and slider offset.
- Creates a symmetric world box from `-extent` to `+extent` in both axes.
- Computes a `baseScale` that fits that box into the canvas with fixed padding.
- Applies camera zoom and pan on top of the base scale.

Returned API:

- `baseScale`: the scale required to fit the whole nominal scene.
- `zoom`: validated zoom factor, defaulting to `1`.
- `panX` / `panY`: validated camera offsets in world units.
- `scale`: the effective canvas scale after zoom is applied.
- `toCanvas(point)`: converts a world-space point into canvas pixels.
- `toWorld(point)`: converts a canvas-space point into world coordinates.
- `toCanvasLength(length)`: converts a world-space scalar length into pixels.

Why it matters:

Every subsequent draw and hit-test operation uses this transform. If scaling, centering, or pan handling is wrong here, the entire view becomes inconsistent.

### `objectDetails(selection, params, state)`

Builds the object-inspector payload for the currently selected scene object.

What it does:

- Detects which canonical scene elements exist in the active scene graph.
- Reconstructs normalized gear nodes and joint nodes so selection IDs can be resolved consistently.
- Computes current linkage lengths from the live state instead of only showing canonical values.
- Returns `{ title, details }`, where `details` is a list of label/value pairs for the UI.

Selection handling includes:

- individual gear nodes,
- canonical driven gear / motor gear aliases,
- linkage, ground, and slider objects,
- dynamic joint-anchor nodes,
- unknown scene nodes as a fallback.

Why it matters:

The inspector panel can stay decoupled from raw simulation state because this function centralizes how the renderer interprets selection IDs.

### `drawScene(ctx, canvas, params, state, scene, selectedObject, options = {}, camera = {})`

This is the top-level render entry point.

What it does in order:

1. Determines which scene objects exist from `params.scene_graph.nodeRegistry`.
2. Creates the transform with `createTransform`.
3. Builds normalized gear and joint node lists.
4. Clears the canvas and draws the background grid.
5. Draws the slider rail when ground is present.
6. Draws all gears and optional angular indicators.
7. Draws the crank arm, connecting rod, crank pin, and slider block when present.
8. Draws joint-anchor nodes and their dashed parent attachment lines.
9. Draws selection highlights and gear placement slots.
10. Builds and returns hit regions for interactive picking.

Why it matters:

This function is the integration point where geometry derivation, styling, user selection, and interaction all come together.

## Helper Functions

### `clampToPositive(value, fallback = 1)`

Small validation helper that returns `value` only when it is finite and strictly positive; otherwise it returns `fallback`.

Used for:

- tooth depth factors,
- minimum pixel depths,
- tooth count fallbacks,
- grid spacing inputs.

Its role is defensive: the renderer keeps drawing even when configuration data is incomplete or invalid.

### `getGearGeometry(radiusWorld, params, gearScene, t, toothCountOverride, moduleOverride = Number.NaN)`

Computes the rendered geometry for a gear tooth profile.

Inputs it considers:

- the gear radius in world units,
- canonical parameter defaults from `params`,
- scene-style overrides from `gearScene`,
- the transform `t`,
- optional tooth count and module overrides.

What it calculates:

- `pitchRadiusPx`: the pitch radius in pixels,
- `toothCount`: either an explicit value or a fallback derived from scene rules,
- `tipRadiusPx`: pitch radius plus addendum,
- `rootRadiusPx`: pitch radius minus dedendum, clamped to a minimum.

Important behavior:

- If a valid module is available, addendum and dedendum are based on standard-ish module proportions.
- If not, the function falls back to style-driven proportional tooth depth.
- It enforces minimum visible tooth depth in pixels so small gears remain readable on screen.

This function is what turns abstract gear parameters into something the canvas can actually draw.

### `drawGearBody(ctx, center, angle, geometry, style)`

Draws the filled gear tooth silhouette.

How it works:

- Splits the full circle into `geometry.toothCount` teeth.
- For each tooth, computes four polar points: root start, tip start, tip end, root end.
- Converts those polar points into Cartesian canvas coordinates around `center`.
- Builds one continuous closed path for the whole gear.
- Fills the gear, then clips and strokes so the outline stays within the tooth profile.

Notable detail:

The clipped stroke avoids a thick external outline that would visually distort the perceived tooth meshing boundary.

### `normalizeGearNode(rawNode, fallback, index = 0)`

Normalizes a raw gear node from scene state into the renderer's expected shape.

What it standardizes:

- `id`,
- `center`,
- `radius`,
- `toothCount`,
- `angle`,
- `angularSpeed`,
- `module`,
- parent/mesh relationships,
- render-role and visibility flags,
- `zIndex` ordering.

Important behavior:

- Accepts both `center` and `position` field names.
- Accepts both `toothCount` and `teeth`.
- Accepts both `angularSpeed` and `omega`.
- Preserves resilience by falling back to a supplied canonical node definition.

This allows the rest of the renderer to work with a single consistent node format even when input state varies.

### `getGearToothPhaseOffset(node, geometry)`

Returns an angular phase offset used when drawing gear teeth.

Behavior:

- driver gears get a half-tooth offset,
- all other gears get no offset.

This slightly rephases the driver gear so its rendered tooth alignment better matches the intended meshing relationship.

### `resolveGraphRootGearId(params = {}, state = {})`

Finds the effective root gear ID.

Resolution order:

1. `state.rootGearId` if present,
2. `params.scene_graph.rootNodeId` if present and registered,
3. fallback to `"motor-1"`.

This decouples the renderer from hardcoded IDs while still supporting legacy defaults.

### `resolveDrivenGearId(params = {}, state = {}, rootGearId = "motor-1")`

Finds the effective driven gear ID.

Resolution order:

1. `state.drivenGearId` if present,
2. first gear in the scene graph attached to the root gear,
3. fallback to `"gear-1"` if it exists,
4. otherwise fallback to the root gear ID.

This supports both explicit runtime IDs and scene-graph-derived relationships.

### `computeGearNodes(params, state)`

Builds the final list of renderable gear nodes.

What it does:

- Computes default driver and driven gear definitions from canonical parameters.
- Pulls node overrides from the scene graph registry.
- Handles optional extra gear nodes beyond the basic driver/driven pair.
- Uses live `state.gearNodes` or `state.gear_nodes` when available.
- Falls back to canonical defaults when no dynamic node list exists.

Notable detail:

The default driven gear angular speed is derived from the radius ratio:

$$
\omega_{driven} = -\omega_{driver} \cdot \frac{r_{driver}}{r_{driven}}
$$

So the function is doing both structural reconstruction and some kinematic inference.

### `computeSceneAnchorPoints(params = {}, state = {}, gearNodes = [])`

Creates a lookup table of world-space anchor points for scene nodes.

Sources included:

- every valid gear node center,
- the canonical linkage anchor at `linkage-1` when `gear-1` exists,
- the slider position when present in live state,
- the ground anchor derived from slider axis and slider offset.

This table is later used to position joint-anchor nodes relative to their parents.

### `computeJointNodes(params = {}, state = {}, gearNodes = [])`

Builds a normalized list of renderable joint-anchor nodes.

How it works:

- Reads all scene-graph nodes of type `joint-anchor`.
- Uses `computeSceneAnchorPoints` to resolve parent anchor locations.
- Honors an explicit node center when one is provided.
- Otherwise auto-places the joint around its parent using a small radial fan layout.
- Tracks sibling counts per parent so multiple auto-placed joints do not overlap perfectly.

Returned fields:

- `id`,
- `label`,
- `parentId`,
- `center`.

This gives the UI a concrete visual position for joint nodes even when the scene data only defines logical relationships.

### `drawGearNode(ctx, transform, params, scene, node)`

Draws a single gear node and any center/hub decoration associated with it.

What it does:

- resolves the appropriate render style,
- computes gear geometry,
- converts the gear center to canvas coordinates,
- applies the tooth phase offset,
- draws the body,
- optionally draws the motor hub,
- optionally draws the center marker.

Return value:

- `centerCanvas`, used later for selection and overlays,
- `geometry`, used later for indicators and hit testing.

### `drawGearIndicator(ctx, scene, node, centerCanvas, geometry, fallbackAngularSpeed = Number.NaN)`

Draws a circular rotation indicator near a gear's outer edge.

What it encodes:

- the angular position of the gear,
- the direction/sign of rotation through color choice,
- scene-configured radius, stroke, fill, and line width.

Behavior:

- positive or known speeds use the primary color,
- negative or unresolved speeds use the secondary color.

This is a compact visual cue for rotation state without drawing arrows or labels.

### `distanceToSegment(point, a, b)`

Geometric helper for hit testing.

What it does:

- projects `point` onto the line segment from `a` to `b`,
- clamps the projection to the segment bounds,
- returns the Euclidean distance from `point` to that clamped projection.

Used to make the linkage selectable even though it is drawn as thin lines.

### `formatValue(value, digits = 3)`

Formats numeric inspector values.

Behavior:

- finite values are rendered with fixed precision,
- invalid values become `"N/A"`.

This keeps object inspector output predictable and easy to scan.

### `chooseGridSpacing(scale, minPixels = 30, maxPixels = 80)`

Chooses a visually reasonable world-space grid spacing for the current zoom level.

How it works:

- derives a target world distance from the desired on-screen pixel spacing,
- generates candidate spacings using a `1, 2, 5, 10` progression across adjacent powers of ten,
- scores candidates by closeness to the target pixel density,
- penalizes values outside the preferred min/max range.

This produces a grid that stays readable across zoom levels without hardcoding a single spacing.

### `drawGrid(ctx, canvas, transform, options = {})`

Draws the background grid and optional axes.

What it does:

- skips drawing when grid visibility is disabled or scale is invalid,
- computes the world-space viewport from the current canvas bounds,
- chooses minor grid spacing dynamically,
- draws vertical and horizontal minor/major lines,
- optionally highlights the world `x = 0` and `y = 0` axes.

Important detail:

The function uses world coordinates to determine which lines should be visible, then converts each line location back to canvas coordinates. That keeps the grid stable under pan and zoom.

## Render and Selection Flow

The module’s internal flow is roughly:

1. Normalize scene graph state into gear nodes and joint nodes.
2. Build a camera-aware world-to-canvas transform.
3. Draw background references first: clear, grid, rails.
4. Draw solid scene objects: gears, linkage, slider, joints.
5. Draw transient overlays: indicators, selection outlines, placement slots.
6. Return hit-test functions for the controller layer.

This ordering matters because the canvas is painter-based. Later elements visually sit on top of earlier ones.

## Hit Testing in `drawScene`

The hit regions returned from `drawScene` are closures with a `contains(point)` function. They cover:

- the slider block,
- all rendered gears,
- all joint-anchor nodes,
- gear placement slots shown around a selected gear,
- the linkage path and crank pin,
- the ground rail.

This approach keeps picking logic close to the render geometry. The same computed canvas positions are reused for both drawing and interaction, reducing the chance of visible/interactive mismatch.

## Selection and Placement Slots

When a gear is selected, `drawScene` creates eight placement slots around it:

- right,
- upper-right,
- up,
- upper-left,
- left,
- lower-left,
- down,
- lower-right.

Each slot stores:

- a stable ID,
- its source gear ID,
- a unit direction vector,
- its world-space center.

This gives the rest of the app a structured way to attach new gears relative to an existing one.

## Global Export

At the bottom of the file, the module also attaches:

- `drawScene`,
- `createTransform`,
- `objectDetails`

to `globalThis.LinkAndGearsRenderer` when `globalThis` exists.

That means the renderer can be consumed either as an ES module or through a global object, which is useful for hybrid loading patterns or debugging in the browser console.

## Summary

`renderer.js` is a combined rendering and presentation-logic module. Its responsibilities span:

- viewport math,
- procedural gear shape generation,
- scene graph normalization,
- object metadata formatting,
- canvas drawing,
- interaction hit testing.

The key design pattern throughout the file is graceful fallback behavior: when runtime scene data is partial, the renderer still tries to infer enough structure to keep the scene visible and interactive.
