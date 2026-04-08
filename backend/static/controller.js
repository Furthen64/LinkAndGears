import { computeState } from "./kinematics.js";
import { createTransform, drawScene, objectDetails } from "./renderer.js";
import { buildParentChildEdges, resolveLinkageGroups, sanitizeLinkageGroup } from "./scene-graph.js";

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
    shared_module: document.getElementById("shared-module"),
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
    load_scene: document.getElementById("load-scene"),
    reset_view: document.getElementById("reset-view"),
    refresh_view: document.getElementById("refresh-view"),
    scene_tree: document.getElementById("scene-tree"),
    toggle_scene_tree: document.getElementById("toggle-scene-tree"),
    scene_tree_content: document.getElementById("scene-tree-content"),
    add_gear: document.getElementById("add-gear"),
    add_linkage: document.getElementById("add-linkage"),
    add_joint: document.getElementById("add-joint"),
    gear_slot_menu: document.getElementById("gear-slot-menu"),
    gear_slot_menu_add_gear: document.getElementById("gear-slot-menu-add-gear"),
    gear_slot_menu_add_linkage: document.getElementById("gear-slot-menu-add-linkage"),
    gear_slot_menu_add_joint: document.getElementById("gear-slot-menu-add-joint"),
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
      { key: "teeth", label: "Teeth", input: "number", step: "1", min: "6", defaultValue: 32 },
      { key: "radiusMode", label: "Radius mode", input: "select", options: ["moduleTeeth", "manual"], defaultValue: "moduleTeeth" },
      { key: "radius", label: "Radius", input: "number", step: "0.01", min: "0.001", defaultValue: 1.6 },
      { key: "meshWith", label: "Mesh with node id", input: "text", defaultValue: "motor-1" },
      { key: "showIndicator", label: "Show indicator", input: "checkbox", defaultValue: true },
    ],
    motor: [
      { key: "teeth", label: "Teeth", input: "number", step: "1", min: "6", defaultValue: 18 },
      { key: "radiusMode", label: "Radius mode", input: "select", options: ["moduleTeeth", "manual"], defaultValue: "moduleTeeth" },
      { key: "radius", label: "Radius", input: "number", step: "0.01", min: "0.001", defaultValue: 0.9 },
      { key: "meshWith", label: "Mesh with node id", input: "text", defaultValue: "" },
      { key: "showIndicator", label: "Show indicator", input: "checkbox", defaultValue: false },
      { key: "inputRpm", label: "Motor speed (RPM)", input: "number", step: "0.1", defaultValue: 17.2 },
      { key: "inputAngularSpeed", label: "Manual angular speed (rad/s)", input: "number", step: "0.1", defaultValue: 1.8 },
    ],
    "linkage-anchor": [
      { key: "label", label: "Label", input: "text", defaultValue: "Linkage" },
      { key: "linkageGroupLabel", label: "Group label", input: "text", defaultValue: "Linkage" },
      { key: "inputGearId", label: "Input gear id", input: "text", defaultValue: "gear-1" },
      { key: "crank_radius", label: "Crank radius", input: "number", step: "0.1", min: "0.01", defaultValue: 1.2 },
      { key: "rod_length", label: "Rod length", input: "number", step: "0.1", min: "0.01", defaultValue: 3.2 },
    ],
    slider: [
      { key: "label", label: "Label", input: "text", defaultValue: "Slider" },
      { key: "slider_axis", label: "Slider axis", input: "select", options: ["horizontal", "vertical"], defaultValue: "horizontal" },
      { key: "slider_offset", label: "Rail offset", input: "number", step: "0.1", defaultValue: 0 },
    ],
    "ground-anchor": [
      { key: "label", label: "Label", input: "text", defaultValue: "Ground" },
      { key: "slider_axis", label: "Slider axis", input: "select", options: ["horizontal", "vertical"], defaultValue: "horizontal" },
      { key: "slider_offset", label: "Rail offset", input: "number", step: "0.1", defaultValue: 0 },
    ],
    "joint-anchor": [
      { key: "label", label: "Label", input: "text", defaultValue: "Joint" },
      { key: "parentId", label: "Parent id", input: "text", defaultValue: "" },
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
    "shared-module": "0.1",
    "crank-radius": "1.2",
    "rod-length": "3.2",
    "slider-offset": "0",
    "slider-axis": "horizontal",
    "theme-mode": "dark",
    sceneGraph: {
      module: 0.1,
      rootNodeId: "motor-1",
      genesisNodeId: "motor-1",
      genesisPolicy: {
        allowedTypes: ["motor", "joint-anchor"],
      },
      canonicalGears: {
        "motor-1": { showIndicator: false, teeth: 18, radiusMode: "moduleTeeth", radius: 0.9, inputRpm: 17.2, inputAngularSpeed: 1.8, meshWith: null },
        "gear-1": { showIndicator: true, teeth: 32, radiusMode: "moduleTeeth", radius: 1.6, meshWith: "motor-1" },
      },
      linkageGroups: [
        {
          id: "linkage-group-1",
          label: "Primary Linkage",
          type: "slider-crank",
          inputGearId: "gear-1",
          linkageNodeId: "linkage-1",
          sliderNodeId: "slider-1",
          groundNodeId: "ground-1",
        },
      ],
      extraGears: [],
      extraJoints: [],
      deletedCanonicalNodeIds: [],
      parentChildEdges: [],
    },
  };
  const SCENE_EXPORT_CONTROL_IDS = [
    "shared-module",
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
      module: 0.1,
      rootNodeId: "motor-1",
      genesisNodeId: "motor-1",
      genesisPolicy: {
        allowedTypes: ["motor", "joint-anchor"],
      },
      canonicalGears: {
        "motor-1": { showIndicator: false, teeth: 18, radiusMode: "moduleTeeth", radius: 0.9, inputRpm: 17.2, inputAngularSpeed: 1.8, meshWith: null },
        "gear-1": { showIndicator: true, teeth: 32, radiusMode: "moduleTeeth", radius: 1.6, meshWith: "motor-1" },
      },
      linkageGroups: [
        {
          id: "linkage-group-1",
          label: "Primary Linkage",
          type: "slider-crank",
          inputGearId: "gear-1",
          linkageNodeId: "linkage-1",
          sliderNodeId: "slider-1",
          groundNodeId: "ground-1",
        },
      ],
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
  let selectedNodeEditorSignature = "";

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

  function normalizeSliderAxisValue(rawAxis, fallback = "horizontal") {
    return rawAxis === "vertical" ? "vertical" : fallback;
  }

  function getLinkageGroupDefaults(source = {}) {
    return {
      crankRadius: toPositiveFinite(Number(source?.crankRadius ?? source?.["crank-radius"]), 1.2),
      rodLength: toPositiveFinite(Number(source?.rodLength ?? source?.["rod-length"]), 3.2),
      sliderAxis: normalizeSliderAxisValue(source?.sliderAxis ?? source?.["slider-axis"]),
      sliderOffset: Number.isFinite(Number(source?.sliderOffset ?? source?.["slider-offset"]))
        ? Number(source.sliderOffset ?? source["slider-offset"])
        : 0,
      crankAngleOffset: Number.isFinite(Number(source?.crankAngleOffset ?? source?.["crank-angle-offset"]))
        ? Number(source.crankAngleOffset ?? source["crank-angle-offset"])
        : 0,
    };
  }

  function syncLinkageGroups() {
    const registry = simulation.sceneGraph.nodeRegistry ?? {};
    const resolvedGroups = resolveLinkageGroups({
      rootNodeId: simulation.sceneGraph.rootNodeId,
      nodeRegistry: registry,
      linkageGroups: simulation.sceneGraph.linkageGroups,
    });

    simulation.sceneGraph.linkageGroups = resolvedGroups.map((group, index) => sanitizeLinkageGroup(
      group,
      registry,
      index + 1,
      getLinkageGroupDefaults(group),
    ));
  }

  function syncLegacySceneStoresFromRegistry() {
    const registry = simulation.sceneGraph.nodeRegistry ?? {};
    const rootNode = registry[getRootNodeId()] ?? null;
    const drivenNode = registry[getPrimaryDrivenGearId()] ?? null;

    if (rootNode) {
      simulation.sceneGraph.canonicalGears["motor-1"] = {
        ...(simulation.sceneGraph.canonicalGears?.["motor-1"] ?? {}),
        showIndicator: rootNode.showIndicator === true,
        module: getSceneModule(),
        teeth: Number.isFinite(Number(rootNode.teeth)) ? Number(rootNode.teeth) : 18,
        radiusMode: rootNode.radiusMode === "manual" ? "manual" : "moduleTeeth",
        radius: Number.isFinite(Number(rootNode.radius)) ? Number(rootNode.radius) : 0.9,
        meshWith: null,
        inputRpm: Number.isFinite(Number(rootNode.inputRpm)) ? Number(rootNode.inputRpm) : 17.2,
        inputAngularSpeed: Number.isFinite(Number(rootNode.inputAngularSpeed)) ? Number(rootNode.inputAngularSpeed) : 1.8,
      };
    }

    if (drivenNode && drivenNode.id !== rootNode?.id) {
      simulation.sceneGraph.canonicalGears["gear-1"] = {
        ...(simulation.sceneGraph.canonicalGears?.["gear-1"] ?? {}),
        showIndicator: drivenNode.showIndicator !== false,
        module: getSceneModule(),
        teeth: Number.isFinite(Number(drivenNode.teeth)) ? Number(drivenNode.teeth) : 32,
        radiusMode: drivenNode.radiusMode === "manual" ? "manual" : "moduleTeeth",
        radius: Number.isFinite(Number(drivenNode.radius)) ? Number(drivenNode.radius) : 1.6,
        meshWith: drivenNode.meshWith ?? rootNode?.id ?? null,
      };
    }

    const groupedNodeIds = new Set(
      getResolvedLinkageGroups().flatMap((group) => [
        group.linkageNodeId,
        group.sliderNodeId,
        group.groundNodeId,
      ].filter((value) => typeof value === "string" && value.length > 0)),
    );

    simulation.sceneGraph.extraGears = Object.values(registry)
      .filter((node) => normalizeNodeType(node?.type) === "gear" && node.id !== drivenNode?.id)
      .map((node, index) => sanitizeExtraGearNode(node, index + 2));
    simulation.sceneGraph.extraJoints = Object.values(registry)
      .filter((node) => {
        const nodeType = normalizeNodeType(node?.type);
        return nodeType !== "gear"
          && nodeType !== "motor"
          && !groupedNodeIds.has(node.id);
      })
      .map((node, index) => sanitizeExtraJointNode(node, index + 1));
    simulation.sceneGraph.deletedCanonicalNodeIds = ["gear-1", "linkage-1", "slider-1", "ground-1"]
      .filter((nodeId) => !registry[nodeId]);
  }

  function setSceneNodeRegistry(nextRegistry) {
    simulation.sceneGraph.nodeRegistry = nextRegistry ?? {};
    simulation.sceneGraph.parentChildEdges = buildParentChildEdges(simulation.sceneGraph.nodeRegistry);
    syncLinkageGroups();
    syncLegacySceneStoresFromRegistry();
  }

  function buildRegistryFromLegacySceneData() {
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
        attachmentTargetId: node.parentId ?? node.attachmentTargetId ?? getPrimaryLinkageGroup()?.linkageNodeId ?? simulation.sceneGraph.rootNodeId,
      };
    });

    return registry;
  }

  function getDerivedAdditionalGearNodes() {
    return Object.values(simulation.sceneGraph.nodeRegistry ?? {}).filter((node) => {
      if (normalizeNodeType(node?.type) !== "gear") {
        return false;
      }

      return node.id !== getRootNodeId();
    });
  }

  function getSceneModule() {
    const fromGraph = Number(simulation.sceneGraph?.module);
    if (Number.isFinite(fromGraph) && fromGraph > 0) {
      return fromGraph;
    }
    const fromControl = Number(controls.shared_module?.value);
    if (Number.isFinite(fromControl) && fromControl > 0) {
      return fromControl;
    }
    return 0.1;
  }

  function syncSharedModuleControl() {
    if (!controls.shared_module) {
      return;
    }
    controls.shared_module.value = String(getSceneModule());
  }

  function canonicalGearNodes() {
    const motorConfig = simulation.sceneGraph.canonicalGears?.["motor-1"] ?? {};
    const drivenConfig = simulation.sceneGraph.canonicalGears?.["gear-1"] ?? {};
    const sceneModule = getSceneModule();
    const resolveRadius = (config, fallback) => {
      const teethValue = Number(config.teeth);
      if (config.radiusMode !== "manual" && Number.isFinite(sceneModule) && sceneModule > 0 && Number.isFinite(teethValue) && teethValue > 0) {
        return (sceneModule * teethValue) / 2;
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
        module: sceneModule,
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
        module: sceneModule,
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
    const normalizedRegistry = Object.fromEntries(
      Object.entries(simulation.sceneGraph.nodeRegistry ?? {}).map(([nodeId, node]) => [
        nodeId,
        sanitizeRegistryNode(node, { id: nodeId, label: node?.label ?? nodeId }),
      ]),
    );

    const rootNodeId = getRootNodeId();
    if (normalizedRegistry[rootNodeId]) {
      normalizedRegistry[rootNodeId].parentId = null;
      normalizedRegistry[rootNodeId].attachmentTargetId = null;
      normalizedRegistry[rootNodeId].meshWith = null;
    }

    setSceneNodeRegistry(normalizedRegistry);
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

  function getResolvedLinkageGroups() {
    return Array.isArray(simulation.sceneGraph.linkageGroups) ? simulation.sceneGraph.linkageGroups : [];
  }

  function getPrimaryLinkageGroup() {
    return getResolvedLinkageGroups()[0] ?? null;
  }

  function getActiveLinkageGroup() {
    return getLinkageGroupForNodeId(simulation.selectedObjectId) ?? getPrimaryLinkageGroup();
  }

  function getLinkageGroupParamValue(group, key) {
    const defaults = getLinkageGroupDefaults();
    if (!group || typeof key !== "string") {
      return defaults[key] ?? undefined;
    }

    switch (key) {
      case "crankRadius":
      case "rodLength":
      case "sliderOffset":
      case "crankAngleOffset": {
        const numericValue = Number(group[key]);
        return Number.isFinite(numericValue)
          ? numericValue
          : defaults[key];
      }
      case "sliderAxis":
        return normalizeSliderAxisValue(group[key], defaults.sliderAxis);
      default:
        return group[key] ?? defaults[key];
    }
  }

  function syncLinkageControlsFromGroup(group = getActiveLinkageGroup()) {
    const resolvedGroup = group ?? getPrimaryLinkageGroup();
    controls.crank_radius.value = String(getLinkageGroupParamValue(resolvedGroup, "crankRadius"));
    controls.rod_length.value = String(getLinkageGroupParamValue(resolvedGroup, "rodLength"));
    controls.slider_axis.value = getLinkageGroupParamValue(resolvedGroup, "sliderAxis");
    controls.slider_offset.value = String(getLinkageGroupParamValue(resolvedGroup, "sliderOffset"));
  }

  function applyLinkageControlsToGroup(group = getActiveLinkageGroup()) {
    if (!group) {
      return;
    }

    group.crankRadius = toPositiveFinite(Number(controls.crank_radius?.value), getLinkageGroupParamValue(group, "crankRadius"));
    group.rodLength = toPositiveFinite(Number(controls.rod_length?.value), getLinkageGroupParamValue(group, "rodLength"));
    group.sliderAxis = normalizeSliderAxisValue(controls.slider_axis?.value, getLinkageGroupParamValue(group, "sliderAxis"));
    group.sliderOffset = Number.isFinite(Number(controls.slider_offset?.value))
      ? Number(controls.slider_offset.value)
      : getLinkageGroupParamValue(group, "sliderOffset");
  }

  function getLinkageGroupForNodeId(nodeId) {
    if (typeof nodeId !== "string") {
      return null;
    }

    return getResolvedLinkageGroups().find((group) => (
      group.linkageNodeId === nodeId
      || group.sliderNodeId === nodeId
      || group.groundNodeId === nodeId
    )) ?? null;
  }

  function getEditableFieldValue(node, fieldKey) {
    if (!node || typeof fieldKey !== "string") {
      return undefined;
    }

    const linkageGroup = getLinkageGroupForNodeId(node.id);
    switch (fieldKey) {
      case "linkageGroupLabel":
        return linkageGroup?.label ?? "";
      case "inputGearId":
        return linkageGroup?.inputGearId ?? "";
      case "crank_radius":
        return getLinkageGroupParamValue(linkageGroup, "crankRadius");
      case "rod_length":
        return getLinkageGroupParamValue(linkageGroup, "rodLength");
      case "slider_axis":
        return getLinkageGroupParamValue(linkageGroup, "sliderAxis");
      case "slider_offset":
        return getLinkageGroupParamValue(linkageGroup, "sliderOffset");
      default:
        return node[fieldKey];
    }
  }

  function updateLinkedInputGear(linkageGroup, inputGearId) {
    if (!linkageGroup || typeof inputGearId !== "string") {
      return false;
    }

    const targetGear = simulation.sceneGraph.nodeRegistry?.[inputGearId] ?? null;
    if (!targetGear || !["motor", "gear"].includes(normalizeNodeType(targetGear.type))) {
      return false;
    }

    linkageGroup.inputGearId = inputGearId;
    const linkageNode = simulation.sceneGraph.nodeRegistry?.[linkageGroup.linkageNodeId] ?? null;
    if (linkageNode) {
      linkageNode.parentId = inputGearId;
      linkageNode.attachmentTargetId = inputGearId;
    }

    relayoutLinkageGroup(linkageGroup);
    rebuildNodeRegistry();
    syncLegacySceneStoresFromRegistry();

    simulation.sceneTreeDirty = true;

    return true;
  }

  function isGearNodeId(nodeId) {
    const node = simulation.sceneGraph.nodeRegistry?.[nodeId];
    if (!node) {
      return false;
    }

    const nodeType = normalizeNodeType(node.type);
    return nodeType === "motor" || nodeType === "gear";
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

  function deriveGearRadius(config, fallback = 0.1) {
    if (!config || typeof config !== "object") {
      return toPositiveFinite(fallback, 0.1);
    }

    if (config.radiusMode !== "manual") {
      const moduleValue = getSceneModule();
      const teethValue = Number(config.teeth);
      if (Number.isFinite(moduleValue) && moduleValue > 0 && Number.isFinite(teethValue) && teethValue > 0) {
        return (moduleValue * teethValue) / 2;
      }
    }

    return toPositiveFinite(Number(config.radius), toPositiveFinite(fallback, 0.1));
  }

  function syncGearRadius(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    node.radius = deriveGearRadius(node, node.radius);
  }

  function clearPendingGearSlot() {
    simulation.pendingGearSlot = null;
    if (controls.gear_slot_menu) {
      controls.gear_slot_menu.hidden = true;
      controls.gear_slot_menu.style.visibility = "";
      controls.gear_slot_menu.style.left = "";
      controls.gear_slot_menu.style.top = "";
      controls.gear_slot_menu.dataset.arrowX = "";
      controls.gear_slot_menu.dataset.arrowY = "";
    }
  }

  function updateGearSlotMenu() {
    const menu = controls.gear_slot_menu;
    const slot = simulation.pendingGearSlot;
    if (!menu || !canvas) {
      return;
    }

    if (!slot) {
      menu.hidden = true;
      menu.style.visibility = "";
      menu.style.left = "";
      menu.style.top = "";
      menu.dataset.arrowX = "";
      menu.dataset.arrowY = "";
      return;
    }

    const transform = createTransform(canvas, simulation.params, simulation.camera);
    const canvasPoint = transform.toCanvas(slot.center);
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    const anchorX = canvasRect.left + canvasPoint.x * scaleX;
    const anchorY = canvasRect.top + canvasPoint.y * scaleY;
    const offset = 12;
    const padding = 8;

    menu.hidden = false;
    menu.style.visibility = "hidden";
    menu.style.left = `${Math.round(anchorX + offset)}px`;
    menu.style.top = `${Math.round(anchorY + offset)}px`;

    const menuRect = menu.getBoundingClientRect();
    let left = anchorX + offset;
    let top = anchorY + offset;

    let isFlippedX = false;
    let isFlippedY = false;

    if (left + menuRect.width > window.innerWidth - padding) {
      left = anchorX - menuRect.width - offset;
      isFlippedX = true;
    }
    if (top + menuRect.height > window.innerHeight - padding) {
      top = anchorY - menuRect.height - offset;
      isFlippedY = true;
    }

    left = Math.min(Math.max(left, padding), Math.max(padding, window.innerWidth - menuRect.width - padding));
    top = Math.min(Math.max(top, padding), Math.max(padding, window.innerHeight - menuRect.height - padding));

    menu.dataset.arrowX = isFlippedX ? "right" : "left";
    menu.dataset.arrowY = isFlippedY ? "bottom" : "top";
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
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

  function relayoutLinkageGroup(linkageGroup) {
    if (!linkageGroup) {
      return false;
    }

    const registry = simulation.sceneGraph.nodeRegistry ?? {};
    const groundNode = registry[linkageGroup.groundNodeId] ?? null;
    const linkageNode = registry[linkageGroup.linkageNodeId] ?? null;
    const inputGear = getGearLookup()[linkageGroup.inputGearId] ?? registry[linkageGroup.inputGearId] ?? null;
    if (!groundNode || !inputGear) {
      return false;
    }

    const inputCenterX = Number.isFinite(Number(inputGear.center?.x)) ? Number(inputGear.center.x) : 0;
    const inputCenterY = Number.isFinite(Number(inputGear.center?.y)) ? Number(inputGear.center.y) : 0;
    const inputRadius = toPositiveFinite(Number(inputGear.radius), 0.1);
    const reach = Math.max(getLinkageGroupParamValue(linkageGroup, "rodLength"), inputRadius * 3);
    const sliderAxis = getLinkageGroupParamValue(linkageGroup, "sliderAxis");
    const sliderOffset = getLinkageGroupParamValue(linkageGroup, "sliderOffset");

    groundNode.center = sliderAxis === "vertical"
      ? { x: sliderOffset, y: inputCenterY + reach }
      : { x: inputCenterX + reach, y: sliderOffset };
    groundNode.parentId = linkageNode?.id ?? groundNode.parentId ?? null;
    groundNode.attachmentTargetId = linkageNode?.id ?? groundNode.attachmentTargetId ?? null;

    return true;
  }

  function addGearFromCurrentSelection() {
    syncParamsFromControls();
    const index = getNextDynamicNodeIndex(
      "gear",
      Object.values(simulation.sceneGraph.nodeRegistry ?? {}).filter((node) => /^gear-\d+$/.test(node?.id ?? "")),
    );
    const id = `gear-${index}`;
    const canonicalModule = getSceneModule();
    const gearLookup = getGearLookup();
    const primaryDrivenGear = gearLookup[getPrimaryDrivenGearId()] ?? null;
    const canonicalDrivenTeeth = Math.max(
      1,
      Math.round(toPositiveFinite(Number(primaryDrivenGear?.teeth ?? simulation.params.driven_teeth), 24)),
    );
    const radius = (canonicalModule * canonicalDrivenTeeth) / 2;
    const selectedIsGear = typeof simulation.selectedObjectId === "string" && isGearNodeId(simulation.selectedObjectId);

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

    simulation.sceneGraph.nodeRegistry[id] = sanitizeRegistryNode({
      id,
      label: `Gear${index}`,
      type: "gear",
      parentId: relationTarget.id,
      meshWith: shouldMesh ? relationTarget.id : null,
      module: canonicalModule,
      teeth: canonicalDrivenTeeth,
      radiusMode: "moduleTeeth",
      radius,
      attachmentTargetId: relationTarget.id,
      centerMode: shouldMesh ? "manual" : "parent",
      center,
      linkageAnchor: null,
      showIndicator: false,
    }, { id, label: `Gear${index}`, type: "gear" });
    rebuildNodeRegistry();
    syncParamsFromControls();
    simulation.sceneTreeDirty = true;
    clearPendingGearSlot();
    selectObjectById(id);
  }

  function addLinkageFromCurrentSelection() {
    syncParamsFromControls();

    const registry = simulation.sceneGraph.nodeRegistry ?? {};
    const gearLookup = getGearLookup();
    const selectedGear = isGearNodeId(simulation.selectedObjectId)
      ? gearLookup[simulation.selectedObjectId]
      : null;
    const inputGear = selectedGear
      ?? gearLookup[getPrimaryDrivenGearId()]
      ?? gearLookup[getRootNodeId()]
      ?? null;

    if (!inputGear) {
      setStatusMessage("Unable to add linkage: no motor or gear node is available.", {
        debug: "add_linkage aborted because no valid input gear was resolved.",
        level: "warn",
      });
      return;
    }

    const linkageIndex = getNextDynamicNodeIndex(
      "linkage",
      Object.values(registry).filter((node) => /^linkage-\d+$/.test(node?.id ?? "")),
    );
    const sliderIndex = getNextDynamicNodeIndex(
      "slider",
      Object.values(registry).filter((node) => /^slider-\d+$/.test(node?.id ?? "")),
    );
    const groundIndex = getNextDynamicNodeIndex(
      "ground",
      Object.values(registry).filter((node) => /^ground-\d+$/.test(node?.id ?? "")),
    );
    const groupIndex = getNextDynamicNodeIndex("linkage-group", getResolvedLinkageGroups());

    const linkageId = `linkage-${linkageIndex}`;
    const sliderId = `slider-${sliderIndex}`;
    const groundId = `ground-${groundIndex}`;
    const groupId = `linkage-group-${groupIndex}`;

    const activeLinkageGroup = getActiveLinkageGroup();
    const defaultCrankRadius = activeLinkageGroup
      ? getLinkageGroupParamValue(activeLinkageGroup, "crankRadius")
      : Math.max(0.4, Number(inputGear.radius) * 0.75);
    const defaultRodLength = activeLinkageGroup
      ? Math.max(getLinkageGroupParamValue(activeLinkageGroup, "rodLength"), defaultCrankRadius)
      : defaultCrankRadius + Math.max(1, defaultCrankRadius);
    const inputGearCenterX = Number.isFinite(Number(inputGear.center?.x)) ? Number(inputGear.center.x) : 0;
    const inputGearCenterY = Number.isFinite(Number(inputGear.center?.y)) ? Number(inputGear.center.y) : 0;
    const defaultSliderOffset = inputGearCenterY;
    const groundX = inputGearCenterX + Math.max(defaultRodLength, Number(inputGear.radius) * 3);

    simulation.sceneGraph.nodeRegistry[linkageId] = sanitizeRegistryNode({
      id: linkageId,
      label: `Linkage${linkageIndex}`,
      type: "linkage-anchor",
      role: "linkage-anchor",
      parentId: inputGear.id,
      attachmentTargetId: inputGear.id,
    }, { id: linkageId, label: `Linkage${linkageIndex}`, type: "linkage-anchor" });

    simulation.sceneGraph.nodeRegistry[sliderId] = sanitizeRegistryNode({
      id: sliderId,
      label: `Slider${sliderIndex}`,
      type: "slider",
      role: "slider-carriage",
      parentId: linkageId,
      attachmentTargetId: linkageId,
    }, { id: sliderId, label: `Slider${sliderIndex}`, type: "slider" });

    simulation.sceneGraph.nodeRegistry[groundId] = sanitizeRegistryNode({
      id: groundId,
      label: `Ground${groundIndex}`,
      type: "ground-anchor",
      role: "ground-reference",
      parentId: linkageId,
      attachmentTargetId: linkageId,
      center: { x: groundX, y: defaultSliderOffset },
    }, { id: groundId, label: `Ground${groundIndex}`, type: "ground-anchor" });

    simulation.sceneGraph.linkageGroups = [
      ...getResolvedLinkageGroups(),
      {
        id: groupId,
        label: `Linkage ${groupIndex}`,
        type: "slider-crank",
        inputGearId: inputGear.id,
        linkageNodeId: linkageId,
        sliderNodeId: sliderId,
        groundNodeId: groundId,
        crankRadius: defaultCrankRadius,
        rodLength: defaultRodLength,
        sliderAxis: "horizontal",
        sliderOffset: defaultSliderOffset,
      },
    ];

    rebuildNodeRegistry();
    syncParamsFromControls();
    simulation.sceneTreeDirty = true;
    selectObjectById(linkageId);
    setStatusMessage("Added linkage group.", {
      debug: `add_linkage created ${groupId} on input gear ${inputGear.id} with horizontal rail at y=${defaultSliderOffset}.`,
    });
  }

  function addJointFromCurrentSelection() {
    const index = getNextDynamicNodeIndex(
      "joint",
      Object.values(simulation.sceneGraph.nodeRegistry ?? {}).filter((node) => /^joint-\d+$/.test(node?.id ?? "")),
    );
    const id = `joint-${index}`;
    const primaryLinkageGroup = getPrimaryLinkageGroup();
    const attachmentTargetId = simulation.sceneGraph.nodeRegistry?.[simulation.selectedObjectId]
      ? simulation.selectedObjectId
      : (primaryLinkageGroup?.linkageNodeId && simulation.sceneGraph.nodeRegistry?.[primaryLinkageGroup.linkageNodeId]
        ? primaryLinkageGroup.linkageNodeId
        : getRootNodeId());
    if (!simulation.sceneGraph.nodeRegistry?.[attachmentTargetId]) {
      setStatusMessage("Unable to add joint: no valid attachment target found.", {
        debug: `add_joint aborted; target=${attachmentTargetId}.`,
        level: "warn",
      });
      return;
    }
    simulation.sceneGraph.nodeRegistry[id] = sanitizeRegistryNode({
      id,
      label: `Joint${index}`,
      type: "joint-anchor",
      parentId: attachmentTargetId,
      attachmentTargetId,
    }, { id, label: `Joint${index}`, type: "joint-anchor" });
    rebuildNodeRegistry();
    syncParamsFromControls();
    simulation.sceneTreeDirty = true;
    selectObjectById(id);
  }

  function getGearLookup() {
    return Object.fromEntries(
      Object.values(simulation.sceneGraph.nodeRegistry ?? {})
        .filter((node) => ["motor", "gear"].includes(normalizeNodeType(node?.type)))
        .map((node) => [node.id, node]),
    );
  }

  function resolveMeshCenter(anchor, node, fallbackDirection = { x: 1, y: 0 }) {
    if (!anchor || !node) {
      return { x: 0, y: 0 };
    }

    const dx = Number.isFinite(node.center?.x) ? node.center.x - anchor.center.x : fallbackDirection.x;
    const dy = Number.isFinite(node.center?.y) ? node.center.y - anchor.center.y : fallbackDirection.y;
    const length = Math.hypot(dx, dy) || 1;
    const unit = { x: dx / length, y: dy / length };
    const anchorRadius = deriveGearRadius(anchor, anchor.radius);
    const nodeRadius = deriveGearRadius(node, node.radius);
    const distance = Math.max(0.01, anchorRadius + nodeRadius);

    return {
      x: anchor.center.x + unit.x * distance,
      y: anchor.center.y + unit.y * distance,
    };
  }

  function realignMeshedGearCenters() {
    const extraGears = getDerivedAdditionalGearNodes();
    if (!Array.isArray(extraGears) || extraGears.length === 0) {
      return 0;
    }

    let totalUpdates = 0;
    const maxPasses = Math.max(1, extraGears.length);

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const lookup = getGearLookup();
      let passUpdates = 0;

      extraGears.forEach((node) => {
        if (!node || typeof node.id !== "string" || typeof node.meshWith !== "string") {
          return;
        }

        syncGearRadius(node);
        const anchor = lookup[node.meshWith];
        if (!anchor) {
          return;
        }

        const nextCenter = resolveMeshCenter(anchor, node);
        const prevX = Number.isFinite(node.center?.x) ? node.center.x : Number.NaN;
        const prevY = Number.isFinite(node.center?.y) ? node.center.y : Number.NaN;
        const changed = !Number.isFinite(prevX)
          || !Number.isFinite(prevY)
          || Math.abs(prevX - nextCenter.x) > 1e-9
          || Math.abs(prevY - nextCenter.y) > 1e-9;

        node.parentId = node.meshWith;
        node.center = nextCenter;
        if (changed) {
          passUpdates += 1;
        }
      });

      totalUpdates += passUpdates;
      if (passUpdates === 0) {
        break;
      }
    }

    return totalUpdates;
  }

  function keepGearMeshesSane(deletedNodeId = null, preferredAnchorId = null) {
    const extraGears = getDerivedAdditionalGearNodes();
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
    const moduleValue = getSceneModule();
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
      role: typeof rawNode?.role === "string" ? rawNode.role : (fallback.role ?? null),
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
      module: getSceneModule(),
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

  function applySceneModuleToGears() {
    const sceneModule = getSceneModule();
    simulation.sceneGraph.module = sceneModule;

    Object.values(simulation.sceneGraph.nodeRegistry ?? {}).forEach((node) => {
      const nodeType = normalizeNodeType(node?.type);
      if (!["motor", "gear"].includes(nodeType)) {
        return;
      }

      node.module = sceneModule;
      syncGearRadius(node);
    });

    syncLegacySceneStoresFromRegistry();
  }

  function applySceneGraphConfig(sceneConfig) {
    const graph = sceneConfig?.sceneGraph ?? {};
    const linkageDefaults = getLinkageGroupDefaults(sceneConfig);
    const inputExtraGears = Array.isArray(graph.extraGears) ? graph.extraGears : [];
    const inputExtraJoints = Array.isArray(graph.extraJoints) ? graph.extraJoints : [];
    const canonicalGears = graph.canonicalGears ?? {};
    const sharedModule = toPositiveFinite(
      Number(graph.module ?? sceneConfig?.["shared-module"]),
      toPositiveFinite(
        Number(canonicalGears?.["motor-1"]?.module ?? canonicalGears?.["gear-1"]?.module),
        0.1,
      ),
    );
    simulation.sceneGraph.module = sharedModule;
    simulation.sceneGraph.canonicalGears = {
      "motor-1": {
        showIndicator: canonicalGears?.["motor-1"]?.showIndicator === true,
        module: sharedModule,
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
        module: sharedModule,
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
    simulation.sceneGraph.linkageGroups = Array.isArray(graph.linkageGroups)
      ? graph.linkageGroups.map((group, index) => sanitizeLinkageGroup(group, graph.nodeRegistry ?? {}, index + 1, linkageDefaults))
      : [];
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
    const providedRegistry = graph?.nodeRegistry && typeof graph.nodeRegistry === "object" ? graph.nodeRegistry : null;
    if (providedRegistry && Object.keys(providedRegistry).length > 0) {
      const resolvedRegistry = {};
      Object.entries(providedRegistry).forEach(([nodeId, node]) => {
        if (!node || typeof node !== "object") {
          return;
        }
        resolvedRegistry[nodeId] = sanitizeRegistryNode(node, { id: nodeId, label: nodeId });
      });
      setSceneNodeRegistry(resolvedRegistry);
    } else {
      setSceneNodeRegistry(buildRegistryFromLegacySceneData());
      keepGearMeshesSane();
      rebuildNodeRegistry();
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
    syncLinkageGroups();
    syncLinkageControlsFromGroup(getPrimaryLinkageGroup());
    syncSharedModuleControl();
    applySceneModuleToGears();
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
    syncLinkageControlsFromGroup();
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
    if (typeof nodeId !== "string" || !simulation.sceneGraph.nodeRegistry?.[nodeId]) {
      return false;
    }

    return nodeId !== getRootNodeId() && nodeId !== simulation.sceneGraph.genesisNodeId;
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
    const nextRegistry = Object.fromEntries(
      Object.entries(simulation.sceneGraph.nodeRegistry ?? {}).filter(([candidateId]) => !deletedSet.has(candidateId)),
    );
    simulation.sceneGraph.linkageGroups = getResolvedLinkageGroups()
      .map((group) => ({
        ...group,
        inputGearId: deletedSet.has(group.inputGearId) ? null : group.inputGearId,
        linkageNodeId: deletedSet.has(group.linkageNodeId) ? null : group.linkageNodeId,
        sliderNodeId: deletedSet.has(group.sliderNodeId) ? null : group.sliderNodeId,
        groundNodeId: deletedSet.has(group.groundNodeId) ? null : group.groundNodeId,
      }))
      .filter((group) => {
        if (group.type === "slider-crank") {
          return Boolean(group.inputGearId && group.linkageNodeId && group.sliderNodeId && group.groundNodeId);
        }

        return group.inputGearId || group.linkageNodeId || group.sliderNodeId || group.groundNodeId;
      });

    let nextSelectionId = nodeId;
    while (nextSelectionId && deletedSet.has(nextSelectionId)) {
      nextSelectionId = parentByChild.get(nextSelectionId) ?? null;
    }
    if (!nextSelectionId || !simulation.sceneGraph.nodeRegistry?.[nextSelectionId]) {
      nextSelectionId = getRootNodeId();
    }

    setSceneNodeRegistry(nextRegistry);
    keepGearMeshesSane();
    rebuildNodeRegistry();
    syncParamsFromControls();
    selectObjectById(nextSelectionId);

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
    const gearLookup = getGearLookup();
    const motorNode = gearLookup[getRootNodeId()] ?? canonicalGearNodes()["motor-1"];
    const drivenNode = gearLookup[getPrimaryDrivenGearId()] ?? canonicalGearNodes()["gear-1"];
    const primaryLinkageGroup = getPrimaryLinkageGroup();
    const motorRpmInput = Number(motorNode.inputRpm);
    const motorAngularInput = Number(motorNode.inputAngularSpeed);
    const hasRpmInput = Number.isFinite(motorRpmInput);
    const angularSpeedFromRpm = hasRpmInput ? (2 * Math.PI * motorRpmInput) / 60 : Number.NaN;
    const resolvedModule = getSceneModule();
    const parsed = {
      crank_radius: getLinkageGroupParamValue(primaryLinkageGroup, "crankRadius"),
      rod_length: getLinkageGroupParamValue(primaryLinkageGroup, "rodLength"),
      slider_offset: getLinkageGroupParamValue(primaryLinkageGroup, "sliderOffset"),
      slider_axis: getLinkageGroupParamValue(primaryLinkageGroup, "sliderAxis"),
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
          module: simulation.sceneGraph.module,
          rootNodeId: simulation.sceneGraph.rootNodeId,
          genesisNodeId: simulation.sceneGraph.genesisNodeId,
          genesisPolicy: simulation.sceneGraph.genesisPolicy,
          nodeRegistry: simulation.sceneGraph.nodeRegistry,
          linkageGroups: simulation.sceneGraph.linkageGroups,
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
    const persistentTarget = simulation.sceneGraph.nodeRegistry?.[nodeId] ?? null;
    if (!persistentTarget) {
      return;
    }

    let nextValue = rawValue;
    if (typeof rawValue === "string" && ["teeth", "radius", "inputRpm", "inputAngularSpeed"].includes(key)) {
      nextValue = Number(rawValue);
    }
    if (key === "showIndicator") {
      nextValue = rawValue === true;
    }

    const linkageGroup = getLinkageGroupForNodeId(nodeId);
    if (key === "linkageGroupLabel" && linkageGroup) {
      linkageGroup.label = String(rawValue ?? "").trim() || linkageGroup.id;
      rebuildNodeRegistry();
      syncParamsFromControls();
      renderScene();
      return;
    }

    if (key === "inputGearId" && linkageGroup) {
      const nextInputGearId = String(rawValue ?? "").trim();
      if (!updateLinkedInputGear(linkageGroup, nextInputGearId)) {
        setStatusMessage("Linkage input must reference an existing motor or gear node.", {
          debug: `updateSelectedNodeParam rejected inputGearId=${nextInputGearId} for linkageGroup=${linkageGroup.id}.`,
          level: "warn",
        });
        return;
      }
      simulation.sceneTreeDirty = true;
      rebuildNodeRegistry();
      syncParamsFromControls();
      renderScene();
      return;
    }

    if (key === "crank_radius") {
      if (linkageGroup) {
        linkageGroup.crankRadius = toPositiveFinite(Number(rawValue), getLinkageGroupParamValue(linkageGroup, "crankRadius"));
        syncLinkageControlsFromGroup(linkageGroup);
      }
      syncParamsFromControls();
      renderScene();
      return;
    }

    if (key === "rod_length") {
      if (linkageGroup) {
        linkageGroup.rodLength = toPositiveFinite(Number(rawValue), getLinkageGroupParamValue(linkageGroup, "rodLength"));
        syncLinkageControlsFromGroup(linkageGroup);
      }
      syncParamsFromControls();
      renderScene();
      return;
    }

    if (key === "slider_axis") {
      if (linkageGroup) {
        linkageGroup.sliderAxis = normalizeSliderAxisValue(rawValue);
        relayoutLinkageGroup(linkageGroup);
        rebuildNodeRegistry();
        syncLegacySceneStoresFromRegistry();
        syncLinkageControlsFromGroup(linkageGroup);
      }
      syncParamsFromControls();
      renderScene();
      return;
    }

    if (key === "slider_offset") {
      if (linkageGroup) {
        linkageGroup.sliderOffset = Number.isFinite(Number(rawValue))
          ? Number(rawValue)
          : getLinkageGroupParamValue(linkageGroup, "sliderOffset");
        relayoutLinkageGroup(linkageGroup);
        rebuildNodeRegistry();
        syncLegacySceneStoresFromRegistry();
        syncLinkageControlsFromGroup(linkageGroup);
      }
      syncParamsFromControls();
      renderScene();
      return;
    }

    if (key === "parentId") {
      const nextParentId = String(rawValue ?? "").trim();
      persistentTarget.parentId = nextParentId || null;
      persistentTarget.attachmentTargetId = nextParentId || null;
      simulation.sceneTreeDirty = true;
      rebuildNodeRegistry();
      syncParamsFromControls();
      renderScene();
      return;
    }

    persistentTarget[key] = nextValue;
    if (key === "label") {
      simulation.sceneTreeDirty = true;
    }
    if (["teeth", "radius", "radiusMode", "meshWith"].includes(key)) {
      if (["motor", "gear"].includes(normalizeNodeType(persistentTarget.type))) {
        syncGearRadius(persistentTarget);
      }
      realignMeshedGearCenters();
      keepGearMeshesSane();
    }
    syncLegacySceneStoresFromRegistry();
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
    const nextSignature = selectedNode && schema.length > 0
      ? JSON.stringify({
        id: selectedNode.id,
        type: selectedNode.type,
        fields: schema.map((field) => [field.key, getEditableFieldValue(selectedNode, field.key) ?? field.defaultValue ?? null]),
      })
      : "";
    if (nextSignature === selectedNodeEditorSignature) {
      return;
    }
    selectedNodeEditorSignature = nextSignature;

    controls.selected_node_properties.innerHTML = "";
    controls.node_properties_empty.hidden = Boolean(selectedNode && schema.length > 0);
    if (!selectedNode || schema.length === 0) {
      return;
    }
    schema.forEach((field) => {
      const row = document.createElement("label");
      row.textContent = field.label;
      let input;
      const fieldValue = getEditableFieldValue(selectedNode, field.key);
      if (field.input === "select") {
        input = document.createElement("select");
        (field.options ?? []).forEach((optionValue) => {
          const option = document.createElement("option");
          option.value = optionValue;
          option.textContent = optionValue;
          input.appendChild(option);
        });
        input.value = String(fieldValue ?? field.defaultValue ?? "");
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
          input.checked = fieldValue === true;
        } else {
          input.value = String(fieldValue ?? field.defaultValue ?? "");
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
    updateGearSlotMenu();

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
    const primaryLinkageGroup = getPrimaryLinkageGroup();

    SCENE_EXPORT_CONTROL_IDS.forEach((controlId) => {
      if (controlId === "crank-radius") {
        sceneConfig[controlId] = String(getLinkageGroupParamValue(primaryLinkageGroup, "crankRadius"));
        return;
      }

      if (controlId === "rod-length") {
        sceneConfig[controlId] = String(getLinkageGroupParamValue(primaryLinkageGroup, "rodLength"));
        return;
      }

      if (controlId === "slider-axis") {
        sceneConfig[controlId] = String(getLinkageGroupParamValue(primaryLinkageGroup, "sliderAxis"));
        return;
      }

      if (controlId === "slider-offset") {
        sceneConfig[controlId] = String(getLinkageGroupParamValue(primaryLinkageGroup, "sliderOffset"));
        return;
      }

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
        linkageGroups: simulation.sceneGraph.linkageGroups,
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

  function readTextFile(file) {
    if (!file) {
      return Promise.reject(new Error("No file selected."));
    }

    if (typeof file.text === "function") {
      return file.text();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
      reader.readAsText(file);
    });
  }

  async function importSceneFromFile(file) {
    const sourceText = await readTextFile(file);
    let payload;

    try {
      payload = JSON.parse(sourceText);
    } catch {
      throw new Error("Selected file is not valid JSON.");
    }

    if (!payload || typeof payload !== "object") {
      throw new Error("Selected file does not contain a scene object.");
    }

    simulation.timeSeconds = 0;
    simulation.lastTimestamp = performance.now();
    applySceneConfig(payload);
    selectObjectById(getPrimaryDrivenGearId());
    simulation.sceneTreeDirty = true;
    clearPendingGearSlot();
  }

  function promptForSceneFile() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.hidden = true;
      let settled = false;

      const cleanup = () => {
        input.removeEventListener("change", handleChange);
        input.removeEventListener("cancel", handleCancel);
        window.removeEventListener("focus", handleWindowFocus);
        input.remove();
      };

      const finalize = (file) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(file ?? null);
      };

      const handleChange = () => {
        const [file] = Array.from(input.files ?? []);
        finalize(file ?? null);
      };

      const handleCancel = () => {
        finalize(null);
      };

      const handleWindowFocus = () => {
        window.setTimeout(() => {
          if (!settled && !(input.files?.length > 0)) {
            finalize(null);
          }
        }, 0);
      };

      input.addEventListener("change", handleChange, { once: true });
      input.addEventListener("cancel", handleCancel, { once: true });
      window.addEventListener("focus", handleWindowFocus, { once: true });
      document.body.appendChild(input);
      input.click();
    });
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

  function attachLinkageControlUpdates(control) {
    if (!control) {
      return;
    }

    const handleInput = () => {
      applyLinkageControlsToGroup();
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
  ].forEach(attachLinkageControlUpdates);

  const handleSharedModuleInput = () => {
    simulation.sceneGraph.module = toPositiveFinite(Number(controls.shared_module?.value), getSceneModule());
    applySceneModuleToGears();
    realignMeshedGearCenters();
    keepGearMeshesSane();
    rebuildNodeRegistry();
    syncParamsFromControls();
    renderScene();
  };
  controls.shared_module?.addEventListener("input", handleSharedModuleInput);
  controls.shared_module?.addEventListener("change", handleSharedModuleInput);

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
    applySceneConfig(baseline);
    selectObjectById(getPrimaryDrivenGearId());
    simulation.sceneTreeDirty = true;
    clearPendingGearSlot();
    setStatusMessage("New scene created.", {
      debug: `Loaded baseline workspace from ${NEW_SCENE_BASELINE_PATH}.`,
    });
  });

  controls.save_scene_json?.addEventListener("click", () => {
    const payload = buildSceneExportPayload();
    downloadSceneJson(payload);
    setStatusMessage("Saved scene JSON", {
      debug: "Scene export finished successfully.",
    });
  });

  controls.load_scene?.addEventListener("click", async () => {
    try {
      const file = await promptForSceneFile();
      if (!file) {
        return;
      }

      await importSceneFromFile(file);
      setStatusMessage(`Loaded scene from ${file.name}.`, {
        debug: `Scene import finished successfully from ${file.name}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load scene.";
      setStatusMessage(message, {
        debug: `Scene import failed: ${message}`,
        level: "error",
      });
    }
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
    addGearFromCurrentSelection();
  });

  controls.gear_slot_menu_add_gear?.addEventListener("click", () => {
    addGearFromCurrentSelection();
  });

  controls.add_linkage?.addEventListener("click", () => {
    addLinkageFromCurrentSelection();
  });

  controls.gear_slot_menu_add_linkage?.addEventListener("click", () => {
    addLinkageFromCurrentSelection();
  });

  controls.add_joint?.addEventListener("click", () => {
    addJointFromCurrentSelection();
  });

  controls.gear_slot_menu_add_joint?.addEventListener("click", () => {
    addJointFromCurrentSelection();
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

    syncLegacySceneStoresFromRegistry();
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
      setStatusMessage("Placement slot selected. Choose an action from the popup or toolbar.", {
        debug: `Pending gear slot anchored to ${simulation.pendingGearSlot.anchorId}.`,
      });
      renderScene();
      return;
    }

    clearPendingGearSlot();
    selectObjectById(matched ? matched.id : null);
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

    if (event.code === "Escape") {
      clearPendingGearSlot();
      renderScene();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!simulation.pendingGearSlot || !controls.gear_slot_menu) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (controls.gear_slot_menu.contains(target) || canvas.contains(target)) {
      return;
    }

    clearPendingGearSlot();
    renderScene();
  }, true);

  document.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spacePressed = false;
    }
  });

  window.addEventListener("blur", () => {
    spacePressed = false;
    stopCameraPan();
  });

  window.addEventListener("resize", () => {
    if (simulation.pendingGearSlot) {
      updateGearSlotMenu();
    }
  });

  window.addEventListener("scroll", () => {
    if (simulation.pendingGearSlot) {
      updateGearSlotMenu();
    }
  }, true);

  canvas.addEventListener("pointerup", stopCameraPan);
  canvas.addEventListener("pointercancel", stopCameraPan);
  canvas.addEventListener("mouseleave", stopCameraPan);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  applyTheme(controls.theme_mode?.value);
  syncSharedModuleControl();
  applyInputConstraints(simulation.scene.inputConstraints);
  setSceneNodeRegistry(buildRegistryFromLegacySceneData());
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
