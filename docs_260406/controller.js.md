# controller.js Reference

## Purpose

`controller.js` is the orchestration layer for the frontend. It owns:

- UI bootstrapping,
- simulation state,
- scene graph normalization,
- parameter synchronization,
- scene tree management,
- camera controls,
- preset loading and export,
- render-loop integration.

If `kinematics.js` is the math layer and `renderer.js` is the drawing layer, `controller.js` is the application layer that connects them to the DOM.

## Imports

### `computeState`

Imported from `./kinematics.js`.

Used to compute the live mechanical state for the current time and normalized parameters.

### `createTransform`, `drawScene`, `objectDetails`

Imported from `./renderer.js`.

Used for:

- camera-aware geometry conversions,
- drawing the current frame,
- building the selection inspector payload.

## Exported Values

### `DEFAULT_SCENE_TEMPLATE`

Defines the fallback visual theme and drawing configuration for:

- rails,
- gears,
- motor gear,
- center markers,
- rotation indicators,
- crank arm,
- connecting rod,
- crank pin,
- slider block,
- dark and light grid palettes.

This is the base render style that can be overridden by scene template JSON.

### `deepMerge(base, override)`

Recursively merges nested plain objects.

Behavior:

- non-object overrides return the original base branch,
- plain object branches are merged recursively,
- scalar and array values are replaced.

Used primarily to merge the default scene template with a fetched template JSON.

### `bootstrap()`

The main application entry point.

It:

- captures required DOM elements,
- initializes long-lived simulation state,
- declares a large set of helper functions scoped to the controller instance,
- wires UI event handlers,
- loads presets and scene templates,
- starts the render loop.

Most of the file’s named helper functions live inside `bootstrap` so they can close over `canvas`, `ctx`, `controls`, and `simulation`.

## Top-Level Helpers Outside `bootstrap`

### `loadSceneTemplate(url)`

Fetches an external scene template JSON and merges it into `DEFAULT_SCENE_TEMPLATE`.

Fallback behavior:

- if `fetch` is unavailable, returns the default template,
- if the response fails, returns the default template,
- if parsing throws, returns the default template.

### `getTheme()`

Reads `document.body.dataset.theme` and normalizes it to either `"light"` or `"dark"`.

This is the renderer-facing theme lookup function.

### `applyInputConstraints(constraints)`

Applies `min`, `max`, and `step` attributes to DOM controls by ID.

It is used after scene templates load so runtime constraint metadata can shape the editable controls.

### `resolveFieldNameFromReason(reason, constraints)`

Tries to map a validation error string back to a control ID.

How it works:

- lowercases the reason,
- scans `constraints[fieldId].reasonIncludes` for matching phrases,
- falls back to `slider-axis` if the reason mentions `slider_axis`.

This helps the status line point the user toward the most relevant field.

### `getControls()`

Collects and returns the DOM elements the controller depends on.

The returned object includes buttons, inputs, labels, scene tree containers, status labels, and property-editor containers. This centralizes DOM lookup so the rest of the controller can work with a stable control map.

## `bootstrap()` State Initialization

After validating the canvas and its 2D context, `bootstrap` creates:

- `controls`: DOM handle map from `getControls()`,
- `NODE_PARAM_SCHEMA`: field schema used by the selected-node editor,
- `WORKSPACE_PRESETS`: preset-name to JSON-path mapping,
- `loadedWorkspacePresets`: in-memory preset cache,
- `NEW_SCENE_BASELINE_PATH` and `NEW_SCENE_FALLBACK`: reset-scene defaults,
- export metadata and control ID lists,
- `simulation`: the main mutable application state object,
- camera interaction flags.

The `simulation` object stores playback state, scene graph data, camera state, selected object ID, pending placement slot, normalized params, and render-cache information.

## `bootstrap()` Helper Functions

### Scene graph and node normalization

#### `makeNode(id, label, children = [])`

Creates a lightweight tree node used by the scene-tree renderer.

#### `normalizeNodeType(rawType)`

Normalizes node types to lowercase and preserves `joint-anchor` as a canonical special case.

#### `isAllowedGenesisType(nodeType, policy = simulation.sceneGraph.genesisPolicy)`

