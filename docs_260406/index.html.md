# Structural Explanation of index.html

## Purpose

The `index.html` file is the main HTML document for the LinkAndGears application. It defines the structure of the user interface (UI) and links to the necessary styles and scripts.

## Key Sections

### 1. **Head Section**

- **Metadata**: Sets the character encoding to UTF-8 and ensures the page is responsive with the viewport meta tag.
- **Title**: Displays "LinkAndGears" as the page title.
- **Stylesheet**: Links to the `style.css` file for styling.

### 2. **Body Section**

The body is divided into three main panels:

#### a. **Scene Tree Panel**

- **Purpose**: Displays the hierarchy of the mechanism.
- **Key Elements**:
  - Header with a title and a toggle button.
  - Action buttons for adding gears, joints, and deleting selected items.
  - A tree structure (`<ul>`) to represent the mechanism hierarchy.

#### b. **Viewer Panel**

- **Purpose**: Displays the main canvas and controls for interacting with the mechanism.
- **Key Elements**:
  - Workspace preset dropdown to select different configurations.
  - Buttons for creating a new scene, resetting the view, refreshing, saving, and controlling playback.
  - A `<canvas>` element for rendering the mechanism.
  - Tips for interacting with the canvas (e.g., zoom, pan).
  - Selection and debug panels for showing details about selected objects and debug information.

#### c. **Controls Panel**

- **Purpose**: Provides controls for modifying the mechanism and viewing derived values.
- **Key Elements**:
  - Theme selector to switch between dark and light modes.
  - Input fields for global scene properties (e.g., crank radius, rod length).
  - A section for editing properties of selected nodes.
  - Read-only fields for derived values like effective driver radius and motor speed.

### 3. **Script Section**

- **Purpose**: Links the `app.js` script to add interactivity to the page.
- **Type**: Uses the `type="module"` attribute to enable ES6 module support.

## Hierarchy Overview

1. **Main Layout**
   - `<main>`: Contains the three primary panels (Scene Tree, Viewer, Controls).
2. **Scene Tree Panel**
   - `<aside>`: Represents the scene tree with actions and hierarchy.
3. **Viewer Panel**
   - `<section>`: Contains the canvas, controls, and debug information.
4. **Controls Panel**
   - `<section>`: Provides inputs for modifying the scene and viewing derived values.
5. **Script**
   - `<script>`: Links the JavaScript file for functionality.

## Notes

- The file is designed to be responsive and accessible, with ARIA attributes for better usability.
- The structure ensures a clear separation of concerns, with styling in `style.css` and interactivity in `app.js`.
