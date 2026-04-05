export const MIN_PRACTICAL_TOOTH_COUNT = 6;
export const MODULE_MATCH_TOLERANCE = 1e-9;
export const CENTER_DISTANCE_TOLERANCE = 1e-6;

function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getNodeRadius(node, sceneDefaults = {}) {
  if (node?.radiusMode === "manual" && Number.isFinite(node?.radius) && node.radius > 0) {
    return node.radius;
  }

  const moduleValue = Number.isFinite(node?.module) && node.module > 0
    ? node.module
    : (Number.isFinite(sceneDefaults?.module) ? sceneDefaults.module : Number.NaN);
  const teethValue = Number.isFinite(node?.toothCount) && node.toothCount > 0
    ? node.toothCount
    : (Number.isFinite(sceneDefaults?.teeth) ? sceneDefaults.teeth : Number.NaN);
  if (Number.isFinite(moduleValue) && moduleValue > 0 && Number.isFinite(teethValue) && teethValue > 0) {
    return (moduleValue * teethValue) / 2;
  }

  if (Number.isFinite(node?.radius) && node.radius > 0) {
    return node.radius;
  }

  return Number.NaN;
}

function getNodeCenter(node) {
  const center = node?.center ?? {};
  const pose = node?.pose ?? {};
  return {
    x: toFiniteNumber(center.x, toFiniteNumber(pose.x, 0)),
    y: toFiniteNumber(center.y, toFiniteNumber(pose.y, 0)),
  };
}

function resolveGraphRootGear(sceneGraph = {}) {
  const registry = sceneGraph.nodeRegistry ?? {};
  const rootId = typeof sceneGraph.rootNodeId === "string" ? sceneGraph.rootNodeId : "motor-1";
  const rootNode = registry[rootId];
  if (rootNode && (rootNode.type === "motor" || rootNode.type === "gear")) {
    return rootId;
  }
  if (registry["motor-1"]) {
    return "motor-1";
  }
  return rootId;
}

function resolvePrimaryDrivenGear(sceneGraph = {}, rootId = "motor-1") {
  const registry = sceneGraph.nodeRegistry ?? {};
  const rootNode = registry[rootId];
  if (!rootNode) {
    return "gear-1";
  }

  const child = Object.values(registry).find((node) => {
    if (!node || node.id === rootId) {
      return false;
    }
    const attachment = node.meshWith ?? node.parentId ?? node.attachmentTargetId;
    return attachment === rootId && (node.type === "gear" || node.role === "driven");
  });

  return child?.id ?? (registry["gear-1"] ? "gear-1" : rootId);
}

function nodeRegistryToGearList(sceneGraph = {}, params = {}) {
  const registry = sceneGraph?.nodeRegistry ?? {};
  const fallbackGears = [
    ...(Array.isArray(sceneGraph?.gears) ? sceneGraph.gears : []),
    ...(Array.isArray(sceneGraph?.extraGears) ? sceneGraph.extraGears : []),
  ];

  const registryGears = Object.values(registry)
    .filter((node) => node && (node.type === "motor" || node.type === "gear"))
    .map((node) => ({
      id: node.id,
      angle: toFiniteNumber(node.angle, 0),
      angularSpeed: node.inputAngularSpeed ?? node.angularSpeed,
      module: node.module,
      toothCount: node.teeth ?? node.toothCount,
      radiusMode: node.radiusMode,
      radius: node.radius,
      center: node.center ?? node.pose,
      meshWith: node.meshWith,
      parentId: node.parentId,
      role: node.type === "motor" ? "driver" : (node.role ?? "gear"),
      showIndicator: node.showIndicator === true,
    }));

  if (registryGears.length > 0) {
    return registryGears;
  }

  return fallbackGears.map((node) => ({
    id: node.id,
    angle: toFiniteNumber(node.angle, 0),
    angularSpeed: node.inputAngularSpeed ?? node.angularSpeed,
    module: node.module,
    toothCount: node.teeth ?? node.toothCount,
    radiusMode: node.radiusMode,
    radius: node.radius,
    center: node.center ?? node.pose,
    meshWith: node.meshWith,
    parentId: node.parentId,
    role: node.type === "motor" ? "driver" : (node.role ?? "gear"),
    showIndicator: node.showIndicator === true,
  }));
}

