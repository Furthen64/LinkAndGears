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
    secondaryFill: "#f97316",
    lineWidth: 1.5,
    radiusPx: 4,
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
    crank_radius: document.getElementById("crank-radius"),
    rod_length: document.getElementById("rod-length"),
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
    refresh_view: document.getElementById("refresh-view"),
    scene_tree: document.getElementById("scene-tree"),
    toggle_scene_tree: document.getElementById("toggle-scene-tree"),
    scene_tree_content: document.getElementById("scene-tree-content"),
    add_gear: document.getElementById("add-gear"),
    add_joint: document.getElementById("add-joint"),
    delete_selected: document.getElementById("delete-selected"),
    status_debug: document.getElementById("status-debug"),
    selected_node_properties: document.getElementById("selected-node-properties"),
    node_properties_empty: document.getElementById("node-properties-empty"),
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
  const NODE_PARAM_SCHEMA = {
    gear: [
      { key: "module", label: "Module m", input: "number", step: "0.01", min: "0.001", defaultValue: 0.1 },
      { key: "teeth", label: "Teeth", input: "number", step: "1", min: "6", defaultValue: 32 },
      { key: "radiusMode", label: "Radius mode", input: "select", options: ["moduleTeeth", "manual"], defaultValue: "moduleTeeth" },
      { key: "radius", label: "Radius", input: "number", step: "0.01", min: "0.001", defaultValue: 1.6 },
      { key: "meshWith", label: "Mesh with node id", input: "text", defaultValue: "motor-1" },
      { key: "showIndicator", label: "Show indicator", input: "checkbox", defaultValue: true },
    ],
    motor: [
      { key: "module", label: "Module m", input: "number", step: "0.01", min: "0.001", defaultValue: 0.1 },
      { key: "teeth", label: "Teeth", input: "number", step: "1", min: "6", defaultValue: 18 },
      { key: "radiusMode", label: "Radius mode", input: "select", options: ["moduleTeeth", "manual"], defaultValue: "moduleTeeth" },
      { key: "radius", label: "Radius", input: "number", step: "0.01", min: "0.001", defaultValue: 0.9 },
      { key: "meshWith", label: "Mesh with node id", input: "text", defaultValue: "" },
      { key: "showIndicator", label: "Show indicator", input: "checkbox", defaultValue: false },
      { key: "inputRpm", label: "Motor speed (RPM)", input: "number", step: "0.1", defaultValue: 17.2 },
      { key: "inputAngularSpeed", label: "Manual angular speed (rad/s)", input: "number", step: "0.1", defaultValue: 1.8 },
    ],
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
    "crank-radius": "1.2",
    "rod-length": "3.2",
    "slider-offset": "0",
    "slider-axis": "horizontal",
    "theme-mode": "dark",
    sceneGraph: {
      rootNodeId: "motor-1",
      genesisNodeId: "motor-1",
      genesisPolicy: {
        allowedTypes: ["motor", "joint-anchor"],
      },
      canonicalGears: {
        "motor-1": { showIndicator: false, module: 0.1, teeth: 18, radiusMode: "moduleTeeth", radius: 0.9, inputRpm: 17.2, inputAngularSpeed: 1.8, meshWith: null },
        "gear-1": { showIndicator: true, module: 0.1, teeth: 32, radiusMode: "moduleTeeth", radius: 1.6, meshWith: "motor-1" },
      },
      extraGears: [],
      extraJoints: [],
      deletedCanonicalNodeIds: [],
      parentChildEdges: [],
    },
  };
  const SCENE_EXPORT_CONTROL_IDS = [
    "crank-radius",
    "rod-length",
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
      rootNodeId: "motor-1",
      genesisNodeId: "motor-1",
      genesisPolicy: {
        allowedTypes: ["motor", "joint-anchor"],
      },
      canonicalGears: {
        "motor-1": { showIndicator: false, module: 0.1, teeth: 18, radiusMode: "moduleTeeth", radius: 0.9, inputRpm: 17.2, inputAngularSpeed: 1.8, meshWith: null },
        "gear-1": { showIndicator: true, module: 0.1, teeth: 32, radiusMode: "moduleTeeth", radius: 1.6, meshWith: "motor-1" },
      },
      extraGears: [],
      extraJoints: [],
      deletedCanonicalNodeIds: [],
      parentChildEdges: [],
      nodeRegistry: {},
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

  function normalizeNodeType(rawType) {
    if (typeof rawType !== "string") {
      return "gear";
    }
    return rawType.toLowerCase() === "joint-anchor" ? "joint-anchor" : rawType.toLowerCase();
  }

  function isAllowedGenesisType(nodeType, policy = simulation.sceneGraph.genesisPolicy) {
    const normalizedType = normalizeNodeType(nodeType);
    const allowed = Array.isArray(policy?.allowedTypes) ? policy.allowedTypes : ["motor", "joint-anchor"];
    return allowed.map((entry) => normalizeNodeType(entry)).includes(normalizedType);
  }

  function getDeletedCanonicalNodeIds() {
    return Array.isArray(simulation.sceneGraph.deletedCanonicalNodeIds)
      ? simulation.sceneGraph.deletedCanonicalNodeIds
      : [];
  }

  function canonicalGearNodes() {
    const motorConfig = simulation.sceneGraph.canonicalGears?.["motor-1"] ?? {};
    const drivenConfig = simulation.sceneGraph.canonicalGears?.["gear-1"] ?? {};
    const resolveRadius = (config, fallback) => {
      const moduleValue = Number(config.module);
      const teethValue = Number(config.teeth);
      if (config.radiusMode !== "manual" && Number.isFinite(moduleValue) && moduleValue > 0 && Number.isFinite(teethValue) && teethValue > 0) {
        return (moduleValue * teethValue) / 2;
      }
      const radiusValue = Number(config.radius);
      return Number.isFinite(radiusValue) && radiusValue > 0 ? radiusValue : fallback;
    };
    const motorRadius = resolveRadius(motorConfig, 0.9);
    const drivenRadius = resolveRadius(drivenConfig, 1.6);
    const centerDistance = motorRadius + drivenRadius;
    return {
      "motor-1": {
        id: "motor-1",
        label: "Motor1",
        center: { x: -centerDistance, y: 0 },
        radius: motorRadius,
        showIndicator: motorConfig.showIndicator === true,
        module: Number(motorConfig.module),
        teeth: Number(motorConfig.teeth),
        radiusMode: motorConfig.radiusMode ?? "moduleTeeth",
        meshWith: motorConfig.meshWith === undefined ? null : motorConfig.meshWith,
        inputRpm: Number(motorConfig.inputRpm),
        inputAngularSpeed: Number(motorConfig.inputAngularSpeed),
      },
      "gear-1": {
        id: "gear-1",
        label: "Gear1",
        center: { x: 0, y: 0 },
        radius: drivenRadius,
        showIndicator: drivenConfig.showIndicator !== false,
        module: Number(drivenConfig.module),
        teeth: Number(drivenConfig.teeth),
        radiusMode: drivenConfig.radiusMode ?? "moduleTeeth",
        meshWith: drivenConfig.meshWith ?? "motor-1",
      },
    };
  }

  function canonicalSceneNodes() {
    const gears = canonicalGearNodes();
    const canonicalNodes = {
      "motor-1": {
        id: "motor-1",
        label: "Motor1",
        type: "motor",
        parentId: null,
        attachmentTargetId: null,
        meshWith:
          gears["motor-1"].meshWith === undefined
            ? (simulation.sceneGraph.canonicalGears?.["motor-1"]?.meshWith === undefined
              ? null
              : simulation.sceneGraph.canonicalGears?.["motor-1"]?.meshWith)
            : gears["motor-1"].meshWith,
        ...gears["motor-1"],
      },
      "gear-1": {
        id: "gear-1",
        label: "Gear1",
        type: "gear",
        parentId: "motor-1",
        attachmentTargetId: "motor-1",
        meshWith: gears["gear-1"].meshWith ?? simulation.sceneGraph.canonicalGears?.["gear-1"]?.meshWith ?? "motor-1",
        ...gears["gear-1"],
      },
      "linkage-1": {
        id: "linkage-1",
        label: "Linkage1",
        type: "linkage-anchor",
        parentId: "gear-1",
        attachmentTargetId: "gear-1",
      },
      "slider-1": {
        id: "slider-1",
        label: "Slider1",
        type: "slider",
        parentId: "linkage-1",
        attachmentTargetId: "linkage-1",
      },
      "ground-1": {
        id: "ground-1",
        label: "Ground1",
        type: "ground-anchor",
        parentId: "linkage-1",
        attachmentTargetId: "linkage-1",
      },
    };
    const deletedCanonical = new Set(getDeletedCanonicalNodeIds());
    if (deletedCanonical.size === 0) {
      return canonicalNodes;
    }

    const childMap = new Map();
    Object.values(canonicalNodes).forEach((node) => {
      if (!node?.parentId) {
        return;
      }
      if (!childMap.has(node.parentId)) {
        childMap.set(node.parentId, []);
      }
      childMap.get(node.parentId).push(node.id);
    });

    const cascadeDeleted = new Set(deletedCanonical);
    const queue = [...deletedCanonical];
    while (queue.length > 0) {
      const currentId = queue.shift();
      (childMap.get(currentId) ?? []).forEach((childId) => {
        if (!cascadeDeleted.has(childId)) {
          cascadeDeleted.add(childId);
          queue.push(childId);
        }
      });
    }

    return Object.fromEntries(
      Object.entries(canonicalNodes).filter(([nodeId]) => !cascadeDeleted.has(nodeId)),
    );
  }

  function getRootNodeId() {
    return typeof simulation.sceneGraph.rootNodeId === "string" ? simulation.sceneGraph.rootNodeId : "motor-1";
  }

  function getPrimaryDrivenGearId() {
    const registry = simulation.sceneGraph.nodeRegistry ?? {};
    const rootId = getRootNodeId();
    const driven = Object.values(registry).find((node) => {
      const attachment = node?.meshWith ?? node?.parentId ?? node?.attachmentTargetId;
      return attachment === rootId && normalizeNodeType(node?.type) === "gear";
    });
    return driven?.id ?? (registry["gear-1"] ? "gear-1" : rootId);
  }

  function rebuildNodeRegistry() {
    const registry = {};
    const canonicalNodes = canonicalSceneNodes();
    Object.values(canonicalNodes).forEach((node) => {
      registry[node.id] = { ...node };
    });

    simulation.sceneGraph.extraGears.forEach((node) => {
      registry[node.id] = {
        ...node,
        type: "gear",
        attachmentTargetId: node.parentId ?? node.meshWith ?? simulation.sceneGraph.rootNodeId,
      };
    });

    simulation.sceneGraph.extraJoints.forEach((node) => {
      registry[node.id] = {
        ...node,
        type: normalizeNodeType(node.type ?? "joint-anchor"),
        attachmentTargetId: node.parentId ?? node.attachmentTargetId ?? "linkage-1",
      };
    });

    simulation.sceneGraph.nodeRegistry = registry;
    simulation.sceneGraph.parentChildEdges = Object.values(registry)
      .filter((node) => typeof node?.parentId === "string" && typeof node?.id === "string" && node.id !== node.parentId)
      .map((node) => ({ parentId: node.parentId, childId: node.id }));
  }

  function buildEdgeMaps() {
    const edges = Array.isArray(simulation.sceneGraph.parentChildEdges) ? simulation.sceneGraph.parentChildEdges : [];
    const parentByChild = new Map();
    const childrenByParent = new Map();

    edges.forEach((edge) => {
      if (!edge || typeof edge.parentId !== "string" || typeof edge.childId !== "string" || edge.parentId === edge.childId) {
        return;
      }
      parentByChild.set(edge.childId, edge.parentId);
      if (!childrenByParent.has(edge.parentId)) {
        childrenByParent.set(edge.parentId, []);
      }
      childrenByParent.get(edge.parentId).push(edge.childId);
    });

    return { parentByChild, childrenByParent };
  }

  function isGearNodeId(nodeId) {
    return typeof nodeId === "string"
      && (nodeId === getRootNodeId() || nodeId === getPrimaryDrivenGearId() || /^gear-\d+$/.test(nodeId));
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
          : currentAnchorId === deletedNodeId && lookup[getPrimaryDrivenGearId()]
            ? getPrimaryDrivenGearId()
            : lookup[getPrimaryDrivenGearId()]
              ? getPrimaryDrivenGearId()
              : getRootNodeId();
      const fallbackAnchor = lookup[fallbackAnchorId] ?? lookup[getRootNodeId()];
      if (!fallbackAnchor) {
        return;
      }

      node.meshWith = fallbackAnchor.id;
      node.parentId = fallbackAnchor.id;
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
    const teethValue = Math.max(1, Math.round(toPositiveFinite(Number(rawNode?.teeth ?? rawNode?.toothCount), 24)));
    const providedRadius = Number(rawNode?.radius);
    const derivedRadius = (moduleValue * teethValue) / 2;
    const radiusValue = toPositiveFinite(providedRadius, derivedRadius);
    const center = rawNode?.center ?? {};
    return {
      id,
      label,
      parentId: typeof rawNode?.parentId === "string"
        ? rawNode.parentId
        : typeof rawNode?.meshWith === "string"
          ? rawNode.meshWith
          : null,
      meshWith: typeof rawNode?.meshWith === "string" ? rawNode.meshWith : null,
      module: moduleValue,
      teeth: teethValue,
      radiusMode: rawNode?.radiusMode === "manual" ? "manual" : "moduleTeeth",
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
    const resolvedParentId = typeof rawNode?.parentId === "string"
      ? rawNode.parentId
      : typeof rawNode?.attachmentTargetId === "string"
        ? rawNode.attachmentTargetId
        : getRootNodeId();
    return {
      id: rawNode?.id ?? `joint-${fallbackIndex}`,
      label: rawNode?.label ?? `Joint${fallbackIndex}`,
      type: normalizeNodeType(rawNode?.type ?? "joint-anchor"),
      parentId: resolvedParentId,
      attachmentTargetId: typeof rawNode?.attachmentTargetId === "string"
        ? rawNode.attachmentTargetId
        : resolvedParentId,
      linkageAnchor: rawNode?.linkageAnchor && typeof rawNode.linkageAnchor === "object"
        ? {
            x: Number.isFinite(rawNode.linkageAnchor.x) ? rawNode.linkageAnchor.x : 0,
            y: Number.isFinite(rawNode.linkageAnchor.y) ? rawNode.linkageAnchor.y : 0,
          }
        : null,
    };
  }

  function sanitizeRegistryNode(rawNode, fallback = {}) {
    return {
      ...rawNode,
      id: rawNode?.id ?? fallback.id,
      label: rawNode?.label ?? fallback.label ?? rawNode?.id ?? fallback.id,
      type: normalizeNodeType(rawNode?.type ?? fallback.type ?? "gear"),
      parentId: typeof rawNode?.parentId === "string" ? rawNode.parentId : (fallback.parentId ?? null),
      attachmentTargetId: typeof rawNode?.attachmentTargetId === "string"
        ? rawNode.attachmentTargetId
        : (typeof rawNode?.parentId === "string" ? rawNode.parentId : (fallback.attachmentTargetId ?? null)),
      center: rawNode?.center && typeof rawNode.center === "object"
        ? {
            x: Number.isFinite(rawNode.center.x) ? rawNode.center.x : 0,
            y: Number.isFinite(rawNode.center.y) ? rawNode.center.y : 0,
          }
        : (fallback.center ?? { x: 0, y: 0 }),
      module: Number.isFinite(Number(rawNode?.module)) ? Number(rawNode.module) : fallback.module,
      teeth: Number.isFinite(Number(rawNode?.teeth ?? rawNode?.toothCount))
        ? Number(rawNode.teeth ?? rawNode.toothCount)
        : fallback.teeth,
      radiusMode: rawNode?.radiusMode === "manual" ? "manual" : (fallback.radiusMode ?? "moduleTeeth"),
      radius: Number.isFinite(Number(rawNode?.radius)) ? Number(rawNode.radius) : fallback.radius,
      meshWith: typeof rawNode?.meshWith === "string" ? rawNode.meshWith : (fallback.meshWith ?? null),
      inputRpm: Number.isFinite(Number(rawNode?.inputRpm)) ? Number(rawNode.inputRpm) : fallback.inputRpm,
      inputAngularSpeed: Number.isFinite(Number(rawNode?.inputAngularSpeed ?? rawNode?.angularSpeed))
        ? Number(rawNode.inputAngularSpeed ?? rawNode.angularSpeed)
        : fallback.inputAngularSpeed,
      showIndicator: rawNode?.showIndicator === true,
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
    const graph = sceneConfig?.sceneGraph ?? {};
    const inputExtraGears = Array.isArray(graph.extraGears) ? graph.extraGears : [];
    const inputExtraJoints = Array.isArray(graph.extraJoints) ? graph.extraJoints : [];
    const canonicalGears = graph.canonicalGears ?? {};
    simulation.sceneGraph.canonicalGears = {
      "motor-1": {
        showIndicator: canonicalGears?.["motor-1"]?.showIndicator === true,
        module: Number.isFinite(Number(canonicalGears?.["motor-1"]?.module))
          ? Number(canonicalGears?.["motor-1"]?.module)
          : 0.1,
        teeth: Number.isFinite(Number(canonicalGears?.["motor-1"]?.teeth))
          ? Number(canonicalGears?.["motor-1"]?.teeth)
          : 18,
        radiusMode: canonicalGears?.["motor-1"]?.radiusMode === "manual" ? "manual" : "moduleTeeth",
        radius: Number.isFinite(Number(canonicalGears?.["motor-1"]?.radius))
          ? Number(canonicalGears?.["motor-1"]?.radius)
          : 0.9,
        meshWith: null,
        inputRpm: Number.isFinite(Number(canonicalGears?.["motor-1"]?.inputRpm))
          ? Number(canonicalGears?.["motor-1"]?.inputRpm)
          : 17.2,
        inputAngularSpeed: Number.isFinite(Number(canonicalGears?.["motor-1"]?.inputAngularSpeed))
          ? Number(canonicalGears?.["motor-1"]?.inputAngularSpeed)
          : 1.8,
      },
      "gear-1": {
        showIndicator: canonicalGears?.["gear-1"]?.showIndicator === false ? false : true,
        module: Number.isFinite(Number(canonicalGears?.["gear-1"]?.module))
          ? Number(canonicalGears?.["gear-1"]?.module)
          : 0.1,
        teeth: Number.isFinite(Number(canonicalGears?.["gear-1"]?.teeth))
          ? Number(canonicalGears?.["gear-1"]?.teeth)
          : 32,
        radiusMode: canonicalGears?.["gear-1"]?.radiusMode === "manual" ? "manual" : "moduleTeeth",
        radius: Number.isFinite(Number(canonicalGears?.["gear-1"]?.radius))
          ? Number(canonicalGears?.["gear-1"]?.radius)
          : 1.6,
        meshWith: canonicalGears?.["gear-1"]?.meshWith ?? "motor-1",
      },
    };
    simulation.sceneGraph.extraGears = inputExtraGears.map((node, index) => sanitizeExtraGearNode(node, index + 2));
    simulation.sceneGraph.extraJoints = inputExtraJoints.map((node, index) => sanitizeExtraJointNode(node, index + 1));
    simulation.sceneGraph.deletedCanonicalNodeIds = Array.isArray(graph.deletedCanonicalNodeIds)
      ? graph.deletedCanonicalNodeIds.filter((id) => typeof id === "string")
      : [];
    simulation.sceneGraph.rootNodeId = typeof graph.rootNodeId === "string" ? graph.rootNodeId : "motor-1";
    simulation.sceneGraph.genesisNodeId = typeof graph.genesisNodeId === "string"
      ? graph.genesisNodeId
      : simulation.sceneGraph.rootNodeId;
    simulation.sceneGraph.genesisPolicy = {
      allowedTypes: Array.isArray(graph.genesisPolicy?.allowedTypes)
        ? graph.genesisPolicy.allowedTypes.map((entry) => normalizeNodeType(entry))
        : ["motor", "joint-anchor"],
    };
    simulation.sceneTreeDirty = true;
    keepGearMeshesSane();
    rebuildNodeRegistry();
    const providedRegistry = graph?.nodeRegistry && typeof graph.nodeRegistry === "object" ? graph.nodeRegistry : null;
    if (providedRegistry && Object.keys(providedRegistry).length > 0) {
      const resolvedRegistry = {};
      Object.entries(providedRegistry).forEach(([nodeId, node]) => {
        if (!node || typeof node !== "object") {
          return;
        }
        resolvedRegistry[nodeId] = sanitizeRegistryNode(node, { id: nodeId, label: nodeId });
      });
      simulation.sceneGraph.nodeRegistry = resolvedRegistry;
      simulation.sceneGraph.parentChildEdges = Object.values(resolvedRegistry)
        .filter((node) => typeof node?.parentId === "string" && node.parentId !== node.id)
        .map((node) => ({ parentId: node.parentId, childId: node.id }));

      const rootFromRegistry = resolvedRegistry["motor-1"] ?? resolvedRegistry[simulation.sceneGraph.rootNodeId];
      const drivenFromRegistry = resolvedRegistry["gear-1"]
        ?? Object.values(resolvedRegistry).find((node) => node?.meshWith === (rootFromRegistry?.id ?? "motor-1") && node.type === "gear");
      if (rootFromRegistry) {
        simulation.sceneGraph.canonicalGears["motor-1"] = {
          showIndicator: rootFromRegistry.showIndicator === true,
          module: Number.isFinite(rootFromRegistry.module) ? rootFromRegistry.module : 0.1,
          teeth: Number.isFinite(rootFromRegistry.teeth) ? rootFromRegistry.teeth : 18,
          radiusMode: rootFromRegistry.radiusMode === "manual" ? "manual" : "moduleTeeth",
          radius: Number.isFinite(rootFromRegistry.radius) ? rootFromRegistry.radius : 0.9,
          meshWith: null,
          inputRpm: Number.isFinite(rootFromRegistry.inputRpm) ? rootFromRegistry.inputRpm : 17.2,
          inputAngularSpeed: Number.isFinite(rootFromRegistry.inputAngularSpeed) ? rootFromRegistry.inputAngularSpeed : 1.8,
        };
      }
      if (drivenFromRegistry) {
        simulation.sceneGraph.canonicalGears["gear-1"] = {
          showIndicator: drivenFromRegistry.showIndicator !== false,
          module: Number.isFinite(drivenFromRegistry.module) ? drivenFromRegistry.module : 0.1,
          teeth: Number.isFinite(drivenFromRegistry.teeth) ? drivenFromRegistry.teeth : 32,
          radiusMode: drivenFromRegistry.radiusMode === "manual" ? "manual" : "moduleTeeth",
          radius: Number.isFinite(drivenFromRegistry.radius) ? drivenFromRegistry.radius : 1.6,
          meshWith: drivenFromRegistry.meshWith ?? rootFromRegistry?.id ?? "motor-1",
        };
      }
      simulation.sceneGraph.extraGears = Object.values(resolvedRegistry)
        .filter((node) => node.type === "gear" && node.id !== "gear-1")
        .map((node, index) => sanitizeExtraGearNode(node, index + 2));
      simulation.sceneGraph.extraJoints = Object.values(resolvedRegistry)
        .filter((node) => node.type !== "gear" && node.type !== "motor" && !["linkage-1", "slider-1", "ground-1"].includes(node.id))
        .map((node, index) => sanitizeExtraJointNode(node, index + 1));

      simulation.sceneGraph.deletedCanonicalNodeIds = ["gear-1", "linkage-1", "slider-1", "ground-1"]
        .filter((nodeId) => !resolvedRegistry[nodeId]);
    }
    if (!simulation.sceneGraph.nodeRegistry?.[simulation.sceneGraph.rootNodeId]) {
      simulation.sceneGraph.rootNodeId = "motor-1";
    }
    const resolvedRootNode = simulation.sceneGraph.nodeRegistry?.[simulation.sceneGraph.rootNodeId];
    if (resolvedRootNode) {
      resolvedRootNode.meshWith = null;
    }
    if (simulation.sceneGraph.canonicalGears?.["motor-1"]) {
      simulation.sceneGraph.canonicalGears["motor-1"].meshWith = null;
    }
    const genesisType = simulation.sceneGraph.nodeRegistry?.[simulation.sceneGraph.genesisNodeId]?.type ?? "motor";
    if (!isAllowedGenesisType(genesisType, simulation.sceneGraph.genesisPolicy)) {
      simulation.sceneGraph.genesisNodeId = simulation.sceneGraph.rootNodeId;
    }
    clearPendingGearSlot();
  }

  function buildTreeModel() {
    const registry = simulation.sceneGraph.nodeRegistry ?? {};
    const rootId = simulation.sceneGraph.rootNodeId;
    const rootSource = registry[rootId];
    if (!rootSource) {
      return [];
    }

    const nodesById = new Map(
      Object.values(registry).map((node) => [node.id, makeNode(node.id, node.label ?? node.id)]),
    );
    const { childrenByParent } = buildEdgeMaps();

    const visited = new Set();
    function attachChildren(nodeId) {
      if (visited.has(nodeId)) {
        return;
      }
      visited.add(nodeId);
      const treeNode = nodesById.get(nodeId);
      if (!treeNode) {
        return;
      }
      const children = childrenByParent.get(nodeId) ?? [];
      children.forEach((childId) => {
        const childNode = nodesById.get(childId);
        if (!childNode) {
          return;
        }
        treeNode.children.push(childNode);
        attachChildren(childId);
      });
    }

    attachChildren(rootId);
    return [nodesById.get(rootId)];
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
    if (["gear-1", "linkage-1", "slider-1", "ground-1"].includes(nodeId)) {
      return true;
    }
    const isExtraGear = simulation.sceneGraph.extraGears.some((node) => node.id === nodeId);
    const isExtraJoint = simulation.sceneGraph.extraJoints.some((node) => node.id === nodeId);
    return isExtraGear || isExtraJoint;
  }

  function deleteTreeNodeById(nodeId) {
    const targetNode = simulation.sceneGraph.nodeRegistry?.[nodeId];
    if (!targetNode) {
      return;
    }

    if (nodeId === simulation.sceneGraph.genesisNodeId) {
      setStatusMessage("Cannot delete genesis node unless a replacement is created in the same action.", {
        debug: `deleteTreeNodeById blocked for genesis node ${nodeId}.`,
        level: "warn",
      });
      return;
    }

    const { parentByChild, childrenByParent } = buildEdgeMaps();
    const subtreeIds = [];
    const visited = new Set();
    const stack = [nodeId];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      subtreeIds.push(currentId);
      const children = childrenByParent.get(currentId) ?? [];
      children.forEach((childId) => stack.push(childId));
    }

    if (subtreeIds.length > 1 && typeof window?.confirm === "function") {
      const confirmed = window.confirm(`Delete ${targetNode.label ?? nodeId} and ${subtreeIds.length - 1} descendant node(s)?`);
      if (!confirmed) {
        return;
      }
    }

    const deletedSet = new Set(subtreeIds);
    const canonicalDeletedIds = ["gear-1", "linkage-1", "slider-1", "ground-1"].filter((id) => deletedSet.has(id));
    if (canonicalDeletedIds.length > 0) {
      const priorDeletedCanonical = new Set(getDeletedCanonicalNodeIds());
      canonicalDeletedIds.forEach((id) => priorDeletedCanonical.add(id));
      simulation.sceneGraph.deletedCanonicalNodeIds = Array.from(priorDeletedCanonical);
    }
    simulation.sceneGraph.extraGears = simulation.sceneGraph.extraGears.filter((node) => !deletedSet.has(node.id));
    simulation.sceneGraph.extraJoints = simulation.sceneGraph.extraJoints.filter((node) => !deletedSet.has(node.id));

    let nextSelectionId = nodeId;
    while (nextSelectionId && deletedSet.has(nextSelectionId)) {
      nextSelectionId = parentByChild.get(nextSelectionId) ?? null;
    }
    if (!nextSelectionId || !simulation.sceneGraph.nodeRegistry?.[nextSelectionId]) {
      nextSelectionId = getRootNodeId();
    }

    keepGearMeshesSane();
    rebuildNodeRegistry();
    syncParamsFromControls();
    simulation.selectedObjectId = nextSelectionId;

    simulation.sceneTreeDirty = true;
    setStatusMessage(
      `Deleted ${subtreeIds.length} node${subtreeIds.length === 1 ? "" : "s"} from scene tree.`,
      {
      debug: `deleteTreeNodeById(nodeId=${nodeId}, deletedCount=${subtreeIds.length}, nextSelection=${nextSelectionId})`,
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
    const motorNode = canonicalGearNodes()["motor-1"];
    const drivenNode = canonicalGearNodes()["gear-1"];
    const motorRpmInput = Number(motorNode.inputRpm);
    const motorAngularInput = Number(motorNode.inputAngularSpeed);
    const hasRpmInput = Number.isFinite(motorRpmInput);
    const angularSpeedFromRpm = hasRpmInput ? (2 * Math.PI * motorRpmInput) / 60 : Number.NaN;
    const resolvedModule = Number.isFinite(Number(motorNode.module)) && Number(motorNode.module) > 0
      ? Number(motorNode.module)
      : Number(drivenNode.module);
    const parsed = {
      crank_radius: Number(controls.crank_radius?.value ?? 1.2),
      rod_length: Number(controls.rod_length?.value ?? 3.2),
      slider_offset: Number(controls.slider_offset?.value ?? 0),
      slider_axis: controls.slider_axis?.value === "vertical" ? "vertical" : "horizontal",
    };
    const driver_pitch_diameter = motorNode.radius * 2;
    const driven_pitch_diameter = drivenNode.radius * 2;

    return {
      params: {
        ...simulation.params,
        param_schema: NODE_PARAM_SCHEMA,
        raw_module: resolvedModule,
        raw_driver_teeth: motorNode.teeth,
        raw_driven_teeth: drivenNode.teeth,
        module: resolvedModule,
        driver_teeth: motorNode.teeth,
        driven_teeth: drivenNode.teeth,
        driver_pitch_diameter,
        driven_pitch_diameter,
        gear_radius: drivenNode.radius,
        driver_radius: motorNode.radius,
        crank_radius: parsed.crank_radius,
        rod_length: parsed.rod_length,
        motor_rpm: hasRpmInput ? motorRpmInput : Number.NaN,
        angular_speed: hasRpmInput ? angularSpeedFromRpm : motorAngularInput,
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
      rebuildNodeRegistry();
      simulation.params = {
        ...normalization.params,
        scene_graph: {
          rootNodeId: simulation.sceneGraph.rootNodeId,
          genesisNodeId: simulation.sceneGraph.genesisNodeId,
          genesisPolicy: simulation.sceneGraph.genesisPolicy,
          nodeRegistry: simulation.sceneGraph.nodeRegistry,
          canonicalGears: simulation.sceneGraph.canonicalGears,
          extraGears: simulation.sceneGraph.extraGears,
          extraJoints: simulation.sceneGraph.extraJoints,
          deletedCanonicalNodeIds: simulation.sceneGraph.deletedCanonicalNodeIds,
          parentChildEdges: simulation.sceneGraph.parentChildEdges,
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

  function getNodeById(nodeId) {
    return simulation.sceneGraph.nodeRegistry?.[nodeId] ?? null;
  }

  function getNodeParamSchema(node) {
    const nodeType = normalizeNodeType(node?.type);
    return NODE_PARAM_SCHEMA[nodeType] ?? (nodeType === "gear" ? NODE_PARAM_SCHEMA.gear : []);
  }

  function updateSelectedNodeParam(nodeId, key, rawValue) {
    if (!nodeId) {
      return;
    }
    const nodeRegistryTarget = simulation.sceneGraph.nodeRegistry?.[nodeId];
    const canonical = simulation.sceneGraph.canonicalGears?.[nodeId];
    const target = nodeRegistryTarget ?? canonical ?? simulation.sceneGraph.extraGears.find((node) => node.id === nodeId);
    if (!target) {
      return;
    }
    let nextValue = rawValue;
    if (typeof rawValue === "string" && ["module", "teeth", "radius", "inputRpm", "inputAngularSpeed"].includes(key)) {
      nextValue = Number(rawValue);
    }
    if (key === "showIndicator") {
      nextValue = rawValue === true;
    }
    target[key] = nextValue;
    if (nodeRegistryTarget && key === "teeth") {
      nodeRegistryTarget.toothCount = nextValue;
    }
    rebuildNodeRegistry();
    syncParamsFromControls();
    renderScene();
  }

  function renderSelectedNodePropertiesEditor() {
    if (!controls.selected_node_properties || !controls.node_properties_empty) {
      return;
    }
    const selectedNode = getNodeById(simulation.selectedObjectId);
    const schema = getNodeParamSchema(selectedNode);
    controls.selected_node_properties.innerHTML = "";
    controls.node_properties_empty.hidden = Boolean(selectedNode && schema.length > 0);
    if (!selectedNode || schema.length === 0) {
      return;
    }
    schema.forEach((field) => {
      const row = document.createElement("label");
      row.textContent = field.label;
      let input;
      if (field.input === "select") {
        input = document.createElement("select");
        (field.options ?? []).forEach((optionValue) => {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = optionValue;
          input.appendChild(option);
        });
        input.value = String(selectedNode[field.key] ?? field.defaultValue ?? "");
      } else {
        input = document.createElement("input");
        input.type = field.input;
        if (field.step != null) {
          input.step = String(field.step);
        }
        if (field.min != null) {
          input.min = String(field.min);
        }
        if (field.max != null) {
          input.max = String(field.max);
        }
        if (field.input === "checkbox") {
          input.checked = selectedNode[field.key] === true;
        } else {
          input.value = String(selectedNode[field.key] ?? field.defaultValue ?? "");
        }
      }
      input.addEventListener("input", () => {
        const nextValue = field.input === "checkbox" ? input.checked : input.value;
        updateSelectedNodeParam(selectedNode.id, field.key, nextValue);
      });
      row.appendChild(input);
      controls.selected_node_properties.appendChild(row);
    });
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
    renderSelectedNodePropertiesEditor();

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
      "crank-radius",
      "rod-length",
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
    rebuildNodeRegistry();
    return {
      ...buildCurrentSceneJson(),
      sceneGraph: {
        rootNodeId: simulation.sceneGraph.rootNodeId,
        genesisNodeId: simulation.sceneGraph.genesisNodeId,
        genesisPolicy: simulation.sceneGraph.genesisPolicy,
        nodeRegistry: simulation.sceneGraph.nodeRegistry,
        parentChildEdges: simulation.sceneGraph.parentChildEdges,
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
    controls.crank_radius,
    controls.rod_length,
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
    simulation.sceneGraph.rootNodeId = "motor-1";
    simulation.sceneGraph.genesisNodeId = "motor-1";
    simulation.sceneGraph.genesisPolicy = {
      allowedTypes: ["motor", "joint-anchor"],
    };
    simulation.sceneGraph.canonicalGears = {
      "motor-1": { showIndicator: false, module: 0.1, teeth: 18, radiusMode: "moduleTeeth", radius: 0.9, inputRpm: 17.2, inputAngularSpeed: 1.8, meshWith: null },
      "gear-1": { showIndicator: true, module: 0.1, teeth: 32, radiusMode: "moduleTeeth", radius: 1.6, meshWith: "motor-1" },
    };
    simulation.sceneGraph.extraGears = [];
    simulation.sceneGraph.extraJoints = [];
    simulation.sceneGraph.deletedCanonicalNodeIds = [];
    simulation.sceneGraph.parentChildEdges = [];
    rebuildNodeRegistry();
    simulation.selectedObjectId = getPrimaryDrivenGearId();
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

  controls.refresh_view?.addEventListener("click", () => {
    rebuildNodeRegistry();
    syncParamsFromControls();
    simulation.sceneTreeDirty = true;
    renderScene();
    setStatusMessage("View refreshed.", {
      debug: "Manual refresh: rebuilt node registry and re-rendered scene.",
    });
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
    const canonicalModule = toPositiveFinite(Number(simulation.sceneGraph.canonicalGears?.["gear-1"]?.module), toPositiveFinite(simulation.params.module, 0.1));
    const canonicalDrivenTeeth = Math.max(1, Math.round(toPositiveFinite(Number(simulation.sceneGraph.canonicalGears?.["gear-1"]?.teeth), 24)));
    const radius = (canonicalModule * canonicalDrivenTeeth) / 2;
    const selectedIsGear = typeof simulation.selectedObjectId === "string" && (simulation.selectedObjectId === getPrimaryDrivenGearId() || /^gear-\d+$/.test(simulation.selectedObjectId));

    const gearLookup = {
      ...canonicalGearNodes(),
      ...Object.fromEntries(simulation.sceneGraph.extraGears.map((node) => [node.id, node])),
    };

    const slot = simulation.pendingGearSlot;
    const selectedGearFromSlot = typeof slot?.sourceGearId === "string" ? gearLookup[slot.sourceGearId] : null;
    const selectedGearFromSelection = selectedIsGear ? gearLookup[simulation.selectedObjectId] : null;
    const relationTarget = selectedGearFromSlot ?? selectedGearFromSelection ?? gearLookup[getRootNodeId()];
    if (!relationTarget?.id || !gearLookup[relationTarget.id]) {
      setStatusMessage("Unable to add gear: no valid attachment target selected.", {
        debug: `add_gear aborted; target=${relationTarget?.id ?? "none"}, root=${simulation.sceneGraph.rootNodeId}.`,
        level: "warn",
      });
      return;
    }
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
      parentId: relationTarget.id,
      meshWith: shouldMesh ? relationTarget.id : null,
      module: canonicalModule,
      teeth: canonicalDrivenTeeth,
      radius,
      centerMode: shouldMesh ? "manual" : "parent",
      center,
      linkageAnchor: null,
      showIndicator: false,
    });
    rebuildNodeRegistry();
    syncParamsFromControls();
    simulation.sceneTreeDirty = true;
    clearPendingGearSlot();
    selectObjectById(id);
  });

  controls.add_joint?.addEventListener("click", () => {
    const index = getNextDynamicNodeIndex("joint", simulation.sceneGraph.extraJoints);
    const id = `joint-${index}`;
    const attachmentTargetId = simulation.sceneGraph.nodeRegistry?.[simulation.selectedObjectId]
      ? simulation.selectedObjectId
      : (simulation.sceneGraph.nodeRegistry?.["linkage-1"] ? "linkage-1" : getRootNodeId());
    if (!simulation.sceneGraph.nodeRegistry?.[attachmentTargetId]) {
      setStatusMessage("Unable to add joint: no valid attachment target found.", {
        debug: `add_joint aborted; target=${attachmentTargetId}.`,
        level: "warn",
      });
      return;
    }
    simulation.sceneGraph.extraJoints.push({
      id,
      label: `Joint${index}`,
      type: "joint-anchor",
      parentId: attachmentTargetId,
      attachmentTargetId,
    });
    rebuildNodeRegistry();
    syncParamsFromControls();
    simulation.sceneTreeDirty = true;
    selectObjectById(id);
  });

  function deleteSelectedNode() {
    if (!isDeletableTreeNode(simulation.selectedObjectId)) {
      const selectedId = simulation.selectedObjectId;
      setStatusMessage("Select a deletable node in the scene tree.", {
        debug: `deleteSelectedNode ignored; selectedObjectId=${selectedId ?? "none"}.`,
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
    if (simulation.sceneGraph.nodeRegistry?.[selectedId]) {
      simulation.sceneGraph.nodeRegistry[selectedId].showIndicator = nextValue;
    }
    if (selectedId === getRootNodeId() || selectedId === getPrimaryDrivenGearId()) {
      simulation.sceneGraph.canonicalGears[selectedId] = {
        ...(simulation.sceneGraph.canonicalGears[selectedId] ?? {}),
        showIndicator: nextValue,
      };
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
  rebuildNodeRegistry();
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
