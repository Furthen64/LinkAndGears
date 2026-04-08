# Multilayer Rework Plan

## Purpose

This document describes the rework needed to add real multilayer support to LinkAndGears.

The current app already treats `sceneGraph.nodeRegistry` as the authoritative scene graph and `sceneGraph.linkageGroups` as first-class linkage definitions, but gear relations are still inferred mostly through `meshWith`, `parentId`, attachment fallbacks, and legacy canonical expectations. That is enough for one mechanism chain, but it is not enough for a true layered system where multiple gears can occupy the same center, share the same angular motion, and still be treated as distinct nodes with different tooth counts and layer membership.

The intended model is not just a visual z-order change. It is a mechanical and data-model change.

## Confirmed Product Decisions

These are the decisions already answered by the user and should be treated as requirements:

- Layers are global to the scene, not separate per linkage group.
- A welded gear stack shares the same center and the same angular motion.
- A welded gear stack does not mean the nodes are the same gear; each layer can have its own tooth count, radius, and other gear metadata.
- Gear meshing should happen only within the same layer by default.
- The editor should expose layers through a dedicated layer panel.
- Backward compatibility is not required for old scenes.
- The legacy scene presets should be removed and replaced.
- The replacement presets should be exactly two scenes:
  - one simple scene with a single layer
  - one multilayer scene that demonstrates stacked coaxial gears

## Core Concept

A layer is a scene-level grouping that controls both rendering order and mechanical interaction boundaries.

This means a node's `layerId` is not only a display hint. It determines or constrains:

- which gears it can mesh with,
- which linkage groups it is allowed to participate in,
- how the editor organizes the scene tree,
- how stacked gears are represented,
- how visibility and locking are handled in the UI.

Layer membership should not replace explicit linkage-group membership. Linkage groups should continue to reference concrete node IDs, and layer rules should validate those references rather than infer them implicitly.

Layers are now the top-level scene hierarchy. Every persisted node in the scene must belong to some layer, with at least one default layer always present.

The rework needs to separate these concepts:

- visual stacking order
- rigid coaxial attachment
- gear meshing
- linkage membership
- selection and editing

Today those responsibilities are mixed together in the existing model.

## Required Schema Changes

### Scene graph

Add a scene-level layer registry, likely under `sceneGraph.layers` or an equivalent structure.

Each layer should support at least:

- `id`
- `label`
- `zIndex`
- `visible`
- `locked`

Each node should gain a `layerId` field.

Each linkage group should also gain a `layerId` field so the linkage, slider, and ground anchors can be associated with the correct layer.

Linkage-owned helper nodes such as linkage anchors, sliders, ground anchors, and similar group-specific nodes should inherit `layerId` from their linkage group rather than overriding it individually.

Independent nodes that are not owned by a linkage group, such as gears and free joint anchors, should store their own `layerId` directly.

The layer registry should live alongside the existing authoritative `nodeRegistry` and `linkageGroups` structures rather than introducing a second competing graph representation.

### Gear nodes

Each gear node must be able to express:

- its layer membership
- its rigid attachment target, if it is welded to another gear in the same stack
- its tooth count and radius independently from the stack it shares a center with
- its mesh neighbors restricted to the same layer unless explicitly bridged

For welded stacks, a child gear's center should be derived from its rigid parent rather than stored redundantly on both nodes.

The relation model needs to stop overloading one field for multiple meanings. The rework should treat these as distinct concepts:

- `meshWith` for meshed gear constraints
- `rigidWith` or an equivalent dedicated field for welded coaxial attachment
- `parentId` or another attachment field only for editor hierarchy or non-gear anchor attachment

If `parentId` continues to mean both rigid transmission topology and generic attachment, the solver and renderer will keep reintroducing the same ambiguity.

### Linkage groups

Each linkage group should be layer-aware so that the crank/slider geometry is evaluated in the correct layer context.

If a linkage group uses a gear from a stacked pair, the group should reference the specific node, not a shared center alias.

## Mechanical Rules

### Rigid stacked gears

A welded gear stack behaves as a rigid attachment, not as a meshed gear pair.

That means:

- same center point
- same angle
- same angular speed
- no center-distance meshing constraint between the welded gears
- independent tooth geometry per node

This is the key difference from the current `meshWith` behavior.

### Same-layer meshing

By default, a gear may only mesh with another gear on the same layer.