export function validateGearParams(params) {
  const moduleInput = params.raw_module;
  const driverTeethInput = params.raw_driver_teeth;
  const drivenTeethInput = params.raw_driven_teeth;

  if (Number.isFinite(moduleInput) && moduleInput <= 0) {
    return {
      valid: false,
      reason: "Module must be > 0",
    };
  }

  const toothChecks = [
    ["Driver tooth count", driverTeethInput],
    ["Driven tooth count", drivenTeethInput],
  ];

  for (const [label, count] of toothChecks) {
    if (!Number.isFinite(count)) {
      continue;
    }

    if (!Number.isInteger(count)) {
      return {
        valid: false,
        reason: `${label} must be an integer`,
      };
    }

    if (count < MIN_PRACTICAL_TOOTH_COUNT) {
      return {
        valid: false,
        reason: `${label} must be >= ${MIN_PRACTICAL_TOOTH_COUNT}`,
      };
    }
  }

  if (
    Number.isFinite(params.center_distance) &&
    Number.isFinite(params.driver_radius) &&
    Number.isFinite(params.gear_radius)
  ) {
    const expectedCenterDistance = params.driver_radius + params.gear_radius;
    if (Math.abs(params.center_distance - expectedCenterDistance) > CENTER_DISTANCE_TOLERANCE) {
      return {
        valid: false,
        reason: `Center distance mismatch: expected ${expectedCenterDistance.toFixed(3)} from pitch radii`,
      };
    }
  }

  return { valid: true };
}

export function computeSceneState(sceneGraph, t) {
  const gears = Array.isArray(sceneGraph)
    ? sceneGraph
    : Array.isArray(sceneGraph?.gears)
      ? sceneGraph.gears
      : Array.isArray(sceneGraph?.nodes)
        ? sceneGraph.nodes
        : [];

  const gearsById = {};
  const jointsById = {};

  for (const gear of gears) {
    if (!gear?.id) {
      return {
        valid: false,
        invalidCategory: "constraint",
        invalidReason: "Each gear node must include a unique id",
        gearsById,
        jointsById,
      };
    }

    if (gearsById[gear.id]) {
      return {
        valid: false,
        invalidCategory: "constraint",
        invalidReason: `Duplicate gear id: ${gear.id}`,
        gearsById,
        jointsById,
      };
    }

    const radius = getNodeRadius(gear, sceneGraph?.gearDefaults ?? {});
    if (!Number.isFinite(radius) || radius <= 0) {
      return {
        valid: false,
        invalidCategory: "constraint",
        invalidReason: `Gear ${gear.id} requires a positive radius or (module + toothCount)`,
        gearsById,
        jointsById,
      };
    }

    gearsById[gear.id] = {
      ...gear,
      radius,
      center: getNodeCenter(gear),
      initialAngle: toFiniteNumber(gear.angle, 0),
      inputAngularSpeed: gear.angularSpeed,
      sign: Number.isFinite(gear.sign) ? (gear.sign >= 0 ? 1 : -1) : 1,
      phaseOffset: toFiniteNumber(gear.phaseOffset, 0),
      angle: Number.NaN,
      angularSpeed: Number.NaN,
      valid: true,
    };
  }

  const unresolved = new Set(Object.keys(gearsById));
  let progressed = true;

  while (unresolved.size > 0 && progressed) {
    progressed = false;

    for (const id of Array.from(unresolved)) {
      const node = gearsById[id];
      const parentId = node.meshWith ?? node.parentId;

      if (!parentId) {
        const ownSpeed = toFiniteNumber(node.inputAngularSpeed, 0) * node.sign;
        node.angularSpeed = ownSpeed;
        node.angle = node.initialAngle + ownSpeed * t;
        unresolved.delete(id);
        progressed = true;
        continue;
      }

      const parent = gearsById[parentId];
      if (!parent) {
        return {
          valid: false,
          invalidCategory: "constraint",
          invalidReason: `Gear ${id} references missing parent/mesh node: ${parentId}`,
          gearsById,
          jointsById,
        };
      }

      if (unresolved.has(parentId)) {
        continue;
      }

      if (node.meshWith) {
        if (Number.isFinite(node.module) && Number.isFinite(parent.module)) {
          const moduleMismatch = Math.abs(node.module - parent.module);
          if (moduleMismatch > MODULE_MATCH_TOLERANCE) {
            return {
              valid: false,
              invalidCategory: "constraint",
              invalidReason: `Module mismatch for mesh ${parentId}<->${id}`,
              gearsById,
              jointsById,
            };
          }
        }

        const centerDistance = Math.hypot(node.center.x - parent.center.x, node.center.y - parent.center.y);
        const expectedDistance = parent.radius + node.radius;
        if (Math.abs(centerDistance - expectedDistance) > CENTER_DISTANCE_TOLERANCE) {
          return {
            valid: false,
            invalidCategory: "constraint",
            invalidReason: `Mesh center distance mismatch for ${parentId}<->${id}: expected ${expectedDistance.toFixed(6)}, got ${centerDistance.toFixed(6)}`,
            gearsById,
            jointsById,
          };
        }

        node.angularSpeed = -parent.angularSpeed * (parent.radius / node.radius);
        const parentDelta = parent.angle - parent.initialAngle;
        node.angle = node.initialAngle + (-(parentDelta * parent.radius) / node.radius) + node.phaseOffset;
      } else {
        const ownSpeed = Number.isFinite(node.inputAngularSpeed) ? node.inputAngularSpeed * node.sign : parent.angularSpeed;
        node.angularSpeed = ownSpeed;
        node.angle = node.initialAngle + ownSpeed * t;
      }

      unresolved.delete(id);
      progressed = true;
    }
  }

  if (unresolved.size > 0) {
    return {
      valid: false,
      invalidCategory: "constraint",
      invalidReason: "Unable to resolve gear graph dependencies (cycle or missing root speed)",
      gearsById,
      jointsById,
    };
  }

  for (const joint of sceneGraph?.joints ?? []) {
    if (joint?.id) {
      jointsById[joint.id] = { ...joint };
    }
  }

  return {
    valid: true,
    gearsById,
    jointsById,
  };
}

