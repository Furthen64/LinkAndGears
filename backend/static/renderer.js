export function createTransform(canvas, params, camera = {}) {
  const maxLinkageReach = Math.abs(params.crank_radius) + Math.abs(params.rod_length);
  const motorReach = Math.abs(params.gear_radius) + Math.abs(params.driver_radius) * 2;
  const extent =
    Math.max(
      1,
      Math.abs(params.gear_radius),
      motorReach,
      maxLinkageReach,
      Math.abs(params.slider_offset)
    ) + 1;

  const worldMinX = -extent;
  const worldMaxX = extent;
  const worldMinY = -extent;
  const worldMaxY = extent;
  const worldWidth = worldMaxX - worldMinX;
  const worldHeight = worldMaxY - worldMinY;
  const padding = 26;

  const baseScale = Math.min(
    (canvas.width - padding * 2) / worldWidth,
    (canvas.height - padding * 2) / worldHeight
  );
  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const panX = Number.isFinite(camera.panX) ? camera.panX : 0;
  const panY = Number.isFinite(camera.panY) ? camera.panY : 0;
  const scale = baseScale * zoom;
  const canvasCenter = { x: canvas.width / 2, y: canvas.height / 2 };

  return {
    baseScale,
    zoom,
    panX,
    panY,
    scale,
    toCanvas(point) {
      return {
        x: (point.x - panX) * scale + canvasCenter.x,
        y: (panY - point.y) * scale + canvasCenter.y,
      };
    },
    toWorld(point) {
      return {
        x: panX + (point.x - canvasCenter.x) / scale,
        y: panY - (point.y - canvasCenter.y) / scale,
      };
    },
    toCanvasLength(length) {
      return length * scale;
    },
  };
}

function clampToPositive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getGearGeometry(radiusWorld, params, gearScene, t, toothCountOverride, moduleOverride = Number.NaN) {
  const pitchRadiusPx = t.toCanvasLength(radiusWorld);
  const moduleWorld = Number.isFinite(moduleOverride) && moduleOverride > 0
    ? moduleOverride
    : (Number.isFinite(params.module) && params.module > 0 ? params.module : Number.NaN);
  const fallbackToothCount = Math.max(
    clampToPositive(gearScene.minToothCount, 8),
    Math.round(radiusWorld * clampToPositive(gearScene.teethPerRadiusUnit, 8))
  );
  const toothCount = Number.isFinite(toothCountOverride) && toothCountOverride >= 4 ? toothCountOverride : fallbackToothCount;

  const addendumWorld = Number.isFinite(moduleWorld)
    ? moduleWorld
    : radiusWorld * clampToPositive(gearScene.toothDepthFactor, 0.1) * 0.55;
  const dedendumWorld = Number.isFinite(moduleWorld)
    ? moduleWorld * 1.25
    : radiusWorld * clampToPositive(gearScene.toothDepthFactor, 0.1) * 0.45;

  const addendumPx = Math.max(clampToPositive(gearScene.minToothDepthPx, 3) * 0.45, t.toCanvasLength(addendumWorld));
  const dedendumPx = Math.max(clampToPositive(gearScene.minToothDepthPx, 3) * 0.35, t.toCanvasLength(dedendumWorld));

  return {
    toothCount,
    pitchRadiusPx,
    tipRadiusPx: pitchRadiusPx + addendumPx,
    rootRadiusPx: Math.max(2, pitchRadiusPx - dedendumPx),
  };
}