A gear in layer 0 should not automatically mesh with a gear in layer 1 even if the geometry would otherwise line up.

Cross-layer meshing is out of scope for this rework. If it is ever needed later, it should be added as an explicit exception mechanism rather than assumed by default.

### Propagation model

The solver must distinguish between:

- rigid pose propagation for welded stacks
- rotational inversion and ratio propagation for meshed gears

A welded child should inherit pose from its rigid parent.
A meshed child should compute its motion from mesh constraints.

Those are separate constraint systems.

## Impacted Systems

### Kinematics

The kinematics layer is the highest-risk part of the rework.

It currently assumes a flat dependency graph and uses `meshWith` plus parent/attachment resolution to infer motion. That needs to be changed so the solver can evaluate layers and rigid stacks explicitly.

Needed changes:

- resolve nodes by `layerId`
- treat welded stacks as a rigid cluster
- compute motion per layer-scoped constraint component, with rigid clusters and mesh edges evaluated separately
- block cross-layer meshing unless explicitly allowed
- preserve deterministic output for the same scene and time

### Renderer

The renderer must become layer-aware in three ways:

- draw order should follow layer order first, then node order
- selection and hit testing should respect layer visibility and locking
- object details should show layer membership and stack relationships

This does not mean the renderer owns the layer system. It means the renderer must consume it correctly.

### Controller and editor

The controller needs the largest UI-facing update.

Required work:

- add a dedicated layer panel
- add a dedicated isometric view panel
- create, rename, hide, lock, and delete layers
- show current layer membership in the inspector
- make layer-aware node creation defaults
- update scene tree behavior so stacked gears are still understandable

Reordering layers and moving existing nodes between layers are out of scope for the first implementation.

The isometric view panel is also intentionally limited in scope for the first implementation. It only needs to render a basic non-interactive view of the current scene state and layer stacking; it does not need editing tools, selection, or camera manipulation.

### Scene import/export

Because backward compatibility is not required, the serialization format can move directly to the new model.

This should include:

- layer registry in exported JSON
- `layerId` on nodes
- `layerId` on linkage groups
- scene presets rewritten to the new format

Old presets should be removed and replaced rather than migrated in place.

Temporary import shims can still exist during implementation if they reduce churn, but the new presets and normal export path should target the new schema only.

## Implementation Steps

### 1. Define the scene schema

Create the authoritative layer data model first.

Decisions to encode:

- how layers are identified
- how layer order is represented
- how nodes are assigned to layers by default
- how linkage-owned helper nodes inherit layer membership from their linkage group
- whether there is a default layer created automatically

### 2. Update normalization and registry logic

All node normalization should preserve `layerId`.

The registry and any compatibility helpers should stop assuming a single implicit mechanism chain.

Normalization should also validate that:

- every node references an existing `layerId`
- every linkage group references an existing `layerId`
- every `rigidWith` target is coaxial and non-self-referential
- every `meshWith` target is in the same layer
- welded child gears do not persist an independent center that can drift from the rigid parent

### 3. Update the kinematics solver

Split rigid attachments from meshed attachments.

The solver should be able to answer:

- which nodes belong to the same rigid stack
- which nodes are meshed within a layer-scoped constraint component
- how motion propagates through a stack
- how linkage groups select their input gear

### 4. Update rendering and hit testing

Make the renderer consume layer visibility, layer ordering, and layer-based selection state.

Stacked gears should render as separate nodes with shared pose but different tooth geometry.

### 5. Add the layer panel

The editor should expose layers as first-class objects.

Minimum useful controls:

- add layer
- rename layer
- toggle visibility
- toggle lock
- delete layer

The first implementation should not support reordering layers or moving an existing node from one layer to another.

### 5a. Define layer-panel behavior

The layer panel needs explicit interaction rules so the editor and controller behave predictably.

Creation defaults:

- creating a new gear should require an existing selection
- a new gear should inherit the layer of the currently selected node
- this means the current "create gear with no selection" flow should be removed
- new linkage groups and free joint nodes should likewise require or derive a concrete layer assignment at creation time

Locking and selection:

- locking a layer should immediately clear any active selection on that layer
- nodes on a locked layer should not be selectable
- hidden layers should not participate in hit testing

Stack awareness:

- selecting a welded gear should make the rest of the rigid stack visually obvious
- this should be communicated with a clear color or highlight treatment
- the properties or debug panel should explicitly show welded peers and stack membership
- selecting a welded gear should not imply whole-stack move operations in v1

