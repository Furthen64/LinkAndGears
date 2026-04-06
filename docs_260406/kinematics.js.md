# Overview of kinematics.js

## What Does This File Do?

The `kinematics.js` file contains functions that help calculate important properties for the gears and other parts of the scene. These calculations are used to make sure everything fits and works together properly.

## Key Features

- **Gear Size**: Figures out how big a gear is by measuring from its center to the edge of its teeth. (`getNodeRadius`)
- **Positioning**: Finds the exact location of parts in the scene. (`getNodeCenter`)
- **Main Gear**: Identifies which gear or motor is the starting point for the system. (`resolveGraphRootGear`)
- **Error Handling**: Uses fallback values to avoid problems if some data is missing. (Fallback mechanisms)

## Code Skeleton

### High-Level Functions

- **`resolveGraphRootGear(sceneGraph)`**
  - Purpose: Determines the main gear or motor in the scene graph.
  - Calls:
    - None (operates directly on the `sceneGraph` object).

- **`getNodeRadius(node, sceneDefaults)`**
  - Purpose: Calculates the size of a gear based on its parameters or default values.
  - Calls:
    - Internal logic to check `radiusMode`, `module`, and `toothCount`.

- **`getNodeCenter(node)`**
  - Purpose: Finds the position of a node in the scene.
  - Calls:
    - `toFiniteNumber` (helper function to ensure valid numbers).

### Helper Functions

- **`toFiniteNumber(value, fallback)`**
  - Purpose: Ensures a value is a valid number, falling back to a default if not.
  - Caller:
    - `getNodeCenter`.

### Function Hierarchy

1. **High-Level Functions**
   - These are the main entry points for other parts of the application.
   - Example: `resolveGraphRootGear` is likely called by the scene setup logic.

2. **Helper Functions**
   - Support the high-level functions with specific tasks.
   - Example: `toFiniteNumber` ensures valid numbers for calculations.