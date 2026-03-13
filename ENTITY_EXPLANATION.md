# Entity Interaction Overview

When you click a placement slot and then click **Add Gear**, the controller decides **which existing gear is the reference** for placing the new one.

## How the entities interact

1. **Slot selection (`pendingGearSlot`)**
   - Clicking one of the 8 visual slots stores slot metadata (source gear id + slot direction).

2. **Relation target resolution (`relationTarget`)**
   - On **Add Gear**, the controller chooses the best anchor candidate in this order:
     1. gear from the selected slot (`selectedGearFromSlot`)
     2. currently selected gear (`selectedGearFromSelection`)
     3. fallback (`motor-1`)

3. **Anchoring condition (`shouldMesh`)**
   - `shouldMesh` controls whether the new gear should be treated as meshing with `relationTarget`.
   - If true, placement tries to use the slot direction and center distance math.

4. **Meshed position calculation**
   - `resolvePlacementCenterFromDirection(...)` normalizes slot direction and places the new center at:
     - `anchor.center + unitDirection * (anchor.radius + newGear.radius)`
   - This ensures visible side placement (e.g., left slot -> gear appears left of the anchor) while preserving touching/meshing distance.

## Term definitions

### Meshed placement target
A **meshed placement target** is the existing gear chosen as the new gear's mesh partner (`meshWith`).
When a target is meshed, the new gear center is computed from direction + sum of radii so the two gears contact correctly.

### Anchoring condition
The **anchoring condition** is the boolean rule that decides whether the placement uses meshing behavior (`shouldMesh`) versus non-meshed parent-style placement.
In this code path, that condition determines whether slot direction is honored for final placement.