Deletion behavior:

- deleting a layer should delete all nodes on that layer
- if a deleted node was part of a welded coaxial stack, the remaining gears on other layers should simply lose that welded relationship to the deleted node
- layer deletion should therefore remove affected rigid edges rather than trying to preserve a partially deleted stack reference

Hierarchy rules:

- the scene must always contain at least one layer so every node has a valid layer assignment
- layers should be presented as the highest-level grouping in the scene hierarchy
- a node's layer should not be editable directly from the node inspector or properties panel
- layer assignment changes should happen only through layer-oriented workflows, not per-node freeform editing

### 5b. Add the isometric view panel

The editor should include a separate isometric view panel that provides a basic spatial readout of the current multilayer scene.

The first implementation should keep this panel intentionally simple:

- it should render every node type that currently exists in the scene
- it should reflect layer stacking visually well enough to make cross-layer coaxial stacks understandable
- it should be read-only and non-interactive
- it does not need selection, hit testing, drag operations, or camera controls
- it does not need high-fidelity geometry beyond a basic visual approximation of the existing parts

It is acceptable for the first version to render some node types as simple proxy shapes such as cylinders, discs, cubes, or other minimal primitives as long as every node in the scene is represented somehow.

This panel should be treated as a secondary visualization, not as a second editor surface. The authoritative editing workflow remains in the main 2D editor and the layer panel.

### 6. Rewrite the presets

Remove the legacy scenes and replace them with:

- one simple single-layer preset
- one multilayer preset that demonstrates a stacked coaxial gear arrangement

The multilayer preset should explicitly show:

- a large gear on layer 0
- a smaller welded gear at the same center on layer 1
- same angular motion across the stack
- different tooth counts per layer
- layer-local meshing behavior

### 7. Update object details and selection labels

The inspector should tell the user:

- the node's layer
- whether it is part of a rigid stack
- whether it is meshed or welded
- what its coupling target is

This is important because multilayer scenes will otherwise be ambiguous in the UI.

The inspector should also avoid presenting welded relationships as generic parent-child edges, because that would blur the distinction between editor hierarchy and mechanical coupling.

For welded gears, the inspector should surface the other gears in the rigid stack clearly enough that a cross-layer relationship is obvious without requiring the user to inspect multiple nodes manually.

The inspector should display layer membership as read-only information in this first implementation.

## Data Model Expectations

A practical target shape is something like:

```json
{
  "sceneGraph": {
    "layers": [
      { "id": "layer-0", "label": "Base Layer", "zIndex": 0, "visible": true, "locked": false },
      { "id": "layer-1", "label": "Top Layer", "zIndex": 1, "visible": true, "locked": false }
    ],
    "nodeRegistry": {
      "gear-base": {
        "id": "gear-base",
        "type": "gear",
        "layerId": "layer-0",
        "center": { "x": 0, "y": 0 },
        "toothCount": 32,
        "radius": 1.6
      },
      "gear-top": {
        "id": "gear-top",
        "type": "gear",
        "layerId": "layer-1",
        "toothCount": 18,
        "radius": 0.9,
        "rigidWith": "gear-base"
      }
    },
    "linkageGroups": [
      {
        "id": "linkage-group-1",
        "layerId": "layer-0",
        "inputGearId": "gear-base"
      }
    ]
  }
}
```

This is only a shape sketch, not implementation guidance.

One important caveat for the final schema: linkage-group membership should remain explicit by node reference, not inferred from `layerId` alone.

## Acceptance Criteria

The rework is successful when all of these are true:

- The scene can contain multiple layers.
- Layer membership is visible and editable in the UI.
- Two gears can share the same center and angular motion while remaining distinct nodes.
- Tooth count and radius can differ between stacked gears.
- Gears only mesh within their layer unless a special rule says otherwise.
- The UI includes a basic non-interactive isometric view that reflects the current scene and its layer stacking.
- The multilayer preset visibly demonstrates the new behavior.
- The simple preset still works as a baseline example.
- The app no longer depends on the old legacy scene files.

## Notes On Scope

This rework is intentionally structural.

It is not a small feature toggle, because layers affect:

- schema
- solver
- rendering order
- selection
- layer management UI
- isometric visualization
- preset scenes
- object inspection
- import/export

The safest way to execute it is to treat layer support as a first-class scene abstraction and then adapt the existing renderer and controller around that abstraction.
