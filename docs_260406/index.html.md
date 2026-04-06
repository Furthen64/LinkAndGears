# index.html Reference

## Purpose

`index.html` defines the static DOM contract for the LinkAndGears frontend. It does not contain application logic, but it provides every element that `controller.js` expects to find by ID.

That makes this file more than a visual shell. It is effectively the wiring surface between HTML, CSS, and the JavaScript controller.

## Document Head

### `<!doctype html>` and `<html lang="en">`

Establish standards mode and set the document language for accessibility and browser behavior.

### `<meta charset="UTF-8">`

Ensures text is interpreted as UTF-8.

### `<meta name="viewport" ...>`

Makes the layout responsive by matching the viewport width to the device width.

### `<title>LinkAndGears</title>`

Sets the browser tab title.

### `<link rel="stylesheet" href="/static/style.css">`

Loads the global stylesheet used by every panel and control.

## Body-Level State

### `<body data-theme="dark">`

The `data-theme` attribute is the current theme source of truth for CSS and for `controller.js` theme lookup.

Behavioral role:

- the controller reads it to determine whether the scene should render in light or dark mode,
- the controller updates it when the theme selector changes,
- CSS can switch visual styles based on the attribute value.

## Main Layout

### `<main class="layout">`

The application is divided into three major regions:

- scene tree panel,
- viewer panel,
- controls panel.

This three-column structure mirrors the app architecture:

- structure editing on the left,
- visualization in the center,
- parameter editing on the right.

## Scene Tree Panel

### `<aside id="scene-tree-panel" class="scene-tree-panel" aria-label="Scene tree">`

Hosts the hierarchical scene editor.

### Header

- `<h2>Scene Tree</h2>` labels the region.
- `<button id="toggle-scene-tree">` collapses or expands the panel.

The button includes:

- `aria-expanded`, which the controller updates,
- `aria-controls="scene-tree-content"`, which connects the button to the collapsible content region.

### Actions Area

Inside `#scene-tree-content` there are three structural edit buttons:

- `#add-gear`: creates a new extra gear,
- `#add-joint`: creates a new joint-anchor node,
- `#delete-selected`: deletes the currently selected deletable node.

### Help Text

The scene tree help paragraph explains a key UI guarantee: selection is synchronized both ways between the tree and the canvas.

### `<ul id="scene-tree" role="tree">`

The controller populates this list dynamically with nested tree items.

Why it matters:

- it starts empty in static HTML,
- `controller.js` builds the tree from the scene graph at runtime,
- ARIA `role="tree"` gives assistive tech a better structural hint.

## Viewer Panel

### `<section class="viewer-panel">`

This is the central visualization area.

### Title

`<h1>LinkAndGears</h1>` provides the primary page heading.

### Top Controls

The `.viewer-top-controls` toolbar contains workspace and playback controls.

#### `#workspace-preset`

Selects a saved workspace configuration. The default options are:

- `default`,
- `compact-fast`,
- `large-slow`,
- `vertical-slider`.

The controller loads the corresponding JSON preset when the value changes.

#### Scene and view buttons

- `#new-scene`: resets to a clean scene baseline.
- `#reset-view`: restores camera zoom and pan.
- `#refresh-view`: rebuilds the node registry and re-renders.
- `#save-scene-json`: exports the current scene as JSON.

#### Time controls

- `#play-pause`: toggles simulation playback.
- `#reset-time`: resets simulation time to zero.

#### Help paragraph

The toolbar help text explains that choosing a preset also updates mechanism inputs.

### Canvas

### `<canvas id="mechanism-canvas" width="760" height="460">`

This is the rendering target used by `renderer.js`.

Behavioral role:

- displays the gears, linkage, slider, grid, and overlays,
- receives click, wheel, and pointer events for selection, zoom, and pan,
- serves as the geometric basis for hit testing.

The `aria-label` describes the canvas content for accessibility.

### Interaction Tips

Two paragraphs explain the interaction model:

- selection tip for inspectable objects,
- camera tip for zooming and panning.

These lines are static documentation embedded in the interface.

### Selection Panel

### `<section class="selection-panel" aria-live="polite">`

Displays the currently selected object’s details.

Important child elements:

- `#selection-name`: the selected object title,
- `#selection-details`: a definition list filled with object metadata,
- `#selection-show-indicator-row`: a label row the controller shows only for gear selections,
- `#selection-show-indicator`: checkbox used to toggle rotation indicator visibility.

The `aria-live="polite"` attribute allows updates to be announced without being too disruptive.

### Status and Debug

- `#status`: primary human-readable status line.
- `#status-debug`: lower-level debug channel used for internal messages, warnings, and error diagnostics.

The debug panel is useful because the controller surfaces both friendly and technical explanations separately.

## Controls Panel

### `<section class="controls-panel" aria-label="Mechanism controls">`

Contains scene-wide editable inputs, selected-node editors, and derived read-only outputs.

### Global scene controls

These IDs are read directly by the controller:

- `#theme-mode`
- `#shared-module`
- `#crank-radius`
- `#rod-length`
- `#slider-offset`
- `#slider-axis`

Together they define the scene-level mechanism parameters.

### Selected Node Properties Area

The second `.selection-panel` section is actually a dynamic property editor for the selected scene node.

Important elements:

- `#node-properties-empty`: placeholder text shown when no editable node is selected,
- `#selected-node-properties`: container that the controller fills with generated form fields.

This area is where `controller.js` renders node-specific editors from its internal node parameter schema.

### Derived Values Panel

These inputs are read-only reflections of normalized scene data:

- `#derived-driver-radius`
- `#derived-gear-radius`
- `#derived-angular-speed`

They are not direct sources of truth. The controller writes to them after it normalizes the editable inputs.

## Script Loading

### `<script type="module" src="/static/app.js"></script>`

Loads the module entrypoint that eventually calls `bootstrap()`.

Why `type="module"` matters:

- allows ES module imports,
- defers execution until the document is parsed,
- keeps global namespace pollution low.

## Runtime Contract With JavaScript

`index.html` is tightly coupled to `controller.js` through element IDs. If one of these IDs changes without updating the controller, parts of the UI silently stop working.

The most important contracts are:

- the canvas and status elements must exist or bootstrap exits early,
- every control ID in `getControls()` must resolve correctly for its feature to work,
- the script tag must load `app.js`, not `controller.js` directly, because `app.js` owns startup timing.

## Summary

`index.html` is the static UI skeleton and DOM API for the app. It lays out the editing workflow, provides accessibility hooks, and defines the exact element set that the controller depends on for simulation control, scene editing, inspection, and rendering.

