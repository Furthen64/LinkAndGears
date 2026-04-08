# Multilayer Rework Plan

## Purpose

This document describes the rework needed to add real multilayer support to LinkAndGears.

The current app has a single shared scene graph with gear relations defined mostly by `meshWith`, `parentId`, and canonical node IDs. That is enough for one mechanism chain, but it is not enough for a true layered system where multiple gears can occupy the same center, share the same angular motion, and still be treated as distinct nodes with different tooth counts and layer membership.

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

This means a node's `layerId` is not only a display hint. It determines:

- which gears it can mesh with,
- which linkage group it belongs to,
- how the editor organizes the scene tree,
- how stacked gears are represented,
- how visibility and locking are handled in the UI.

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

### Gear nodes

Each gear node must be able to express:

- its layer membership
- its rigid attachment target, if it is welded to another gear in the same stack
- its tooth count and radius independently from the stack it shares a center with
- its mesh neighbors restricted to the same layer unless explicitly bridged

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

If cross-layer meshing is ever needed later, it should be an explicit exception, not the default.

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
- compute motion per layer or per rigid cluster
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
- create, rename, reorder, hide, and lock layers
- move selected nodes between layers
- show current layer membership in the inspector
- make layer-aware node creation defaults
- update scene tree behavior so stacked gears are still understandable

### Scene import/export

Because backward compatibility is not required, the serialization format can move directly to the new model.

This should include:

- layer registry in exported JSON
- `layerId` on nodes
- `layerId` on linkage groups
- scene presets rewritten to the new format

Old presets should be removed and replaced rather than migrated in place.

## Implementation Steps

### 1. Define the scene schema

Create the authoritative layer data model first.

Decisions to encode:

- how layers are identified
- how layer order is represented
- how nodes are assigned to layers by default
- how linkage groups inherit or override layer membership
- whether there is a default layer created automatically

### 2. Update normalization and registry logic

All node normalization should preserve `layerId`.

The registry and any compatibility helpers should stop assuming a single implicit mechanism chain.

### 3. Update the kinematics solver

Split rigid attachments from meshed attachments.

The solver should be able to answer:

- which nodes belong to the same rigid stack
- which nodes are meshed within a layer
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
- reorder layers
- toggle visibility
- toggle lock
- assign selected node to layer

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
        "center": { "x": 0, "y": 0 },
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

## Acceptance Criteria

The rework is successful when all of these are true:

- The scene can contain multiple layers.
- Layer membership is visible and editable in the UI.
- Two gears can share the same center and angular motion while remaining distinct nodes.
- Tooth count and radius can differ between stacked gears.
- Gears only mesh within their layer unless a special rule says otherwise.
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
- preset scenes
- object inspection
- import/export

The safest way to execute it is to treat layer support as a first-class scene abstraction and then adapt the existing renderer and controller around that abstraction.
