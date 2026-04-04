import { computeState } from "./kinematics.js";
import { createTransform, drawScene, objectDetails } from "./renderer.js";

export const DEFAULT_SCENE_TEMPLATE = {
  rail: {
    stroke: "#7c3aed",
    lineWidth: 3,
    margin: 20,
  },
  gear: {
    stroke: "#2563eb",
    fill: "#dbeafe",
    lineWidth: 2.5,
    toothStroke: "#1d4ed8",
    toothLineWidth: 3,
    minToothCount: 10,
    teethPerRadiusUnit: 10,
    toothDepthFactor: 0.1,
    minToothDepthPx: 5,
  },
  driverGear: {
    stroke: "#0f766e",
    fill: "#99f6e4",
    lineWidth: 2.5,
    toothStroke: "#115e59",
    toothLineWidth: 3,
    minToothCount: 8,
    teethPerRadiusUnit: 12,
    toothDepthFactor: 0.12,
    minToothDepthPx: 4,
    motorHubFill: "#042f2e",
    motorHubRadiusPx: 3,
  },
  centerMarker: {
    fill: "#0f172a",
    radiusPx: 4,
  },
  rotationArrow: {
    stroke: "#0ea5e9",
    fill: "#0ea5e9",
    lineWidth: 2,
    shaftLengthPx: 18,
    headLengthPx: 5,
    directionWithPositiveSpeed: -1,
  },
  crankArm: {
    stroke: "#475569",
    lineWidth: 5,
  },
  connectingRod: {
    stroke: "#f97316",
    lineWidth: 3,
  },
  crankPin: {
    fill: "#dc2626",
    radiusPx: 6,
  },
  sliderBlock: {
    fill: "#16a34a",
    horizontal: { widthPx: 28, heightPx: 22 },
    vertical: { widthPx: 22, heightPx: 28 },
  },
  grid: {
    dark: {
      visible: true,
      minPixelSpacing: 30,
      maxPixelSpacing: 80,
      majorEvery: 5,
      minorColor: "rgba(148, 163, 184, 0.16)",
      majorColor: "rgba(148, 163, 184, 0.3)",
      axisColor: "rgba(56, 189, 248, 0.5)",
      minorLineWidth: 0.7,
      majorLineWidth: 1.1,
      axisLineWidth: 1.6,
      showAxes: true,
    },
    light: {
      visible: true,
      minPixelSpacing: 30,
      maxPixelSpacing: 80,
      majorEvery: 5,
      minorColor: "rgba(71, 85, 105, 0.11)",
      majorColor: "rgba(51, 65, 85, 0.2)",
      axisColor: "rgba(37, 99, 235, 0.45)",
      minorLineWidth: 0.7,
      majorLineWidth: 1.1,
      axisLineWidth: 1.6,
      showAxes: true,
    },
  },
};

export function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }

  const output = { ...base };
  Object.keys(override).forEach((key) => {
    const baseValue = output[key];
    const overrideValue = override[key];

    if (
      baseValue &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue) &&
      overrideValue &&
      typeof overrideValue === "object" &&
      !Array.isArray(overrideValue)
    ) {
      output[key] = deepMerge(baseValue, overrideValue);
      return;
    }

    output[key] = overrideValue;
  });

  return output;
}

async function loadSceneTemplate(url) {
  if (typeof fetch !== "function") {
    return DEFAULT_SCENE_TEMPLATE;
  }

  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      return DEFAULT_SCENE_TEMPLATE;
    }

    const json = await response.json();
    return deepMerge(DEFAULT_SCENE_TEMPLATE, json);
  } catch {
    return DEFAULT_SCENE_TEMPLATE;
  }
}

function getTheme() {
  return document.body?.dataset.theme === "light" ? "light" : "dark";
}

function applyInputConstraints(constraints) {
  if (!constraints || typeof constraints !== "object") {
    return;
  }

  Object.entries(constraints).forEach(([fieldId, attrs]) => {
    const control = document.getElementById(fieldId);
    if (!control || !attrs || typeof attrs !== "object") {
      return;
    }

    ["min", "max", "step"].forEach((attrName) => {
      if (attrs[attrName] != null) {
        control.setAttribute(attrName, String(attrs[attrName]));
      }
    });
  });
}

function resolveFieldNameFromReason(reason, constraints) {
  if (typeof reason !== "string" || reason.length === 0 || !constraints || typeof constraints !== "object") {
    return null;
  }

  const normalizedReason = reason.toLowerCase();

  for (const [fieldId, fieldConstraints] of Object.entries(constraints)) {
    const reasonIncludes = Array.isArray(fieldConstraints?.reasonIncludes) ? fieldConstraints.reasonIncludes : [];
    if (reasonIncludes.some((entry) => normalizedReason.includes(String(entry).toLowerCase()))) {
      return fieldId;
    }
  }

  return normalizedReason.includes("slider_axis") ? "slider-axis" : null;
}

function getControls() {
  return {
    play_pause: document.getElementById("play-pause"),
    reset_time: document.getElementById("reset-time"),
    module: document.getElementById("shared-module"),
    z1: document.getElementById("driver-teeth-z1"),
    z2: document.getElementById("driven-teeth-z2"),
    gear_radius: document.getElementById("gear-radius"),
    crank_radius: document.getElementById("crank-radius"),
    driver_radius: document.getElementById("driver-radius"),
    rod_length: document.getElementById("rod-length"),
    motor_rpm: document.getElementById("motor-rpm"),
    angular_speed: document.getElementById("angular-speed"),
    slider_offset: document.getElementById("slider-offset"),
    slider_axis: document.getElementById("slider-axis"),
    theme_mode: document.getElementById("theme-mode"),
    derived_driver_radius: document.getElementById("derived-driver-radius"),
    derived_gear_radius: document.getElementById("derived-gear-radius"),
    derived_angular_speed: document.getElementById("derived-angular-speed"),
    selection_name: document.getElementById("selection-name"),
    selection_details: document.getElementById("selection-details"),
    selection_show_indicator_row: document.getElementById("selection-show-indicator-row"),
    selection_show_indicator: document.getElementById("selection-show-indicator"),
    workspace_preset: document.getElementById("workspace-preset"),
    new_scene: document.getElementById("new-scene"),
    save_scene_json: document.getElementById("save-scene-json"),
    reset_view: document.getElementById("reset-view"),
    scene_tree: document.getElementById("scene-tree"),
    toggle_scene_tree: document.getElementById("toggle-scene-tree"),
    scene_tree_content: document.getElementById("scene-tree-content"),
    add_gear: document.getElementById("add-gear"),
    add_joint: document.getElementById("add-joint"),
    delete_selected: document.getElementById("delete-selected"),
    status_debug: document.getElementById("status-debug"),
  };
}