Checks whether a node type is allowed to serve as the genesis node under the active genesis policy.

#### `getDeletedCanonicalNodeIds()`

Returns the list of canonical node IDs marked as deleted, or an empty list if the field is missing.

#### `getSceneModule()`

Resolves the active scene module from:

1. `simulation.sceneGraph.module`,
2. the shared-module control,
3. fallback `0.1`.

#### `syncSharedModuleControl()`

Writes the resolved scene module back into the shared-module input so UI and state stay aligned.

#### `canonicalGearNodes()`

Builds the canonical `motor-1` and `gear-1` node objects from the current canonical gear config and scene module.

Important behavior:

- derives radius from module and tooth count when radius mode is not manual,
- positions the motor at negative center distance and the driven gear at the origin,
- carries runtime flags such as `showIndicator` and motor speed inputs.

#### `canonicalSceneNodes()`

Builds the canonical node registry entries for:

- `motor-1`
- `gear-1`
- `linkage-1`
- `slider-1`
- `ground-1`

It also cascades deletion through canonical child nodes when one of them appears in `deletedCanonicalNodeIds`.

#### `getRootNodeId()`

Returns the scene graph root ID, defaulting to `motor-1`.

#### `getPrimaryDrivenGearId()`

Finds the first gear attached to the root gear in the current registry, with fallback to `gear-1` or the root itself.

#### `rebuildNodeRegistry()`

Reconstructs `simulation.sceneGraph.nodeRegistry` from canonical nodes, extra gears, and extra joints.

It also rebuilds `parentChildEdges` from node parent relationships.

This is one of the controller’s most important maintenance functions. Many UI actions mutate partial scene data, then call this function to regenerate the registry view used by rendering and selection.

#### `buildEdgeMaps()`

Transforms `parentChildEdges` into:

- `parentByChild`,
- `childrenByParent`.

Used by tree rendering and deletion traversal.

#### `isGearNodeId(nodeId)`

Determines whether an ID refers to a selectable gear node under current scene conventions.

#### `getSelectedGearNode()`

Returns the currently selected gear node if the current selection ID resolves to a gear.

### Numeric and geometry helpers

#### `toPositiveFinite(value, fallback)`

Returns a positive finite number or a fallback.

#### `deriveGearRadius(config, fallback = 0.1)`

Computes a gear radius from either manual radius or `module * teeth / 2`.

#### `syncGearRadius(node)`

Updates `node.radius` in place using `deriveGearRadius`.

#### `clearPendingGearSlot()`

Clears the currently selected placement slot used when adding a new gear.

#### `getPlacementSlotFromHitRegion(region)`

Converts a renderer hit region with ID prefix `placement-slot:` into a structured slot payload containing:

- stable key,
- source gear ID,
- direction vector,
- center point.

#### `resolvePlacementCenterFromDirection(anchorGear, newGearRadius, slot)`

Computes the center for a newly added gear based on a selected placement slot and the anchor gear’s radius.

#### `getGearLookup()`

Builds an ID-to-gear lookup spanning canonical gears and extra gears.

#### `resolveMeshCenter(anchor, node, fallbackDirection = { x: 1, y: 0 })`

Computes a gear center that preserves mesh center distance from an anchor gear.

Used to keep extra gears positioned tangentially around their mesh targets.

#### `realignMeshedGearCenters()`

Runs one or more passes over extra gears and snaps their centers back onto valid mesh circles around their anchors.

This repairs drift after edits to tooth count, module, or radius mode.

#### `keepGearMeshesSane(deletedNodeId = null, preferredAnchorId = null)`

Repairs extra gears whose `meshWith` anchor no longer exists or was deleted.

It picks a fallback anchor, updates parent/mesh links, and recomputes centers.

### Scene data sanitizers

#### `sanitizeExtraGearNode(rawNode, fallbackIndex = 1)`

Normalizes an imported extra gear definition into the controller’s expected shape.

#### `sanitizeExtraJointNode(rawNode, fallbackIndex = 1)`

Normalizes an imported extra joint definition.

#### `sanitizeRegistryNode(rawNode, fallback = {})`

Normalizes a node loaded from `sceneGraph.nodeRegistry` during scene import.

