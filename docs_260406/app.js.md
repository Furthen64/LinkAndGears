# app.js Reference

## Purpose

`app.js` is the frontend entry module. It does three things:

- imports the application bootstrap function from `controller.js`,
- exposes a small canonical parameter schema for external consumers,
- starts the app when the DOM is ready.

This file is intentionally small. It acts as the boundary between static HTML module loading and the larger controller runtime.

## Import

### `bootstrap`

Imported from `./controller.js`.

Role:

- initializes the canvas controller,
- wires DOM controls to simulation state,
- starts the render loop.

`app.js` does not reimplement any of that logic. It only decides when `bootstrap` should run.

## Exported Constant

### `CANONICAL_PARAM_SCHEMA`

This object describes which canonical parameters belong to each high-level entity type.

Defined groups:

- `gear`: `teeth`, `radiusMode`, `radius`, `meshWith`, `showIndicator`
- `motor`: gear fields plus `inputRpm` and `inputAngularSpeed`
- `scene`: shared scene-level controls such as module, linkage dimensions, slider settings, and theme

Why it exists:

- gives the UI or external tooling a compact schema reference,
- separates conceptual parameter categories from the larger controller implementation,
- creates a stable public contract for code that wants to inspect editable properties.

This is not the full runtime form schema used by the selected-node editor. That richer editor schema lives inside `controller.js`. `CANONICAL_PARAM_SCHEMA` is a simpler public summary.

## Global Exposure

### `globalThis.LinkAndGearsApp`

When `globalThis` exists, the module publishes:

- `CANONICAL_PARAM_SCHEMA`

Why it matters:

- browser-console inspection becomes easy,
- non-module debugging hooks can still read the canonical schema,
- hybrid loading scenarios are supported.

## Startup Logic

The final block checks whether `document` exists and then decides how to call `bootstrap`.

Behavior:

- if the code is running outside a browser-like DOM, nothing happens,
- if the document is still loading, it waits for `DOMContentLoaded`,
- otherwise it calls `bootstrap()` immediately.

This avoids race conditions where `controller.js` would try to grab DOM elements before the page exists.

## Execution Flow

The runtime sequence in `app.js` is:

1. Load `bootstrap` from `controller.js`.
2. Define and export `CANONICAL_PARAM_SCHEMA`.
3. Publish the schema on `globalThis` when available.
4. Wait for DOM readiness.
5. Invoke `bootstrap` exactly once.

## Summary

`app.js` is the minimal entrypoint layer. It does not perform rendering, kinematics, or scene-graph work itself. Its job is to expose one small piece of app metadata and hand control to the controller at the correct time.