export function bootstrap() {
  const canvas = document.getElementById("mechanism-canvas");
  const status = document.getElementById("status");
  if (!canvas || !status) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const controls = getControls();
  const CANONICAL_PARAM_SCHEMA = {
    gear: {
      module: "shared-module",
      z1: "driver-teeth-z1",
      z2: "driven-teeth-z2",
    },
    linkage: {
      gear_radius: "gear-radius",
      driver_radius: "driver-radius",
      crank_radius: "crank-radius",
      rod_length: "rod-length",
      slider_offset: "slider-offset",
      slider_axis: "slider-axis",
    },
    motion: {
      motor_rpm: "motor-rpm",
      angular_speed: "angular-speed",
    },
  };
  const WORKSPACE_PRESETS = {
    default: "/static/workspaces/default.json",
    "compact-fast": "/static/workspaces/compact-fast.json",
    "large-slow": "/static/workspaces/large-slow.json",
    "vertical-slider": "/static/workspaces/vertical-slider.json",
  };
  const loadedWorkspacePresets = {};
  const NEW_SCENE_BASELINE_PATH = "/static/workspaces/new-scene.json";
  const NEW_SCENE_FALLBACK = {
    "shared-module": "0.1",
    "driver-teeth-z1": "18",
    "driven-teeth-z2": "32",
    "gear-radius": "1.6",
    "driver-radius": "0.9",
    "crank-radius": "1.2",
    "rod-length": "3.2",
    "motor-rpm": "17.2",
    "angular-speed": "1.8",
    "slider-offset": "0",
    "slider-axis": "horizontal",
    "theme-mode": "dark",
  };
  const SCENE_EXPORT_CONTROL_IDS = [
    "shared-module",
    "driver-teeth-z1",
    "driven-teeth-z2",
    "gear-radius",
    "driver-radius",
    "crank-radius",
    "rod-length",
    "motor-rpm",
    "angular-speed",
    "slider-offset",
    "slider-axis",
    "theme-mode",
  ];
  const EXPORT_META = {
    app: "LinkAndGears",
    version: "1.0.0",
  };
  const simulation = {
    isPlaying: true,
    timeSeconds: 0,
    lastTimestamp: null,
    scene: DEFAULT_SCENE_TEMPLATE,
    selectedObjectId: "gear-1",
    hitRegions: [],
    sceneGraph: {
      canonicalGears: {
        "motor-1": { showIndicator: false },
        "gear-1": { showIndicator: true },
      },
      extraGears: [],
      extraJoints: [],
    },
    camera: {
      zoom: 1,
      panX: 0,
      panY: 0,
      basePanX: 0,
      basePanY: 0,
      minZoom: 0.25,
      maxZoom: 8,
    },
    pendingGearSlot: null,
    params: {
      initial_angle: 0,
      crank_angle_offset: 0,
      module: Number.NaN,
      driver_teeth: Number.NaN,
      driven_teeth: Number.NaN,
      driver_pitch_diameter: 1.8,
      driven_pitch_diameter: 3.2,
      gear_radius: 1.6,
      driver_radius: 0.9,
      crank_radius: 1.2,
      rod_length: 3.2,
      motor_rpm: 17.2,
      angular_speed: 1.8,
      slider_offset: 0,
      slider_axis: "horizontal",
    },
    normalizationError: null,
    sceneTreeDirty: true,
  };
  let isCameraPanning = false;
  let lastPanPoint = null;
  let activePanPointerId = null;
  let didPanDrag = false;
  let spacePressed = false;

  function makeNode(id, label, children = []) {
    return { id, label, children };
  }

  function canonicalGearNodes() {
    const centerDistance = simulation.params.driver_radius + simulation.params.gear_radius;
    return {
      "motor-1": {
        id: "motor-1",
        label: "Motor1",
        center: { x: -centerDistance, y: 0 },
        radius: simulation.params.driver_radius,
        showIndicator: simulation.sceneGraph.canonicalGears?.["motor-1"]?.showIndicator === true,
      },
      "gear-1": {
        id: "gear-1",
        label: "Gear1",
        center: { x: 0, y: 0 },
        radius: simulation.params.gear_radius,
        showIndicator: simulation.sceneGraph.canonicalGears?.["gear-1"]?.showIndicator === true,
      },
    };
  }

  function isGearNodeId(nodeId) {
    return typeof nodeId === "string" && (nodeId === "motor-1" || nodeId === "gear-1" || /^gear-\d+$/.test(nodeId));
  }

  function getSelectedGearNode() {
    if (!isGearNodeId(simulation.selectedObjectId)) {
      return null;
    }

    return getGearLookup()[simulation.selectedObjectId] ?? null;
  }

  function toPositiveFinite(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function clearPendingGearSlot() {
    simulation.pendingGearSlot = null;
  }

  function getPlacementSlotFromHitRegion(region) {
    if (!region || typeof region.id !== "string" || !region.id.startsWith("placement-slot:")) {
      return null;
    }

    const center = region.centerWorld;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.y)) {
      return null;
    }

    return {
      key: region.id.slice("placement-slot:".length),
      sourceGearId: region.sourceGearId,
      direction:
        region.direction && Number.isFinite(region.direction.x) && Number.isFinite(region.direction.y)
          ? { x: region.direction.x, y: region.direction.y }
          : null,
      center: { x: center.x, y: center.y },
    };
  }

  function resolvePlacementCenterFromDirection(anchorGear, newGearRadius, slot) {
    if (!anchorGear || !slot?.direction) {
      return null;
    }

    const rawX = Number(slot.direction.x);
    const rawY = Number(slot.direction.y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return null;
    }

    const magnitude = Math.hypot(rawX, rawY);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      return null;
    }

    const unitX = rawX / magnitude;
    const unitY = rawY / magnitude;
    const anchorRadius = toPositiveFinite(anchorGear.radius, toPositiveFinite(simulation.params.gear_radius, 0.1));
    const centerDistance = Math.max(0.01, anchorRadius + toPositiveFinite(newGearRadius, 0.1));

    return {
      x: anchorGear.center.x + unitX * centerDistance,
      y: anchorGear.center.y + unitY * centerDistance,
    };
  }

  function getGearLookup() {
    return {
      ...canonicalGearNodes(),
      ...Object.fromEntries(simulation.sceneGraph.extraGears.map((node) => [node.id, node])),
    };
  }

  function resolveMeshCenter(anchor, node, fallbackDirection = { x: 1, y: 0 }) {
    if (!anchor || !node) {
      return { x: 0, y: 0 };
    }

    const dx = Number.isFinite(node.center?.x) ? node.center.x - anchor.center.x : fallbackDirection.x;
    const dy = Number.isFinite(node.center?.y) ? node.center.y - anchor.center.y : fallbackDirection.y;
    const length = Math.hypot(dx, dy) || 1;
    const unit = { x: dx / length, y: dy / length };
    const distance = Math.max(0.01, toPositiveFinite(anchor.radius, 0.1) + toPositiveFinite(node.radius, 0.1));

    return {
      x: anchor.center.x + unit.x * distance,
      y: anchor.center.y + unit.y * distance,
    };
  }

  function keepGearMeshesSane(deletedNodeId = null, preferredAnchorId = null) {
    const extraGears = simulation.sceneGraph.extraGears;
    if (!Array.isArray(extraGears) || extraGears.length === 0) {
      return 0;
    }

    const lookup = getGearLookup();
    let updates = 0;

    extraGears.forEach((node) => {
      if (!node || typeof node.id !== "string") {
        return;
      }

      const currentAnchorId = node.meshWith ?? node.parentId;
      const anchorExists = typeof currentAnchorId === "string" && Boolean(lookup[currentAnchorId]);
      if (anchorExists && currentAnchorId !== deletedNodeId) {
        return;
      }

      const fallbackAnchorId =
        preferredAnchorId && lookup[preferredAnchorId]
          ? preferredAnchorId
          : currentAnchorId === deletedNodeId && lookup["gear-1"]
            ? "gear-1"
            : lookup["gear-1"]
              ? "gear-1"
              : "motor-1";
      const fallbackAnchor = lookup[fallbackAnchorId] ?? lookup["motor-1"];
      if (!fallbackAnchor) {
        return;
      }

      node.meshWith = fallbackAnchor.id;
      node.parentId = null;
      node.center = resolveMeshCenter(fallbackAnchor, node);
      node.centerMode = "manual";
      lookup[node.id] = node;
      updates += 1;
    });

    return updates;
  }

  function sanitizeExtraGearNode(rawNode, fallbackIndex = 1) {
    const id = rawNode?.id ?? `gear-${fallbackIndex}`;
    const label = rawNode?.label ?? `Gear${fallbackIndex}`;
    const moduleValue = toPositiveFinite(Number(rawNode?.module), toPositiveFinite(simulation.params.module, 0.1));
    const teethValue = Math.max(1, Math.round(toPositiveFinite(Number(rawNode?.teeth ?? rawNode?.toothCount), Number(controls.z2?.value) || 24)));
    const providedRadius = Number(rawNode?.radius);
    const derivedRadius = (moduleValue * teethValue) / 2;
    const radiusValue = toPositiveFinite(providedRadius, derivedRadius);
    const center = rawNode?.center ?? {};
    return {
      id,
      label,
      parentId: typeof rawNode?.parentId === "string" ? rawNode.parentId : null,
      meshWith: typeof rawNode?.meshWith === "string" ? rawNode.meshWith : null,
      module: moduleValue,
      teeth: teethValue,
      radius: radiusValue,
      centerMode: rawNode?.centerMode === "manual" ? "manual" : "mesh",
      center: {
        x: Number.isFinite(center.x) ? center.x : 0,
        y: Number.isFinite(center.y) ? center.y : 0,
      },
      linkageAnchor: rawNode?.linkageAnchor && typeof rawNode.linkageAnchor === "object"
        ? {
            x: Number.isFinite(rawNode.linkageAnchor.x) ? rawNode.linkageAnchor.x : 0,
            y: Number.isFinite(rawNode.linkageAnchor.y) ? rawNode.linkageAnchor.y : 0,
          }
        : null,
      showIndicator: rawNode?.showIndicator === true,
    };
  }

  function sanitizeExtraJointNode(rawNode, fallbackIndex = 1) {
    return {
      id: rawNode?.id ?? `joint-${fallbackIndex}`,
      label: rawNode?.label ?? `Joint${fallbackIndex}`,
      linkageAnchor: rawNode?.linkageAnchor && typeof rawNode.linkageAnchor === "object"
        ? {
            x: Number.isFinite(rawNode.linkageAnchor.x) ? rawNode.linkageAnchor.x : 0,
            y: Number.isFinite(rawNode.linkageAnchor.y) ? rawNode.linkageAnchor.y : 0,
          }
        : null,
    };
  }

  function setStatusMessage(message, options = {}) {
    const {
      debug = null,
      level = "info",
    } = options;

    status.textContent = message;

    const debugLabel = controls.status_debug;
    if (!debugLabel) {
      return;
    }

    if (typeof debug === "string" && debug.trim().length > 0) {
      const levelPrefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : "INFO";
      debugLabel.textContent = `${levelPrefix}: ${debug}`;
      debugLabel.dataset.level = level;
      return;
    }

    debugLabel.textContent = "No debug events.";
    debugLabel.dataset.level = "info";
  }

  function applySceneGraphConfig(sceneConfig) {
    const graph = sceneConfig?.sceneGraph ?? sceneConfig?.scene_graph ?? {};
    const inputExtraGears = Array.isArray(graph.extraGears) ? graph.extraGears : [];
    const inputExtraJoints = Array.isArray(graph.extraJoints) ? graph.extraJoints : [];
    const canonicalGears = graph.canonicalGears ?? graph.canonical_gears ?? {};
    simulation.sceneGraph.canonicalGears = {
      "motor-1": { showIndicator: canonicalGears?.["motor-1"]?.showIndicator === true },
      "gear-1": { showIndicator: canonicalGears?.["gear-1"]?.showIndicator === false ? false : true },
    };
    simulation.sceneGraph.extraGears = inputExtraGears.map((node, index) => sanitizeExtraGearNode(node, index + 2));
    simulation.sceneGraph.extraJoints = inputExtraJoints.map((node, index) => sanitizeExtraJointNode(node, index + 1));
    simulation.sceneTreeDirty = true;
    keepGearMeshesSane();
    clearPendingGearSlot();
  }

  function buildTreeModel() {
    const extraGearLookup = new Map();
    simulation.sceneGraph.extraGears.forEach((node) => {
      extraGearLookup.set(node.id, makeNode(node.id, node.label));
    });

    const rootNode = makeNode("motor-1", "Motor1", [
      makeNode("gear-1", "Gear1", [
        makeNode("linkage-1", "Linkage1", [
          makeNode("slider-1", "Slider1"),
          makeNode("ground-1", "Ground1"),
        ]),
      ]),
    ]);

    const allGears = [
      { id: "motor-1", children: rootNode.children },
      { id: "gear-1", children: rootNode.children[0].children },
      ...simulation.sceneGraph.extraGears.map((node) => ({
        id: node.id,
        children: extraGearLookup.get(node.id)?.children ?? [],
      })),
    ];
    const childrenById = new Map(allGears.map((node) => [node.id, node.children]));

    simulation.sceneGraph.extraGears.forEach((node) => {
      const childNode = extraGearLookup.get(node.id);
      if (!childNode) {
        return;
      }
      const parentId = node.meshWith ?? node.parentId ?? "motor-1";
      const targetChildren = childrenById.get(parentId) ?? rootNode.children;
      targetChildren.push(childNode);
    });

    const extraJointNodes = simulation.sceneGraph.extraJoints.map((node) => makeNode(node.id, node.label));
    rootNode.children[0].children[0].children.push(...extraJointNodes);
    return [rootNode];
  }

  function selectObjectById(objectId) {
    simulation.selectedObjectId = objectId;
    clearPendingGearSlot();
    renderScene();
  }

  function updateSceneTreeSelection() {
    if (!controls.scene_tree) {
      return;
    }

    controls.scene_tree.querySelectorAll(".scene-tree__node").forEach((nodeButton) => {
      nodeButton.setAttribute("aria-selected", String(nodeButton.dataset.objectId === simulation.selectedObjectId));
    });
  }

  function isDeletableTreeNode(nodeId) {
    return /^gear-\d+$/.test(nodeId) || /^joint-\d+$/.test(nodeId);
  }

  function deleteTreeNodeById(nodeId) {
    let removed = false;
    let deletedGear = null;

    const gearIndex = simulation.sceneGraph.extraGears.findIndex((node) => node.id === nodeId);
    if (gearIndex >= 0) {
      deletedGear = simulation.sceneGraph.extraGears[gearIndex];
      simulation.sceneGraph.extraGears.splice(gearIndex, 1);
      removed = true;
    }

    const jointIndex = simulation.sceneGraph.extraJoints.findIndex((node) => node.id === nodeId);
    if (jointIndex >= 0) {
      simulation.sceneGraph.extraJoints.splice(jointIndex, 1);
      removed = true;
    }

    if (!removed) {
      return;
    }

    let repairedCount = 0;
    let fallbackAnchorId = null;
    if (deletedGear) {
      fallbackAnchorId = deletedGear.meshWith ?? deletedGear.parentId ?? "gear-1";
      const dependents = simulation.sceneGraph.extraGears.filter(
        (node) => node.meshWith === deletedGear.id || node.parentId === deletedGear.id,
      );
      const lookup = getGearLookup();
      const fallbackAnchor = lookup[fallbackAnchorId] ?? lookup["gear-1"] ?? lookup["motor-1"];

      dependents.forEach((node, index) => {
        if (!fallbackAnchor) {
          return;
        }
        node.meshWith = fallbackAnchor.id;
        node.parentId = null;
        node.center = resolveMeshCenter(fallbackAnchor, node, { x: 1, y: index % 2 === 0 ? 1 : -1 });
        node.centerMode = "manual";
      });

      repairedCount += dependents.length;
    }

    repairedCount += keepGearMeshesSane(deletedGear?.id ?? null, fallbackAnchorId);

    if (simulation.selectedObjectId === nodeId) {
      simulation.selectedObjectId = "gear-1";
    }

    simulation.sceneTreeDirty = true;

    const removalMessage = repairedCount > 0
      ? `Removed ${nodeId}. Re-meshed ${repairedCount} gear${repairedCount === 1 ? "" : "s"}.`
      : `Removed ${nodeId} from scene tree.`;
    setStatusMessage(removalMessage, {
      debug: `deleteTreeNodeById(nodeId=${nodeId}, repairedCount=${repairedCount}, fallbackAnchor=${fallbackAnchorId ?? "none"})`,
    });
    renderScene();
  }

  function getNextDynamicNodeIndex(prefix, nodes) {
    const maxIndex = nodes.reduce((max, node) => {
      const match = node.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (!match) {
        return max;
      }
      return Math.max(max, Number(match[1]));
    }, 1);

    return maxIndex + 1;
  }

  function createTreeNodeElement(node) {
    const li = document.createElement("li");
    li.setAttribute("role", "treeitem");

    const nodeRow = document.createElement("div");
    nodeRow.className = "scene-tree__row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-tree__node";
    button.dataset.objectId = node.id;
    button.textContent = node.label;
    button.setAttribute("aria-selected", String(simulation.selectedObjectId === node.id));
    button.addEventListener("click", () => {
      selectObjectById(node.id);
    });

    nodeRow.appendChild(button);

    if (isDeletableTreeNode(node.id)) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "scene-tree__delete";
      deleteButton.dataset.objectId = node.id;
      deleteButton.setAttribute("aria-label", `Delete ${node.label}`);
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteTreeNodeById(node.id);
      });
      nodeRow.appendChild(deleteButton);
    }

    li.appendChild(nodeRow);

    if (Array.isArray(node.children) && node.children.length > 0) {
      const childList = document.createElement("ul");
      childList.setAttribute("role", "group");
      node.children.forEach((childNode) => childList.appendChild(createTreeNodeElement(childNode)));
      li.appendChild(childList);
    }

    return li;
  }

  function renderSceneTree() {
    if (!controls.scene_tree) {
      return;
    }

    controls.scene_tree.innerHTML = "";
    const model = buildTreeModel();
    model.forEach((node) => controls.scene_tree.appendChild(createTreeNodeElement(node)));
    simulation.sceneTreeDirty = false;
  }

  function clampCameraZoom(zoom) {
    const minZoom = Number.isFinite(simulation.camera.minZoom) ? simulation.camera.minZoom : 0.25;
    const maxZoom = Number.isFinite(simulation.camera.maxZoom) ? simulation.camera.maxZoom : 8;
    return Math.min(maxZoom, Math.max(minZoom, zoom));
  }

  function resetCamera() {
    simulation.camera.zoom = 1;
    simulation.camera.panX = Number.isFinite(simulation.camera.basePanX) ? simulation.camera.basePanX : 0;
    simulation.camera.panY = Number.isFinite(simulation.camera.basePanY) ? simulation.camera.basePanY : 0;
  }

  function clampCameraPan() {
    if (!Number.isFinite(simulation.camera.panX)) {
      simulation.camera.panX = Number.isFinite(simulation.camera.basePanX) ? simulation.camera.basePanX : 0;
    }

    if (!Number.isFinite(simulation.camera.panY)) {
      simulation.camera.panY = Number.isFinite(simulation.camera.basePanY) ? simulation.camera.basePanY : 0;
    }
  }

  function applyTheme(theme) {
    const normalizedTheme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = normalizedTheme;
    if (controls.theme_mode) {
      controls.theme_mode.value = normalizedTheme;
    }
  }

  function parseOptionalNumber(control) {
    const raw = control?.value?.trim() ?? "";
    if (raw === "") {
      return { present: false, value: Number.NaN };
    }

    const parsed = Number(raw);
    return { present: true, value: parsed };
  }

  function normalizeControlParams() {
    const parsed = {
      module: parseOptionalNumber(controls.module),
      z1: parseOptionalNumber(controls.z1),
      z2: parseOptionalNumber(controls.z2),
      gear_radius: Number(controls.gear_radius?.value ?? 1.6),
      driver_radius: Number(controls.driver_radius?.value ?? 0.9),
      crank_radius: Number(controls.crank_radius?.value ?? 1.2),
      rod_length: Number(controls.rod_length?.value ?? 3.2),
      motor_rpm: parseOptionalNumber(controls.motor_rpm),
      angular_speed: Number(controls.angular_speed?.value ?? 1.8),
      slider_offset: Number(controls.slider_offset?.value ?? 0),
      slider_axis: controls.slider_axis?.value === "vertical" ? "vertical" : "horizontal",
    };

    const usesCanonicalGearSet =
      Number.isFinite(parsed.module.value) &&
      parsed.module.value > 0 &&
      Number.isFinite(parsed.z1.value) &&
      parsed.z1.value > 0 &&
      Number.isFinite(parsed.z2.value) &&
      parsed.z2.value > 0;

    const driver_pitch_diameter = usesCanonicalGearSet
      ? parsed.module.value * parsed.z1.value
      : parsed.driver_radius * 2;
    const driven_pitch_diameter = usesCanonicalGearSet
      ? parsed.module.value * parsed.z2.value
      : parsed.gear_radius * 2;
    const computed_driver_radius = driver_pitch_diameter / 2;
    const computed_gear_radius = driven_pitch_diameter / 2;
    const hasRpmInput = parsed.motor_rpm.present && Number.isFinite(parsed.motor_rpm.value);
    const angularSpeedFromRpm = hasRpmInput ? (2 * Math.PI * parsed.motor_rpm.value) / 60 : Number.NaN;

    return {
      params: {
        ...simulation.params,
        param_schema: CANONICAL_PARAM_SCHEMA,
        raw_module: parsed.module.value,
        raw_driver_teeth: parsed.z1.value,
        raw_driven_teeth: parsed.z2.value,
        module: usesCanonicalGearSet ? parsed.module.value : Number.NaN,
        driver_teeth: usesCanonicalGearSet ? parsed.z1.value : Number.NaN,
        driven_teeth: usesCanonicalGearSet ? parsed.z2.value : Number.NaN,
        driver_pitch_diameter,
        driven_pitch_diameter,
        gear_radius: usesCanonicalGearSet ? computed_gear_radius : parsed.gear_radius,
        driver_radius: usesCanonicalGearSet ? computed_driver_radius : parsed.driver_radius,
        crank_radius: parsed.crank_radius,
        rod_length: parsed.rod_length,
        motor_rpm: hasRpmInput ? parsed.motor_rpm.value : Number.NaN,
        angular_speed: hasRpmInput ? angularSpeedFromRpm : parsed.angular_speed,
        slider_offset: parsed.slider_offset,
        slider_axis: parsed.slider_axis,
      },
      angularSpeedFromRpm,
    };
  }

  function syncParamsFromControls() {
    const normalization = normalizeControlParams();
    simulation.normalizationError = normalization.error ?? null;

    if (normalization.params) {
      simulation.params = {
        ...normalization.params,
        scene_graph: {
          canonicalGears: simulation.sceneGraph.canonicalGears,
          extraGears: simulation.sceneGraph.extraGears,
          extraJoints: simulation.sceneGraph.extraJoints,
        },
      };
    }

    if (controls.derived_driver_radius) {
      controls.derived_driver_radius.value = Number.isFinite(simulation.params.driver_radius)
        ? simulation.params.driver_radius.toFixed(3)
        : "";
    }

    if (controls.derived_gear_radius) {
      controls.derived_gear_radius.value = Number.isFinite(simulation.params.gear_radius)
        ? simulation.params.gear_radius.toFixed(3)
        : "";
    }

    if (controls.derived_angular_speed) {
      controls.derived_angular_speed.value = Number.isFinite(simulation.params.angular_speed)
        ? simulation.params.angular_speed.toFixed(3)
        : "";
    }
  }

  function updateSelectionPanel(state) {
    if (!controls.selection_name || !controls.selection_details) {
      return;
    }

    const data = objectDetails(simulation.selectedObjectId, simulation.params, state);
    controls.selection_name.textContent = data.title;
    controls.selection_details.innerHTML = "";

    data.details.forEach(([label, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      controls.selection_details.appendChild(dt);
      controls.selection_details.appendChild(dd);
    });

    const selectedGearNode = getSelectedGearNode();
    const canEditIndicator = Boolean(selectedGearNode);
    if (controls.selection_show_indicator_row) {
      controls.selection_show_indicator_row.hidden = !canEditIndicator;
    }
    if (controls.selection_show_indicator) {
      controls.selection_show_indicator.disabled = !canEditIndicator;
      controls.selection_show_indicator.checked = selectedGearNode?.showIndicator === true;
    }

    if (simulation.sceneTreeDirty) {
      renderSceneTree();
      return;
    }

    updateSceneTreeSelection();
  }

  function renderScene() {
    const state = computeState(simulation.params, simulation.timeSeconds);

    simulation.hitRegions = drawScene(
      ctx,
      canvas,
      simulation.params,
      state,
      simulation.scene,
      simulation.selectedObjectId,
      {
        theme: getTheme(),
        activeGearSlot: simulation.pendingGearSlot,
      },
      simulation.camera
    );

    updateSelectionPanel(state);

    if (simulation.normalizationError) {
      setStatusMessage(`Invalid parameters: ${simulation.normalizationError}`, {
        debug: simulation.normalizationError,
        level: "warn",
      });
      return;
    }

    const invalidPrefix = state.invalidCategory === "constraint" ? "Invalid parameters" : "Invalid geometry";
    const invalidField = resolveFieldNameFromReason(state.invalidReason, simulation.scene.inputConstraints);
    const invalidDetail = invalidField ? `[${invalidField}] ${state.invalidReason}` : state.invalidReason;

    setStatusMessage(
      state.valid
        ? `${simulation.isPlaying ? "Running" : "Paused"} (${simulation.params.slider_axis}) t=${simulation.timeSeconds.toFixed(2)}s`
        : `${invalidPrefix}: ${invalidDetail}`,
      {
        debug: state.valid ? null : `${state.invalidCategory ?? "unknown"}: ${state.invalidReason ?? "missing reason"}`,
        level: state.valid ? "info" : "warn",
      },
    );
  }

  function renderLoop(timestamp) {
    if (simulation.lastTimestamp == null) {
      simulation.lastTimestamp = timestamp;
    }

    const deltaS = (timestamp - simulation.lastTimestamp) / 1000;
    simulation.lastTimestamp = timestamp;

    if (simulation.isPlaying) {
      simulation.timeSeconds += Math.max(0, Math.min(deltaS, 0.05));
    }

    renderScene();
    requestAnimationFrame(renderLoop);
  }

  async function loadPresetConfig(presetName) {
    if (loadedWorkspacePresets[presetName]) {
      return loadedWorkspacePresets[presetName];
    }

    const presetPath = WORKSPACE_PRESETS[presetName];
    if (!presetPath || typeof fetch !== "function") {
      return null;
    }

    try {
      const response = await fetch(presetPath, { cache: "no-cache" });
      if (!response.ok) {
        return null;
      }

      const preset = await response.json();
      loadedWorkspacePresets[presetName] = preset;
      return preset;
    } catch {
      return null;
    }
  }

  function applySceneConfig(sceneConfig) {
    if (!sceneConfig || typeof sceneConfig !== "object") {
      return;
    }

    [
      "shared-module",
      "driver-teeth-z1",
      "driven-teeth-z2",
      "gear-radius",
      "driver-radius",
      "crank-radius",
      "rod-length",
      "motor-rpm",
      "angular-speed",
      "slider-axis",
      "slider-offset",
    ].forEach((controlId) => {
      const value = sceneConfig[controlId];
      if (value == null) {
        return;
      }

      const control = document.getElementById(controlId);
      if (!control) {
        return;
      }

      control.value = String(value);
    });

    if (sceneConfig["theme-mode"] != null) {
      applyTheme(sceneConfig["theme-mode"]);
    }

    applySceneGraphConfig(sceneConfig);

    resetCamera();
    syncParamsFromControls();
    renderScene();
  }

  function buildCurrentSceneJson() {
    const sceneConfig = {};

    SCENE_EXPORT_CONTROL_IDS.forEach((controlId) => {
      const control = document.getElementById(controlId);
      if (!control) {
        return;
      }

      sceneConfig[controlId] = String(control.value ?? "");
    });

    return sceneConfig;
  }

  function buildSceneExportPayload() {
    return {
      ...buildCurrentSceneJson(),
      sceneGraph: {
        canonicalGears: simulation.sceneGraph.canonicalGears,
        extraGears: simulation.sceneGraph.extraGears,
        extraJoints: simulation.sceneGraph.extraJoints,
      },
      _meta: {
        app: EXPORT_META.app,
        version: EXPORT_META.version,
        exportedAt: new Date().toISOString(),
      },
    };
  }

  function downloadSceneJson(payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = `scene-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function loadNewSceneBaseline() {
    if (typeof fetch !== "function") {
      return NEW_SCENE_FALLBACK;
    }

    try {
      const response = await fetch(NEW_SCENE_BASELINE_PATH, { cache: "no-cache" });
      if (!response.ok) {
        return NEW_SCENE_FALLBACK;
      }

      const json = await response.json();
      return typeof json === "object" && json ? json : NEW_SCENE_FALLBACK;
    } catch {
      return NEW_SCENE_FALLBACK;
    }
  }

  async function applyPreset(presetName) {
    const preset = await loadPresetConfig(presetName);
    if (!preset || typeof preset !== "object") {
      return;
    }

    applySceneConfig(preset);
  }

  function attachLiveUpdates(control) {
    if (!control) {
      return;
    }

    const handleInput = () => {
      syncParamsFromControls();
      renderScene();
    };

    control.addEventListener("input", handleInput);
    control.addEventListener("change", handleInput);
  }

  [
    controls.module,
    controls.z1,
    controls.z2,
    controls.gear_radius,
    controls.crank_radius,
    controls.driver_radius,
    controls.rod_length,
    controls.motor_rpm,
    controls.angular_speed,
    controls.slider_offset,
    controls.slider_axis,
  ].forEach(attachLiveUpdates);

  controls.theme_mode?.addEventListener("input", () => {
    applyTheme(controls.theme_mode.value);
    renderScene();
  });
  controls.theme_mode?.addEventListener("change", () => {
    applyTheme(controls.theme_mode.value);
    renderScene();
  });

  controls.workspace_preset?.addEventListener("input", () => {
    void applyPreset(controls.workspace_preset.value);
  });
  controls.workspace_preset?.addEventListener("change", () => {
    void applyPreset(controls.workspace_preset.value);
  });

  controls.play_pause?.addEventListener("click", () => {
    simulation.isPlaying = !simulation.isPlaying;
    controls.play_pause.textContent = simulation.isPlaying ? "Pause" : "Play";
    simulation.lastTimestamp = performance.now();
    renderScene();
  });

  controls.reset_time?.addEventListener("click", () => {
    simulation.timeSeconds = 0;
    simulation.lastTimestamp = performance.now();
    renderScene();
  });

  controls.new_scene?.addEventListener("click", async () => {
    const baseline = await loadNewSceneBaseline();
    simulation.timeSeconds = 0;
    simulation.lastTimestamp = performance.now();
    simulation.selectedObjectId = "gear-1";
    simulation.sceneGraph.canonicalGears = {
      "motor-1": { showIndicator: false },
      "gear-1": { showIndicator: true },
    };
    simulation.sceneGraph.extraGears = [];
    simulation.sceneGraph.extraJoints = [];
    simulation.sceneTreeDirty = true;
    clearPendingGearSlot();
    setStatusMessage("New scene created.", {
      debug: `Loaded baseline workspace from ${NEW_SCENE_BASELINE_PATH}.`,
    });
    applySceneConfig(baseline);
  });

  controls.save_scene_json?.addEventListener("click", () => {
    const payload = buildSceneExportPayload();
    downloadSceneJson(payload);
    setStatusMessage("Saved scene JSON", {
      debug: "Scene export finished successfully.",
    });
  });

  controls.reset_view?.addEventListener("click", () => {
    resetCamera();
    renderScene();
  });

  controls.toggle_scene_tree?.addEventListener("click", () => {
    const willCollapse = !document.body.classList.contains("scene-tree-collapsed");
    document.body.classList.toggle("scene-tree-collapsed", willCollapse);
    controls.toggle_scene_tree.textContent = willCollapse ? "Expand" : "Collapse";
    controls.toggle_scene_tree.setAttribute("aria-expanded", String(!willCollapse));
    if (controls.scene_tree_content) {
      controls.scene_tree_content.hidden = willCollapse;
    }
  });

  controls.add_gear?.addEventListener("click", () => {
    syncParamsFromControls();
    const index = getNextDynamicNodeIndex("gear", simulation.sceneGraph.extraGears);
    const id = `gear-${index}`;
    const canonicalModule = toPositiveFinite(Number(controls.module?.value), toPositiveFinite(simulation.params.module, 0.1));
    const canonicalDrivenTeeth = Math.max(1, Math.round(toPositiveFinite(Number(controls.z2?.value), 24)));
    const radius = (canonicalModule * canonicalDrivenTeeth) / 2;
    const selectedIsGear = typeof simulation.selectedObjectId === "string" && (simulation.selectedObjectId === "gear-1" || /^gear-\d+$/.test(simulation.selectedObjectId));

    const gearLookup = {
      ...canonicalGearNodes(),
      ...Object.fromEntries(simulation.sceneGraph.extraGears.map((node) => [node.id, node])),
    };

    const slot = simulation.pendingGearSlot;
    const selectedGearFromSlot = typeof slot?.sourceGearId === "string" ? gearLookup[slot.sourceGearId] : null;
    const selectedGearFromSelection = selectedIsGear ? gearLookup[simulation.selectedObjectId] : null;
    const relationTarget = selectedGearFromSlot ?? selectedGearFromSelection ?? gearLookup["motor-1"];
    const shouldMesh = Boolean(relationTarget);
    const meshCenterFromDirection = shouldMesh ? resolvePlacementCenterFromDirection(relationTarget, radius, slot) : null;
    const center = meshCenterFromDirection
      ? meshCenterFromDirection
      : shouldMesh
        ? {
            x: relationTarget.center.x + relationTarget.radius + radius,
            y: relationTarget.center.y,
          }
        : {
            x: relationTarget.center.x,
            y: relationTarget.center.y,
          };

    simulation.sceneGraph.extraGears.push({
      id,
      label: `Gear${index}`,
      parentId: shouldMesh ? null : "motor-1",
      meshWith: shouldMesh ? relationTarget.id : null,
      module: canonicalModule,
      teeth: canonicalDrivenTeeth,
      radius,
      centerMode: shouldMesh ? "manual" : "parent",
      center,
      linkageAnchor: null,
      showIndicator: false,
    });
    simulation.sceneTreeDirty = true;
    clearPendingGearSlot();
    selectObjectById(id);
  });

  controls.add_joint?.addEventListener("click", () => {
    const index = getNextDynamicNodeIndex("joint", simulation.sceneGraph.extraJoints);
    const id = `joint-${index}`;
    simulation.sceneGraph.extraJoints.push({ id, label: `Joint${index}` });
    simulation.sceneTreeDirty = true;
    selectObjectById(id);
  });

  function deleteSelectedNode() {
    if (!isDeletableTreeNode(simulation.selectedObjectId)) {
      setStatusMessage("Select an extra gear or joint to delete.", {
        debug: `deleteSelectedNode ignored; selectedObjectId=${simulation.selectedObjectId ?? "none"}.`,
        level: "warn",
      });
      return;
    }

    deleteTreeNodeById(simulation.selectedObjectId);
  }

  controls.delete_selected?.addEventListener("click", () => {
    deleteSelectedNode();
  });

  controls.selection_show_indicator?.addEventListener("change", () => {
    const selectedId = simulation.selectedObjectId;
    if (!isGearNodeId(selectedId)) {
      return;
    }

    const nextValue = controls.selection_show_indicator.checked === true;
    if (selectedId === "motor-1" || selectedId === "gear-1") {
      simulation.sceneGraph.canonicalGears[selectedId] = { showIndicator: nextValue };
    } else {
      const gearNode = simulation.sceneGraph.extraGears.find((node) => node.id === selectedId);
      if (!gearNode) {
        return;
      }
      gearNode.showIndicator = nextValue;
    }

    syncParamsFromControls();
    renderScene();
  });

  function getCanvasPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function canStartPan(event) {
    const isMiddleMouse = event.button === 1 || (event.buttons & 4) === 4;
    const isSpaceDrag = spacePressed && (event.button === 0 || (event.buttons & 1) === 1);
    return isMiddleMouse || isSpaceDrag;
  }

  canvas.addEventListener("click", (event) => {
    if (isCameraPanning || didPanDrag) {
      didPanDrag = false;
      return;
    }

    const point = getCanvasPointFromEvent(event);
    const matched = simulation.hitRegions.find((region) => region.contains(point));
    const matchedSlot = getPlacementSlotFromHitRegion(matched);

    if (matchedSlot) {
      simulation.pendingGearSlot = matchedSlot;
      setStatusMessage("Placement slot selected. Click Add Gear to create the new gear.", {
        debug: `Pending gear slot anchored to ${simulation.pendingGearSlot.anchorId}.`,
      });
      renderScene();
      return;
    }

    clearPendingGearSlot();
    simulation.selectedObjectId = matched ? matched.id : null;
    renderScene();
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();

    const canvasPoint = getCanvasPointFromEvent(event);
    const transformBefore = createTransform(canvas, simulation.params, simulation.camera);
    const worldBefore = transformBefore.toWorld(canvasPoint);
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    simulation.camera.zoom = clampCameraZoom(simulation.camera.zoom * zoomFactor);

    const transformAfter = createTransform(canvas, simulation.params, simulation.camera);
    const worldAfter = transformAfter.toWorld(canvasPoint);
    simulation.camera.panX += worldBefore.x - worldAfter.x;
    simulation.camera.panY += worldBefore.y - worldAfter.y;
    clampCameraPan();

    renderScene();
  }, { passive: false });

  canvas.addEventListener("pointerdown", (event) => {
    if (!canStartPan(event)) {
      return;
    }

    event.preventDefault();
    isCameraPanning = true;
    didPanDrag = false;
    activePanPointerId = event.pointerId;
    lastPanPoint = getCanvasPointFromEvent(event);
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!isCameraPanning || !lastPanPoint || event.pointerId !== activePanPointerId) {
      return;
    }

    const nextPoint = getCanvasPointFromEvent(event);
    const deltaX = nextPoint.x - lastPanPoint.x;
    const deltaY = nextPoint.y - lastPanPoint.y;
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      didPanDrag = true;
    }

    const transform = createTransform(canvas, simulation.params, simulation.camera);
    if (transform.scale > 0) {
      simulation.camera.panX -= deltaX / transform.scale;
      simulation.camera.panY += deltaY / transform.scale;
      clampCameraPan();
    }

    lastPanPoint = nextPoint;
    renderScene();
  });

  function stopCameraPan(event) {
    if (event && activePanPointerId !== null && event.pointerId !== activePanPointerId) {
      return;
    }

    if (event && activePanPointerId !== null) {
      canvas.releasePointerCapture?.(activePanPointerId);
    }

    isCameraPanning = false;
    lastPanPoint = null;
    activePanPointerId = null;
  }

  document.addEventListener("keydown", (event) => {
    if (event.code === "Delete" || event.code === "Backspace") {
      const target = event.target;
      const isTypingTarget = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);

      if (!isTypingTarget && isDeletableTreeNode(simulation.selectedObjectId)) {
        event.preventDefault();
        deleteSelectedNode();
        return;
      }
    }

    if (event.code === "Space") {
      spacePressed = true;
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spacePressed = false;
    }
  });

  window.addEventListener("blur", () => {
    spacePressed = false;
    stopCameraPan();
  });

  canvas.addEventListener("pointerup", stopCameraPan);
  canvas.addEventListener("pointercancel", stopCameraPan);
  canvas.addEventListener("mouseleave", stopCameraPan);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  applyTheme(controls.theme_mode?.value);
  applyInputConstraints(simulation.scene.inputConstraints);
  renderSceneTree();
  void applyPreset(controls.workspace_preset?.value ?? "default");
  loadSceneTemplate("/static/templates/default-scene.json").then((scene) => {
    simulation.scene = scene;
    applyInputConstraints(simulation.scene.inputConstraints);
    renderScene();
  });

  renderScene();
  requestAnimationFrame(renderLoop);
}

if (typeof globalThis !== "undefined") {
  globalThis.LinkAndGearsController = { bootstrap, deepMerge, DEFAULT_SCENE_TEMPLATE };
}