This is important because exported/imported scene files may have slightly different field completeness than in-memory controller state.

### Status, module, and scene-config application

#### `setStatusMessage(message, options = {})`

Writes the main status line and optional debug status.

Supports debug message text and severity level (`info`, `warn`, `error`).

#### `applySceneModuleToGears()`

Pushes the current scene module into all canonical and extra gear configs, then recalculates radii.

#### `applySceneGraphConfig(sceneConfig)`

Ingests the `sceneGraph` portion of a preset or imported scene.

It:

- resolves shared module,
- loads canonical gear config,
- sanitizes extra gears and joints,
- restores deleted canonical nodes,
- restores root and genesis state,
- rebuilds the registry,
- optionally reconstructs canonical and extra nodes from a provided registry,
- revalidates root and genesis settings,
- clears pending placement state.

This is the heaviest normalization function in the controller.

### Scene tree helpers

#### `buildTreeModel()`

Creates the nested scene-tree model beginning at the current root node.

#### `selectObjectById(objectId)`

Updates selection, clears pending slot state, and re-renders.

#### `updateSceneTreeSelection()`

Updates `aria-selected` on tree buttons so the tree mirrors canvas selection.

#### `isDeletableTreeNode(nodeId)`

Determines whether a node can be deleted through the tree UI.

Canonical nodes `gear-1`, `linkage-1`, `slider-1`, and `ground-1` are treated as deletable, while the root genesis node receives special protection elsewhere.

#### `deleteTreeNodeById(nodeId)`

Deletes a node and its descendants from the scene tree.

Important behavior:

- blocks deletion of the current genesis node,
- optionally confirms subtree deletion with the user,
- marks deleted canonical nodes in `deletedCanonicalNodeIds`,
- removes dynamic extra nodes,
- repairs gear meshes after deletion,
- rebuilds the registry,
- chooses a safe fallback selection.

#### `getNextDynamicNodeIndex(prefix, nodes)`

Finds the next numeric suffix for dynamically created gear or joint IDs.

#### `createTreeNodeElement(node)`

Renders one scene-tree node as DOM, including selection and delete buttons.

#### `renderSceneTree()`

Rebuilds the full tree UI from `buildTreeModel()` and clears the dirty flag.

### Camera and theme helpers

#### `clampCameraZoom(zoom)`

Constrains zoom to the configured min/max range.

#### `resetCamera()`

Restores zoom and pan to base values.

#### `clampCameraPan()`

Normalizes pan values back to valid finite numbers if they become invalid.

#### `applyTheme(theme)`

Writes the normalized theme to `document.body.dataset.theme` and syncs the theme control.

### Parameter normalization and selected-node editing

#### `parseOptionalNumber(control)`

Parses a control value into `{ present, value }`.

This helper exists for optional numeric fields. In the current file it is defined but not meaningfully used elsewhere.

#### `normalizeControlParams()`

Builds a normalized canonical parameter object from the live controls and canonical gear settings.

It computes:

- module,
- tooth counts,
- driver/driven radii,
- pitch diameters,
- motor speed in RPM and rad/s,
- slider and linkage controls.

#### `syncParamsFromControls()`

Refreshes `simulation.params` from `normalizeControlParams()`, rebuilds the registry, and updates derived read-only controls.

This is the main bridge from the UI form state into the simulation state used by `computeState`.

#### `getNodeById(nodeId)`

Returns a node from the current node registry.

#### `getNodeParamSchema(node)`

Returns the selected-node editor schema for a given node type.

#### `updateSelectedNodeParam(nodeId, key, rawValue)`

Writes an edited property back into the persistent node config.

If the edit affects gear geometry or relationships, it also:

- syncs radius,
- realigns mesh centers,
- repairs mesh anchors,
- rebuilds the registry,
- synchronizes normalized params,
- re-renders.

#### `renderSelectedNodePropertiesEditor()`

Builds the selected-node property editor UI dynamically from the node schema.

It memoizes a signature string so it only rebuilds the editor DOM when something relevant has changed.

### Selection and rendering

#### `updateSelectionPanel(state)`