export function computeState(params, t) {
  const {
    initial_angle = 0,
    angular_speed = 0,
    crank_radius = 0,
    rod_length,
    slider_axis = "horizontal",
    slider_offset = 0,
    crank_angle_offset = 0,
    driver_radius = 0,
    center_distance,
  } = params;

  const gearValidation = validateGearParams(params);
  if (!gearValidation.valid) {
    return {
      valid: false,
      invalidCategory: "constraint",
      invalidReason: gearValidation.reason,
      gear_angle: Number.NaN,
      driver_angle: Number.NaN,
      gearsById: {},
      jointsById: {},
      crank: { x: Number.NaN, y: Number.NaN },
      slider: { x: Number.NaN, y: Number.NaN },
    };
  }

  if (!Number.isFinite(driver_radius) || driver_radius <= 0) {
    return {
      valid: false,
      invalidReason: "driver_radius must be a positive finite number",
      gear_angle: Number.NaN,
      driver_angle: Number.NaN,
      gearsById: {},
      jointsById: {},
      crank: { x: Number.NaN, y: Number.NaN },
      slider: { x: Number.NaN, y: Number.NaN },
    };
  }

  if (!Number.isFinite(params.gear_radius) || params.gear_radius <= 0) {
    return {
      valid: false,
      invalidReason: "gear_radius must be a positive finite number",
      gear_angle: Number.NaN,
      driver_angle: Number.NaN,
      gearsById: {},
      jointsById: {},
      crank: { x: Number.NaN, y: Number.NaN },
      slider: { x: Number.NaN, y: Number.NaN },
    };
  }

  const canonicalCenterDistance = Number.isFinite(center_distance)
    ? center_distance
    : driver_radius + params.gear_radius;
  const rootGearId = resolveGraphRootGear(params.scene_graph);
  const drivenGearId = resolvePrimaryDrivenGear(params.scene_graph, rootGearId);
  const rootRegistryNode = params.scene_graph?.nodeRegistry?.[rootGearId];
  const drivenRegistryNode = params.scene_graph?.nodeRegistry?.[drivenGearId];

  const resolvedModule = Number.isFinite(Number(rootRegistryNode?.module))
    ? Number(rootRegistryNode.module)
    : Number(params.module);
  const resolvedMotorTeeth = Number.isFinite(Number(rootRegistryNode?.teeth))
    ? Number(rootRegistryNode.teeth)
    : Number(params.driver_teeth);
  const resolvedDrivenTeeth = Number.isFinite(Number(drivenRegistryNode?.teeth))
    ? Number(drivenRegistryNode.teeth)
    : Number(params.driven_teeth);
  const graphGearNodes = nodeRegistryToGearList(params.scene_graph, params);
  const fallbackGearNodes = graphGearNodes.length > 0
    ? graphGearNodes
    : [
      {
        id: rootGearId,
        radiusMode: "moduleTeeth",
        radius: Number.isFinite(rootRegistryNode?.radius) ? rootRegistryNode.radius : params.driver_radius,
        angle: initial_angle,
        angularSpeed: angular_speed,
        center: rootRegistryNode?.center ?? { x: -canonicalCenterDistance, y: 0 },
        module: resolvedModule,
        toothCount: resolvedMotorTeeth,
        role: "driver",
        showIndicator: rootRegistryNode?.showIndicator === true,
      },
      ...(drivenGearId !== rootGearId
        ? [{
            id: drivenGearId,
            meshWith: rootGearId,
            radiusMode: "moduleTeeth",
            radius: Number.isFinite(drivenRegistryNode?.radius) ? drivenRegistryNode.radius : params.gear_radius,
            angle: 0,
            phaseOffset: 0,
            module: Number.isFinite(Number(drivenRegistryNode?.module)) ? Number(drivenRegistryNode.module) : resolvedModule,
            toothCount: resolvedDrivenTeeth,
            role: "driven",
            center: drivenRegistryNode?.center ?? { x: 0, y: 0 },
            showIndicator: drivenRegistryNode?.showIndicator !== false,
          }]
        : []),
    ];

  const sceneState = computeSceneState(
    {
      gearDefaults: {
        module: resolvedModule,
      },
      gears: fallbackGearNodes,
    },
    t,
  );

  if (!sceneState.valid) {
    return {
      valid: false,
      invalidCategory: sceneState.invalidCategory,
      invalidReason: sceneState.invalidReason,
      gear_angle: Number.NaN,
      driver_angle: Number.NaN,
      gearsById: sceneState.gearsById,
      jointsById: sceneState.jointsById,
      crank: { x: Number.NaN, y: Number.NaN },
      slider: { x: Number.NaN, y: Number.NaN },
    };
  }

  const driverTheta = sceneState.gearsById[rootGearId]?.angle ?? Number.NaN;
  const drivenTheta = sceneState.gearsById[drivenGearId]?.angle ?? Number.NaN;
  const theta = drivenTheta + crank_angle_offset;

  const gearNodes = Object.values(sceneState.gearsById).map((node, index) => ({
    id: node.id,
    center: node.center,
    radius: node.radius,
    toothCount: node.toothCount,
    angle: node.angle,
    angularSpeed: node.angularSpeed,
    module: node.module,
    parentId: node.parentId ?? null,
    meshPartnerId: node.meshWith ?? null,
    role: node.role,
    showIndicator: node.showIndicator === true,
    drawCenterMarker: node.id !== rootGearId,
    drawMotorHub: node.id === rootGearId,
    zIndex: index,
  }));

  const crank = {
    x: crank_radius * Math.cos(theta),
    y: crank_radius * Math.sin(theta),
  };

  const baseState = {
    valid: true,
    gear_angle: drivenTheta,
    driver_angle: driverTheta,
    rootGearId,
    drivenGearId,
    gearsById: sceneState.gearsById,
    gearNodes,
    jointsById: sceneState.jointsById,
    crank,
    slider: { x: 0, y: 0 },
  };

  if (!Number.isFinite(rod_length) || rod_length <= 0) {
    return {
      ...baseState,
      valid: false,
      invalidReason: "rod_length must be a positive finite number",
    };
  }

  if (slider_axis === "horizontal") {
    const deltaY = slider_offset - crank.y;
    const discriminant = rod_length * rod_length - deltaY * deltaY;

    if (discriminant < 0) {
      return {
        ...baseState,
        valid: false,
        invalidReason: "No real horizontal slider intersection",
        slider: { x: Number.NaN, y: slider_offset },
      };
    }

    const root = Math.sqrt(Math.max(0, discriminant));
    const candidateA = crank.x + root;
    const candidateB = crank.x - root;

    const chosenX = Math.max(candidateA, candidateB);

    return {
      ...baseState,
      slider: { x: chosenX, y: slider_offset },
    };
  }

  if (slider_axis === "vertical") {
    const deltaX = slider_offset - crank.x;
    const discriminant = rod_length * rod_length - deltaX * deltaX;

    if (discriminant < 0) {
      return {
        ...baseState,
        valid: false,
        invalidReason: "No real vertical slider intersection",
        slider: { x: slider_offset, y: Number.NaN },
      };
    }

    const root = Math.sqrt(Math.max(0, discriminant));
    const candidateA = crank.y + root;
    const candidateB = crank.y - root;

    const chosenY = Math.max(candidateA, candidateB);

    return {
      ...baseState,
      slider: { x: slider_offset, y: chosenY },
    };
  }

  return {
    ...baseState,
    valid: false,
    invalidReason: `Unsupported slider_axis: ${slider_axis}`,
    slider: { x: Number.NaN, y: Number.NaN },
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.LinkAndGearsKinematics = {
    computeState,
    computeSceneState,
    validateGearParams,
    MIN_PRACTICAL_TOOTH_COUNT,
    MODULE_MATCH_TOLERANCE,
    CENTER_DISTANCE_TOLERANCE,
  };
}
