# Overview of controller.js

## What Does This File Do?

The `controller.js` file is the main part of the application that connects everything together. It uses calculations and drawing tools to manage how the scene looks and behaves.

## Key Features

- **Scene Setup**: 
Defines the default styles and settings for parts like gears, rails, and rods.(`DEFAULT_SCENE_TEMPLATE`)

- **Combining Tools**: Uses calculations from `kinematics.js` and drawing tools from `renderer.js` to update the scene. (`computeState`, `createTransform`, `drawScene`)

- **Customization**: Lets you change how the scene looks by modifying the default settings. (`DEFAULT_SCENE_TEMPLATE`)

## Code Skeleton

### High-Level Functions

- **`computeState(scene)`**
  - Purpose: Calculates the current state of the scene based on its configuration.
  - Calls:
    - Functions from `kinematics.js` for kinematic calculations.

- **`createTransform(canvas, params)`**
  - Purpose: Prepares the canvas for drawing by setting up transformations.
  - Calls:
    - Functions from `renderer.js` for rendering logic.

- **`drawScene(canvas, scene)`**
  - Purpose: Draws the scene on the canvas using the current state.
  - Calls:
    - Functions from `renderer.js` for rendering.

### Function Hierarchy

1. **High-Level Functions**
   - These are the main entry points for managing the scene.
   - Example: `computeState` is called to calculate the scene's state.
2. **Helper Functions**
   - Support the high-level functions with specific tasks.
   - Example: `createTransform` sets up the canvas for drawing.