function drawGearBody(ctx, center, angle, geometry, style) {
  const halfToothAngle = Math.PI / geometry.toothCount;
  const flankRatio = 0.38;

  ctx.beginPath();
  for (let i = 0; i < geometry.toothCount; i += 1) {
    const toothCenter = angle + (i / geometry.toothCount) * Math.PI * 2;
    const rootStart = toothCenter - halfToothAngle;
    const tipStart = toothCenter - halfToothAngle * flankRatio;
    const tipEnd = toothCenter + halfToothAngle * flankRatio;
    const rootEnd = toothCenter + halfToothAngle;
    const points = [
      { radius: geometry.rootRadiusPx, theta: rootStart },
      { radius: geometry.tipRadiusPx, theta: tipStart },
      { radius: geometry.tipRadiusPx, theta: tipEnd },
      { radius: geometry.rootRadiusPx, theta: rootEnd },
    ];

    points.forEach((point, pointIndex) => {
      const px = center.x + Math.cos(point.theta) * point.radius;
      const py = center.y - Math.sin(point.theta) * point.radius;
      if (i === 0 && pointIndex === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
  }

  ctx.closePath();
  ctx.fillStyle = style.fill;
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.lineWidth;
  ctx.lineJoin = "round";
  ctx.fill();

  // Keep the gear outline inside the tooth profile so the external silhouette
  // stays readable for tooth meshing checks.
  ctx.save();
  ctx.clip();
  ctx.stroke();
  ctx.restore();
}

function normalizeGearNode(rawNode, fallback, index = 0) {
  const center = rawNode?.center ?? rawNode?.position ?? {};
  return {
    id: rawNode?.id ?? fallback.id,
    center: {
      x: Number.isFinite(center.x) ? center.x : fallback.center.x,
      y: Number.isFinite(center.y) ? center.y : fallback.center.y,
    },
    radius: Number.isFinite(rawNode?.radius) && rawNode.radius > 0 ? rawNode.radius : fallback.radius,
    toothCount: rawNode?.toothCount ?? rawNode?.teeth ?? fallback.toothCount,
    angle: Number.isFinite(rawNode?.angle) ? rawNode.angle : fallback.angle,
    angularSpeed: Number.isFinite(rawNode?.angularSpeed)
      ? rawNode.angularSpeed
      : Number.isFinite(rawNode?.omega)
        ? rawNode.omega
        : fallback.angularSpeed,
    module: fallback.module,
    parentId: rawNode?.parentId ?? rawNode?.parent ?? null,
    meshPartnerId: rawNode?.meshPartnerId ?? rawNode?.meshWith ?? null,
    renderStyle: rawNode?.renderStyle ?? rawNode?.style ?? null,
    role: rawNode?.role ?? fallback.role,
    showIndicator: rawNode?.showIndicator === true ? true : fallback.showIndicator === true,
    drawCenterMarker: rawNode?.drawCenterMarker ?? fallback.drawCenterMarker,
    drawMotorHub: rawNode?.drawMotorHub ?? fallback.drawMotorHub,
    zIndex: Number.isFinite(rawNode?.zIndex) ? rawNode.zIndex : index,
  };
}

function getGearToothPhaseOffset(node, geometry) {
  return node.role === "driver" ? Math.PI / geometry.toothCount : 0;
}

function resolveGraphRootGearId(params = {}, state = {}) {
  if (typeof state?.rootGearId === "string") {
    return state.rootGearId;
  }
  const graph = params.scene_graph ?? {};
  const rootId = typeof graph.rootNodeId === "string" ? graph.rootNodeId : "motor-1";
  return graph.nodeRegistry?.[rootId] ? rootId : "motor-1";
}

function resolveDrivenGearId(params = {}, state = {}, rootGearId = "motor-1") {
  if (typeof state?.drivenGearId === "string") {
    return state.drivenGearId;
  }
  const graph = params.scene_graph ?? {};
  const registry = graph.nodeRegistry ?? {};
  const driven = Object.values(registry).find((node) => {
    const attachment = node?.meshWith ?? node?.parentId ?? node?.attachmentTargetId;
    return attachment === rootGearId && node?.type === "gear";
  });
  return driven?.id ?? (registry["gear-1"] ? "gear-1" : rootGearId);
}

function computeGearNodes(params, state) {
  const nominalCenterDistance = params.gear_radius + params.driver_radius;
  const registry = params.scene_graph?.nodeRegistry ?? {};
  const rootGearId = resolveGraphRootGearId(params, state);
  const drivenGearId = resolveDrivenGearId(params, state, rootGearId);
  const rootRegistryNode = registry[rootGearId] ?? {};
  const drivenRegistryNode = registry[drivenGearId] ?? {};
  const extraGearConfigById = Object.fromEntries(
    Object.values(registry)
      .filter((node) => node && node.type === "gear" && node.id !== drivenGearId)
      .map((node) => [node.id, node])
  );
  const defaults = [
    {
      id: rootGearId,
      center: { x: -nominalCenterDistance, y: 0 },
      radius: params.driver_radius,
      toothCount: params.driver_teeth,
      angle: state.driver_angle,
      angularSpeed: params.angular_speed,
      module: params.module,
      meshPartnerId: drivenGearId,
      parentId: null,
      role: "driver",
      showIndicator: rootRegistryNode?.showIndicator === true,
      drawMotorHub: true,
      drawCenterMarker: false,
    },
    {
      id: drivenGearId,
      center: { x: 0, y: 0 },
      radius: params.gear_radius,
      toothCount: params.driven_teeth,
      angle: state.gear_angle,
      angularSpeed: Number.isFinite(params.angular_speed) && Number.isFinite(params.driver_radius) && Number.isFinite(params.gear_radius) && params.gear_radius !== 0
        ? -(params.angular_speed * params.driver_radius) / params.gear_radius
        : Number.NaN,
      module: params.module,
      meshPartnerId: rootGearId,
      parentId: rootGearId,
      role: "driven",
      showIndicator: drivenRegistryNode?.showIndicator === false ? false : true,
      drawMotorHub: false,
      drawCenterMarker: true,
    },
  ];

  const stateNodes = Array.isArray(state?.gearNodes)
    ? state.gearNodes
    : Array.isArray(state?.gear_nodes)
      ? state.gear_nodes
      : null;

  if (!stateNodes || stateNodes.length === 0) {
    return defaults;
  }

  return stateNodes.map((node, index) => {
    const extraNodeConfig = typeof node?.id === "string" ? extraGearConfigById[node.id] : null;
    const fallback = defaults.find((item) => item.id === node?.id) ?? {
      ...defaults[1],
      id: node?.id ?? `gear-${index + 1}`,
      center: { x: 0, y: 0 },
      radius: params.gear_radius,
      toothCount: params.driven_teeth,
      angle: state.gear_angle,
      angularSpeed: Number.NaN,
      parentId: null,
      meshPartnerId: null,
      role: "gear",
      showIndicator: extraNodeConfig?.showIndicator === true,
      drawCenterMarker: false,
      drawMotorHub: false,
    };
    return normalizeGearNode(node, fallback, index);
  });
}

function computeSceneAnchorPoints(params = {}, state = {}, gearNodes = []) {
  const anchors = Object.fromEntries(
    gearNodes
      .filter((node) => node && typeof node.id === "string" && Number.isFinite(node.center?.x) && Number.isFinite(node.center?.y))
      .map((node) => [node.id, { x: node.center.x, y: node.center.y }])
  );

  if (anchors["gear-1"]) {
    anchors["linkage-1"] = { ...anchors["gear-1"] };
  }

  if (Number.isFinite(state?.slider?.x) && Number.isFinite(state?.slider?.y)) {
    anchors["slider-1"] = { x: state.slider.x, y: state.slider.y };
  }

  if (params?.slider_axis === "vertical") {
    anchors["ground-1"] = { x: Number.isFinite(params?.slider_offset) ? params.slider_offset : 0, y: 0 };
  } else {
    anchors["ground-1"] = { x: 0, y: Number.isFinite(params?.slider_offset) ? params.slider_offset : 0 };
  }

  return anchors;
}

function computeJointNodes(params = {}, state = {}, gearNodes = []) {
  const registry = params?.scene_graph?.nodeRegistry ?? {};
  const rawJointNodes = Object.values(registry).filter((node) => node?.type === "joint-anchor");
  if (rawJointNodes.length === 0) {
    return [];
  }

  const anchorPoints = computeSceneAnchorPoints(params, state, gearNodes);
  const siblingCountByParent = new Map();

  return rawJointNodes.map((node) => {
    const parentId = node?.parentId ?? node?.attachmentTargetId ?? null;
    const parentAnchor = parentId ? anchorPoints[parentId] : null;
    const explicitCenter = node?.center ?? {};

    let center = null;
    if (Number.isFinite(explicitCenter.x) && Number.isFinite(explicitCenter.y)) {
      center = { x: explicitCenter.x, y: explicitCenter.y };
    } else if (parentAnchor) {
      const parentKey = parentId ?? "__root__";
      const siblingIndex = siblingCountByParent.get(parentKey) ?? 0;
      siblingCountByParent.set(parentKey, siblingIndex + 1);
      const angle = (-Math.PI / 2) + siblingIndex * (Math.PI / 3);
      const distance = 0.45;
      center = {
        x: parentAnchor.x + Math.cos(angle) * distance,
        y: parentAnchor.y + Math.sin(angle) * distance,
      };
    } else {
      center = { x: 0, y: 0 };
    }

    anchorPoints[node.id] = center;
    return {
      id: node.id,
      label: node.label ?? node.id,
      parentId,
      center,
    };
  });
}

function drawGearNode(ctx, transform, params, scene, node) {
  const style = node.renderStyle ?? (node.role === "driver" ? scene.driverGear : scene.gear);
  const geometry = getGearGeometry(node.radius, params, style, transform, node.toothCount, node.module);
  const centerCanvas = transform.toCanvas(node.center);
  const toothPhaseOffset = getGearToothPhaseOffset(node, geometry);

  drawGearBody(ctx, centerCanvas, node.angle + toothPhaseOffset, geometry, style);

  if (node.drawMotorHub) {
    ctx.fillStyle = scene.driverGear.motorHubFill;
    ctx.beginPath();
    ctx.arc(centerCanvas.x, centerCanvas.y, scene.driverGear.motorHubRadiusPx, 0, Math.PI * 2);
    ctx.fill();
  }

  if (node.drawCenterMarker) {
    ctx.fillStyle = scene.centerMarker.fill;
    ctx.beginPath();
    ctx.arc(centerCanvas.x, centerCanvas.y, scene.centerMarker.radiusPx, 0, Math.PI * 2);
    ctx.fill();
  }

  return { centerCanvas, geometry };
}

function drawGearIndicator(ctx, scene, node, centerCanvas, geometry, fallbackAngularSpeed = Number.NaN) {
  const toothPhaseOffset = getGearToothPhaseOffset(node, geometry);
  const indicatorAngle = (Number.isFinite(node?.angle) ? node.angle : 0) + toothPhaseOffset;
  const indicatorRadiusPx = Number.isFinite(scene?.rotationArrow?.radiusPx)
    ? Math.max(1, scene.rotationArrow.radiusPx)
    : 4;
  const radialPlacementPx = Math.max(indicatorRadiusPx, geometry.tipRadiusPx - indicatorRadiusPx * 0.6);
  const markerCenter = {
    x: centerCanvas.x + Math.cos(indicatorAngle) * radialPlacementPx,
    y: centerCanvas.y - Math.sin(indicatorAngle) * radialPlacementPx,
  };
  const resolvedAngularSpeed = Number.isFinite(node?.angularSpeed) ? node.angularSpeed : fallbackAngularSpeed;
  const useSecondaryColor = !Number.isFinite(resolvedAngularSpeed) || resolvedAngularSpeed < 0;
  const primaryFill = scene.rotationArrow.fill ?? "#0ea5e9";
  const secondaryFill = scene.rotationArrow.secondaryFill ?? primaryFill;
  const indicatorFill = useSecondaryColor ? secondaryFill : primaryFill;

  ctx.strokeStyle = scene.rotationArrow.stroke ?? "#e2e8f0";
  ctx.fillStyle = indicatorFill;
  ctx.lineWidth = Number.isFinite(scene.rotationArrow.lineWidth) ? scene.rotationArrow.lineWidth : 1.5;
  ctx.beginPath();
  ctx.arc(markerCenter.x, markerCenter.y, indicatorRadiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
  const projection = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function formatValue(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

function chooseGridSpacing(scale, minPixels = 30, maxPixels = 80) {
  const positiveScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const targetPixels = (minPixels + maxPixels) / 2;
  const targetWorld = targetPixels / positiveScale;
  const exponent = Math.floor(Math.log10(targetWorld));
  const power = 10 ** exponent;
  const candidates = [1, 2, 5, 10]
    .flatMap((factor) => [factor * power, factor * power * 10])
    .filter((value) => value > 0);

  let best = candidates[0] ?? 1;
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate) => {
    const pixels = candidate * positiveScale;
    let score = Math.abs(pixels - targetPixels);
    if (pixels < minPixels) {
      score += (minPixels - pixels) * 2;
    }
    if (pixels > maxPixels) {
      score += (pixels - maxPixels) * 2;
    }
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
}

function drawGrid(ctx, canvas, transform, options = {}) {
  const grid = options.grid ?? {};
  if (grid.visible === false || !Number.isFinite(transform.scale) || transform.scale <= 0) {
    return;
  }

  const bottomLeft = transform.toWorld({ x: 0, y: canvas.height });
  const topRight = transform.toWorld({ x: canvas.width, y: 0 });
  const worldMinX = Math.min(bottomLeft.x, topRight.x);
  const worldMaxX = Math.max(bottomLeft.x, topRight.x);
  const worldMinY = Math.min(bottomLeft.y, topRight.y);
  const worldMaxY = Math.max(bottomLeft.y, topRight.y);

  const minorSpacing = chooseGridSpacing(transform.scale, grid.minPixelSpacing, grid.maxPixelSpacing);
  const majorEvery = Number.isFinite(grid.majorEvery) && grid.majorEvery >= 2 ? Math.floor(grid.majorEvery) : 5;

  const minorColor = grid.minorColor ?? "rgba(148, 163, 184, 0.22)";
  const majorColor = grid.majorColor ?? "rgba(148, 163, 184, 0.4)";
  const axisColor = grid.axisColor ?? "rgba(59, 130, 246, 0.55)";

  const firstColumn = Math.floor(worldMinX / minorSpacing);
  const lastColumn = Math.ceil(worldMaxX / minorSpacing);
  const firstRow = Math.floor(worldMinY / minorSpacing);
  const lastRow = Math.ceil(worldMaxY / minorSpacing);

  const isMajorLine = (index) => ((index % majorEvery) + majorEvery) % majorEvery === 0;

  ctx.save();
  ctx.lineCap = "butt";
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    const x = column * minorSpacing;
    const canvasX = transform.toCanvas({ x, y: 0 }).x;
    const isMajor = isMajorLine(column);
    ctx.strokeStyle = isMajor ? majorColor : minorColor;
    ctx.lineWidth = isMajor ? (grid.majorLineWidth ?? 1.1) : (grid.minorLineWidth ?? 0.7);
    ctx.beginPath();
    ctx.moveTo(canvasX, 0);
    ctx.lineTo(canvasX, canvas.height);
    ctx.stroke();
  }

  for (let row = firstRow; row <= lastRow; row += 1) {
    const y = row * minorSpacing;
    const canvasY = transform.toCanvas({ x: 0, y }).y;
    const isMajor = isMajorLine(row);
    ctx.strokeStyle = isMajor ? majorColor : minorColor;
    ctx.lineWidth = isMajor ? (grid.majorLineWidth ?? 1.1) : (grid.minorLineWidth ?? 0.7);
    ctx.beginPath();
    ctx.moveTo(0, canvasY);
    ctx.lineTo(canvas.width, canvasY);
    ctx.stroke();
  }

  if (grid.showAxes !== false) {
    if (worldMinX <= 0 && worldMaxX >= 0) {
      const axisX = transform.toCanvas({ x: 0, y: 0 }).x;
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = grid.axisLineWidth ?? 1.6;
      ctx.beginPath();
      ctx.moveTo(axisX, 0);
      ctx.lineTo(axisX, canvas.height);
      ctx.stroke();
    }
    if (worldMinY <= 0 && worldMaxY >= 0) {
      const axisY = transform.toCanvas({ x: 0, y: 0 }).y;
      ctx.strokeStyle = axisColor;
      ctx.lineWidth = grid.axisLineWidth ?? 1.6;
      ctx.beginPath();
      ctx.moveTo(0, axisY);
      ctx.lineTo(canvas.width, axisY);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function objectDetails(selection, params, state) {
  const sceneRegistry = params?.scene_graph?.nodeRegistry ?? {};
  const hasLinkage = Boolean(sceneRegistry["linkage-1"]);
  const hasSlider = Boolean(sceneRegistry["slider-1"]);
  const hasGround = Boolean(sceneRegistry["ground-1"]);
  const currentCrankArmLength = Math.hypot(state.crank.x, state.crank.y);
  const currentRodLength = Math.hypot(
    state.slider.x - state.crank.x,
    state.slider.y - state.crank.y
  );

  if (!selection) {
    return { title: "No object selected", details: [] };
  }

  const gearNodes = computeGearNodes(params, state);
  const jointNodes = computeJointNodes(params, state, gearNodes);
  const selectedGearNode = gearNodes.find((node) => node.id === selection);
  if (selectedGearNode) {
    const relation = selectedGearNode.parentId ?? selectedGearNode.meshPartnerId ?? "None";
    return {
      title: `Gear (${selectedGearNode.id})`,
      details: [
        ["Radius", formatValue(selectedGearNode.radius)],
        ["Module", formatValue(selectedGearNode.module)],
        ["Teeth", formatValue(selectedGearNode.toothCount, 0)],
        ["Current angle", formatValue(selectedGearNode.angle)],
        ["Angular speed (rad/s)", formatValue(selectedGearNode.angularSpeed)],
        ["Center", `(${formatValue(selectedGearNode.center.x)}, ${formatValue(selectedGearNode.center.y)})`],
        [selectedGearNode.parentId ? "Parent id" : "Mesh partner id", relation],
      ],
    };
  }

  const rootGearId = resolveGraphRootGearId(params, state);
  const drivenGearId = resolveDrivenGearId(params, state, rootGearId);

  if (selection === "gear" || selection === drivenGearId) {
    return {
      title: "Gear",
      details: [
        ["Gear radius (canonical)", formatValue(params.gear_radius)],
        ["Driven pitch diameter", formatValue(params.driven_pitch_diameter)],
        ["Module (canonical)", formatValue(params.module)],
        ["Driven teeth z2 (canonical)", formatValue(params.driven_teeth, 0)],
        ["Motor speed (RPM)", formatValue(params.motor_rpm)],
        ["Angular speed (rad/s)", formatValue(params.angular_speed)],
        ["Current angle", formatValue(state.gear_angle)],
        ["Center", "(0.000, 0.000)"],
      ],
    };
  }

  if (selection === "motor" || selection === rootGearId) {
    return {
      title: "Motor gear",
      details: [
        ["Driver radius (canonical)", formatValue(params.driver_radius)],
        ["Driver pitch diameter", formatValue(params.driver_pitch_diameter)],
        ["Module (canonical)", formatValue(params.module)],
        ["Driver teeth z1 (canonical)", formatValue(params.driver_teeth, 0)],
        ["Motor speed (RPM)", formatValue(params.motor_rpm)],
        ["Angular speed (rad/s)", formatValue(params.angular_speed)],
        ["Current angle", formatValue(state.driver_angle)],
        ["Center", `(${formatValue(-(params.gear_radius + params.driver_radius))}, 0.000)`],
      ],
    };
  }

  if ((selection === "linkage" || selection === "linkage-1") && hasLinkage) {
    return {
      title: "Linkage",
      details: [
        ["Crank radius (canonical)", formatValue(params.crank_radius)],
        ["Crank arm length (actual)", formatValue(currentCrankArmLength)],
        ["Rod length (canonical)", formatValue(params.rod_length)],
        ["Rod length (actual)", formatValue(currentRodLength)],
        ["Crank pin", `(${formatValue(state.crank.x)}, ${formatValue(state.crank.y)})`],
        ["Slider joint", `(${formatValue(state.slider.x)}, ${formatValue(state.slider.y)})`],
      ],
    };
  }

  if ((selection === "ground" || selection === "ground-1") && hasGround) {
    return {
      title: "Ground",
      details: [
        ["Slider axis", params.slider_axis],
        ["Rail offset", formatValue(params.slider_offset)],
        ["Ground origin", "(0.000, 0.000)"],
      ],
    };
  }

  if ((selection === "slider" || selection === "slider-1") && hasSlider) {
    return {
      title: "Slider",
      details: [
        ["Axis", params.slider_axis],
        ["Offset", formatValue(params.slider_offset)],
        ["Position", `(${formatValue(state.slider.x)}, ${formatValue(state.slider.y)})`],
      ],
    };
  }

  const selectedJointNode = jointNodes.find((node) => node.id === selection);
  if (selectedJointNode) {
    return {
      title: `Joint (${selectedJointNode.id})`,
      details: [
        ["Parent id", selectedJointNode.parentId ?? "None"],
        ["Position", `(${formatValue(selectedJointNode.center.x)}, ${formatValue(selectedJointNode.center.y)})`],
      ],
    };
  }

  return {
    title: `Scene node (${selection})`,
    details: [["Status", "Added in scene tree (visual placement pending)"]],
  };
}

export function drawScene(ctx, canvas, params, state, scene, selectedObject, options = {}, camera = {}) {
  const sceneRegistry = params?.scene_graph?.nodeRegistry ?? {};
  const hasLinkage = Boolean(sceneRegistry["linkage-1"]);
  const hasSlider = Boolean(sceneRegistry["slider-1"]);
  const hasGround = Boolean(sceneRegistry["ground-1"]);
  const t = createTransform(canvas, params, camera);
  const gearNodes = computeGearNodes(params, state).sort((a, b) => a.zIndex - b.zIndex);
  const jointNodes = computeJointNodes(params, state, gearNodes);
  const crank = t.toCanvas(state.crank);
  const slider = t.toCanvas(state.slider);
  const isLightTheme = options.theme === "light";
  const gridPalette = isLightTheme ? scene.grid?.light : scene.grid?.dark;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, canvas, t, { grid: gridPalette });

  if (hasGround) {
    ctx.strokeStyle = scene.rail.stroke;
    ctx.lineWidth = scene.rail.lineWidth;
    if (params.slider_axis === "horizontal") {
      const railY = t.toCanvas({ x: 0, y: params.slider_offset }).y;
      ctx.beginPath();
      ctx.moveTo(scene.rail.margin, railY);
      ctx.lineTo(canvas.width - scene.rail.margin, railY);
      ctx.stroke();
    } else {
      const railX = t.toCanvas({ x: params.slider_offset, y: 0 }).x;
      ctx.beginPath();
      ctx.moveTo(railX, scene.rail.margin);
      ctx.lineTo(railX, canvas.height - scene.rail.margin);
      ctx.stroke();
    }
  }

  const renderedGears = gearNodes.map((node) => ({ node, ...drawGearNode(ctx, t, params, scene, node) }));
  renderedGears.forEach(({ node, centerCanvas, geometry }) => {
    if (node.showIndicator !== true) {
      return;
    }
    drawGearIndicator(ctx, scene, node, centerCanvas, geometry, params.angular_speed);
  });

  const rootGearId = resolveGraphRootGearId(params, state);
  const drivenGearId = resolveDrivenGearId(params, state, rootGearId);
  const drivenGear = renderedGears.find((entry) => entry.node.id === drivenGearId)
    ?? renderedGears.find((entry) => entry.node.role !== "driver")
    ?? renderedGears[0];
  const center = drivenGear?.centerCanvas ?? t.toCanvas({ x: 0, y: 0 });

  const sliderDimensions =
    params.slider_axis === "horizontal" ? scene.sliderBlock.horizontal : scene.sliderBlock.vertical;
  if (hasLinkage) {
    ctx.strokeStyle = scene.crankArm.stroke;
    ctx.lineWidth = scene.crankArm.lineWidth;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(crank.x, crank.y);
    ctx.stroke();

    if (hasSlider) {
      ctx.strokeStyle = scene.connectingRod.stroke;
      ctx.lineWidth = scene.connectingRod.lineWidth;
      ctx.beginPath();
      ctx.moveTo(crank.x, crank.y);
      ctx.lineTo(slider.x, slider.y);
      ctx.stroke();
    }

    ctx.fillStyle = scene.crankPin.fill;
    ctx.beginPath();
    ctx.arc(crank.x, crank.y, scene.crankPin.radiusPx, 0, Math.PI * 2);
    ctx.fill();
  }

  if (hasSlider) {
    ctx.fillStyle = scene.sliderBlock.fill;
    ctx.fillRect(
      slider.x - sliderDimensions.widthPx / 2,
      slider.y - sliderDimensions.heightPx / 2,
      sliderDimensions.widthPx,
      sliderDimensions.heightPx
    );
  }

  const jointRadiusPx = 6;
  jointNodes.forEach((joint) => {
    const jointCenter = t.toCanvas(joint.center);
    const parentNode = joint.parentId
      ? (gearNodes.find((node) => node.id === joint.parentId) ?? jointNodes.find((node) => node.id === joint.parentId) ?? null)
      : null;
    const parentCenterWorld = parentNode?.center
      ?? (joint.parentId === "slider-1" ? state.slider : null)
      ?? (joint.parentId === "ground-1"
        ? (params.slider_axis === "vertical"
          ? { x: params.slider_offset, y: 0 }
          : { x: 0, y: params.slider_offset })
        : null);

    if (parentCenterWorld && Number.isFinite(parentCenterWorld.x) && Number.isFinite(parentCenterWorld.y)) {
      const parentCanvas = t.toCanvas(parentCenterWorld);
      ctx.strokeStyle = "rgba(125, 211, 252, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(parentCanvas.x, parentCanvas.y);
      ctx.lineTo(jointCenter.x, jointCenter.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.fillStyle = selectedObject === joint.id ? "#f59e0b" : "#38bdf8";
    ctx.strokeStyle = "#082f49";
    ctx.lineWidth = selectedObject === joint.id ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.arc(jointCenter.x, jointCenter.y, jointRadiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  const selectionStroke = isLightTheme ? "#111827" : "#f8fafc";
  const selectionWidth = 2;
  const slotFill = isLightTheme ? "rgba(37, 99, 235, 0.2)" : "rgba(56, 189, 248, 0.24)";
  const slotStroke = isLightTheme ? "#1d4ed8" : "#67e8f9";
  const activeSlotFill = isLightTheme ? "rgba(14, 165, 233, 0.38)" : "rgba(34, 211, 238, 0.48)";
  const activeSlotStroke = isLightTheme ? "#0c4a6e" : "#cffafe";
  const slotRadiusPx = 9;
  const selectedGear = renderedGears.find(
    (entry) => entry.node.id === selectedObject || (selectedObject === "motor" && entry.node.id === rootGearId)
  );
  const slotRegions = [];
  if (selectedGear) {
    ctx.strokeStyle = selectionStroke;
    ctx.lineWidth = selectionWidth;
    ctx.beginPath();
    ctx.arc(selectedGear.centerCanvas.x, selectedGear.centerCanvas.y, selectedGear.geometry.tipRadiusPx + 4, 0, Math.PI * 2);
    ctx.stroke();

    const slotPlacementDistancePx = selectedGear.geometry.tipRadiusPx + slotRadiusPx + 8;
    const slotDirections = [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: -1, y: 1 },
      { x: -1, y: 0 },
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
    ];

    slotDirections.forEach((direction) => {
      const magnitude = Math.hypot(direction.x, direction.y) || 1;
      const unitDirection = { x: direction.x / magnitude, y: direction.y / magnitude };
      const centerCanvas = {
        x: selectedGear.centerCanvas.x + unitDirection.x * slotPlacementDistancePx,
        y: selectedGear.centerCanvas.y - unitDirection.y * slotPlacementDistancePx,
      };
      const centerWorld = t.toWorld(centerCanvas);
      const key = `${selectedGear.node.id}:${unitDirection.x.toFixed(3)}:${unitDirection.y.toFixed(3)}`;
      const isActive = options?.activeGearSlot?.key === key;

      ctx.fillStyle = isActive ? activeSlotFill : slotFill;
      ctx.strokeStyle = isActive ? activeSlotStroke : slotStroke;
      ctx.lineWidth = isActive ? 2.5 : 2;
      ctx.beginPath();
      ctx.arc(centerCanvas.x, centerCanvas.y, slotRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      slotRegions.push({
        id: `placement-slot:${key}`,
        sourceGearId: selectedGear.node.id,
        direction: unitDirection,
        centerWorld,
      });
    });
  } else if ((selectedObject === "linkage" || selectedObject === "linkage-1") && hasLinkage) {
    ctx.strokeStyle = selectionStroke;
    ctx.lineWidth = selectionWidth;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(crank.x, crank.y);
    if (hasSlider) {
      ctx.lineTo(slider.x, slider.y);
    }
    ctx.stroke();
  } else if ((selectedObject === "ground" || selectedObject === "ground-1") && hasGround) {
    ctx.strokeStyle = selectionStroke;
    ctx.lineWidth = selectionWidth;
    ctx.setLineDash([6, 4]);
    if (params.slider_axis === "horizontal") {
      const railY = t.toCanvas({ x: 0, y: params.slider_offset }).y;
      ctx.beginPath();
      ctx.moveTo(scene.rail.margin, railY);
      ctx.lineTo(canvas.width - scene.rail.margin, railY);
      ctx.stroke();
    } else {
      const railX = t.toCanvas({ x: params.slider_offset, y: 0 }).x;
      ctx.beginPath();
      ctx.moveTo(railX, scene.rail.margin);
      ctx.lineTo(railX, canvas.height - scene.rail.margin);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  } else if ((selectedObject === "slider" || selectedObject === "slider-1") && hasSlider) {
    ctx.strokeStyle = selectionStroke;
    ctx.lineWidth = selectionWidth;
    ctx.strokeRect(
      slider.x - sliderDimensions.widthPx / 2 - 2,
      slider.y - sliderDimensions.heightPx / 2 - 2,
      sliderDimensions.widthPx + 4,
      sliderDimensions.heightPx + 4
    );
  }

  const railTolerance = 8;
  const linkageTolerance = 8;

  const hitRegions = [
    ...(hasSlider ? [{
      id: "slider-1",
      contains(point) {
        return (
          point.x >= slider.x - sliderDimensions.widthPx / 2 &&
          point.x <= slider.x + sliderDimensions.widthPx / 2 &&
          point.y >= slider.y - sliderDimensions.heightPx / 2 &&
          point.y <= slider.y + sliderDimensions.heightPx / 2
        );
      },
    }] : []),
    ...renderedGears.map((entry) => ({
      id: entry.node.id,
      contains(point) {
        return Math.hypot(point.x - entry.centerCanvas.x, point.y - entry.centerCanvas.y) <= entry.geometry.tipRadiusPx + 4;
      },
    })),
    ...jointNodes.map((joint) => ({
      id: joint.id,
      contains(point) {
        const centerCanvas = t.toCanvas(joint.center);
        return Math.hypot(point.x - centerCanvas.x, point.y - centerCanvas.y) <= jointRadiusPx + 4;
      },
    })),
    ...slotRegions.map((slotRegion) => ({
      id: slotRegion.id,
      sourceGearId: slotRegion.sourceGearId,
      direction: slotRegion.direction,
      centerWorld: slotRegion.centerWorld,
      contains(point) {
        const slotCanvas = t.toCanvas(slotRegion.centerWorld);
        return Math.hypot(point.x - slotCanvas.x, point.y - slotCanvas.y) <= slotRadiusPx + 2;
      },
    })),
    ...(hasLinkage ? [{
      id: "linkage-1",
      contains(point) {
        const closeToCrankArm = distanceToSegment(point, center, crank) <= linkageTolerance;
        const closeToRod = hasSlider ? distanceToSegment(point, crank, slider) <= linkageTolerance : false;
        const closeToPin = Math.hypot(point.x - crank.x, point.y - crank.y) <= scene.crankPin.radiusPx + 4;
        return closeToCrankArm || closeToRod || closeToPin;
      },
    }] : []),
    ...(hasGround ? [{
      id: "ground-1",
      contains(point) {
        if (params.slider_axis === "horizontal") {
          const railY = t.toCanvas({ x: 0, y: params.slider_offset }).y;
          return (
            Math.abs(point.y - railY) <= railTolerance &&
            point.x >= scene.rail.margin &&
            point.x <= canvas.width - scene.rail.margin
          );
        }

        const railX = t.toCanvas({ x: params.slider_offset, y: 0 }).x;
        return (
          Math.abs(point.x - railX) <= railTolerance &&
          point.y >= scene.rail.margin &&
          point.y <= canvas.height - scene.rail.margin
        );
      },
    }] : []),
  ];

  return hitRegions;
}

if (typeof globalThis !== "undefined") {
  globalThis.LinkAndGearsRenderer = { drawScene, createTransform, objectDetails };
}
