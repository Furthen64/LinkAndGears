# High-Level Explanation of app.js

## Purpose
The `app.js` file serves as the entry point for initializing the LinkAndGears application. It defines a canonical parameter schema for various components like gears, motors, and scenes. Additionally, it ensures the application is bootstrapped when the DOM is ready.

## Key Features
- **Canonical Parameter Schema**: Defines the structure and expected parameters for gears, motors, and scenes.
- **Global Exposure**: Exposes the `CANONICAL_PARAM_SCHEMA` globally for accessibility.
- **Bootstrap Logic**: Ensures the application initializes correctly when the DOM is fully loaded.

## Code Highlights
- **Parameter Schema**: The `CANONICAL_PARAM_SCHEMA` object categorizes parameters for different components.
- **Global Initialization**: The `LinkAndGearsApp` object is attached to `globalThis` for universal access.
- **DOM Event Handling**: Listens for the `DOMContentLoaded` event to trigger the `bootstrap` function.