Uses `objectDetails(...)` to fill the selection panel and toggles the indicator checkbox row when a gear is selected.

It also refreshes the scene tree when marked dirty.

#### `renderScene()`

Runs one full render/update pass.

It:

- computes the current simulation state with `computeState`,
- draws the frame with `drawScene`,
- stores returned hit regions,
- updates the selection panel,
- derives the correct status/debug message.

#### `renderLoop(timestamp)`

Advances simulation time when playback is enabled, renders the current frame, and schedules the next animation frame.

### Preset loading, scene import/export, and baseline creation

#### `loadPresetConfig(presetName)`

Loads a workspace preset JSON and caches the result.

#### `applySceneConfig(sceneConfig)`

Applies high-level scene control values from a preset or imported scene, applies theme, applies the scene graph config, resets the camera, synchronizes params, and renders.

#### `buildCurrentSceneJson()`

Collects the current values of the exportable scene controls.

#### `buildSceneExportPayload()`

Builds the JSON structure used when exporting the scene, including graph data and `_meta` information.

#### `downloadSceneJson(payload)`

Triggers a browser download for the exported scene JSON.

#### `loadNewSceneBaseline()`

Loads the baseline JSON used by the `New Scene` action, with fallback to an embedded baseline object.

#### `applyPreset(presetName)`

Convenience wrapper that loads a preset and applies it.

### Generic UI wiring helpers

#### `attachLiveUpdates(control)`

Attaches `input` and `change` listeners that re-sync params and re-render immediately.

#### `deleteSelectedNode()`

Deletes the currently selected node when it is deletable; otherwise emits a warning status.

#### `getCanvasPointFromEvent(event)`

Converts browser event coordinates into canvas pixel coordinates, accounting for CSS scaling.

#### `canStartPan(event)`

Determines whether a pointer event should initiate camera panning.

Supported gestures:

- middle mouse drag,
- space + left drag.

#### `stopCameraPan(event)`

Ends an active camera pan interaction and clears the pointer tracking state.

## Event Wiring Inside `bootstrap()`

After helper declaration, `bootstrap` wires the UI.

### Control listeners

- global scene controls re-sync params and render live,
- shared module changes also update gear radii and mesh alignment,
- theme changes update the body dataset and re-render,
- workspace preset changes load and apply preset JSON,
- play/pause toggles simulation time advancement,
- reset-time zeroes the simulation clock,
- new-scene restores baseline graph state and applies the baseline config,
- save-scene-json exports the current scene,
- reset-view restores camera state,
- refresh-view rebuilds graph state and re-renders,
- toggle-scene-tree collapses or expands the left panel,
- add-gear adds a new extra gear using either the selected placement slot or selected gear,
- add-joint adds a joint attached to the current selection or a fallback node,
- delete-selected removes the active node when allowed,
- selection-show-indicator toggles the selected gear’s rotation marker.

### Canvas listeners

- `click` performs hit testing and selection,
- `wheel` zooms around the pointer position,
- `pointerdown` begins camera panning when the gesture matches,
- `pointermove` updates camera pan,
- `pointerup`, `pointercancel`, and `mouseleave` stop panning,
- `contextmenu` is suppressed to avoid interference with canvas interaction.

### Document and window listeners

- `keydown` supports delete-key node removal and tracks the spacebar for pan mode,
- `keyup` clears the spacebar pan modifier,
- `blur` clears space state and stops panning.

## Bootstrap Completion Sequence

At the end of `bootstrap`, the controller:

1. applies the initial theme,
2. syncs the shared-module control,
3. applies initial input constraints,
4. rebuilds the node registry,
5. renders the initial scene tree,
6. loads the selected workspace preset,
7. loads the scene template JSON,
8. performs an initial render,
9. starts the animation loop.

## Global Export

When `globalThis` exists, the file publishes `LinkAndGearsController` with:

- `bootstrap`
- `deepMerge`
- `DEFAULT_SCENE_TEMPLATE`

## Summary

`controller.js` is the stateful application shell. It translates DOM interactions into scene-graph edits, normalizes those edits into canonical simulation parameters, calls the kinematics and renderer layers, and keeps the UI, scene tree, status area, and camera state coherent across the entire app.

