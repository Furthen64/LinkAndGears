import {
  getNodeLayerId,
  getSceneLayer,
  getSceneNode,
  resolveLinkageGroups,
  resolvePrimaryDrivenGearId,
  resolveSceneLayers,
  resolveSceneRootGearId,
} from "./scene-graph.js";
import { shouldExposeDebugGlobals } from "./debug-flags.js";

export function createTransform(canvas, params, camera = {}) {
  const linkageGroups = resolveLinkageGroups(params.scene_graph ?? {});
  const maxLinkageReach = linkageGroups.reduce((maxReach, group) => {
    const crankRadius = Number.isFinite(Number(group?.crankRadius)) ? Number(group.crankRadius) : Math.abs(params.crank_radius);
    const rodLength = Number.isFinite(Number(group?.rodLength)) ? Number(group.rodLength) : Math.abs(params.rod_length);
    return Math.max(maxReach, Math.abs(crankRadius) + Math.abs(rodLength));
  }, Math.abs(params.crank_radius) + Math.abs(params.rod_length));
  const maxSliderOffset = linkageGroups.reduce((maxOffset, group) => {
    const sliderOffset = Number.isFinite(Number(group?.sliderOffset)) ? Number(group.sliderOffset) : params.slider_offset;
    return Math.max(maxOffset, Math.abs(sliderOffset));
  }, Math.abs(params.slider_offset));
  const motorReach = Math.abs(params.gear_radius) + Math.abs(params.driver_radius) * 2;
  const extent =
    Math.max(
      1,
      Math.abs(params.gear_radius),
      motorReach,
      maxLinkageReach,
      maxSliderOffset
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
    rigidWith: rawNode?.rigidWith ?? fallback.rigidWith ?? null,
    layerId: rawNode?.layerId ?? fallback.layerId ?? null,
    renderStyle: rawNode?.renderStyle ?? rawNode?.style ?? null,
    role: rawNode?.role ?? fallback.role,
    showIndicator: rawNode?.showIndicator === true ? true : fallback.showIndicator === true,
    drawCenterMarker: rawNode?.drawCenterMarker ?? fallback.drawCenterMarker,
    drawMotorHub: rawNode?.drawMotorHub ?? fallback.drawMotorHub,
    zIndex: Number.isFinite(rawNode?.zIndex) ? rawNode.zIndex : index,
  };
}

function getLayerOrderMap(sceneGraph = {}) {
  return new Map(resolveSceneLayers(sceneGraph).map((layer, index) => [layer.id, index]));
}

function getGearNodeStyle(scene, node) {
  if (node.role === "driver") {
    return scene.driverGear;
  }

  if (node.rigidWith) {
    return {
      ...scene.gear,
      stroke: "#f59e0b",
      fill: "#fef3c7",
    };
  }

  return scene.gear;
}

function isNodeVisible(sceneGraph = {}, node) {
  const layerId = node?.layerId ?? getNodeLayerId(sceneGraph, node?.id ?? node);
  const layer = getSceneLayer(sceneGraph, layerId);
  return layer ? layer.visible !== false : true;
}

function isNodeSelectable(sceneGraph = {}, node) {
  if (!isNodeVisible(sceneGraph, node)) {
    return false;
  }

  const layerId = node?.layerId ?? getNodeLayerId(sceneGraph, node?.id ?? node);
  const layer = getSceneLayer(sceneGraph, layerId);
  return layer ? layer.locked !== true : true;
}

function getGearToothPhaseOffset(node, geometry) {
  return node.role === "driver" ? Math.PI / geometry.toothCount : 0;
}

function resolveGraphRootGearId(params = {}, state = {}) {
  if (typeof state?.rootGearId === "string") {
    return state.rootGearId;
  }
  return resolveSceneRootGearId(params.scene_graph ?? {}) ?? "motor-1";
}

function resolveDrivenGearId(params = {}, state = {}, rootGearId = "motor-1") {
  if (typeof state?.drivenGearId === "string") {
    return state.drivenGearId;
  }
  return resolvePrimaryDrivenGearId(params.scene_graph ?? {}, rootGearId) ?? rootGearId;
}

function resolveGroundAnchorWorld(params = {}, inputGearNode = null, groundNodeId = null) {
  const explicitGround = getSceneNode(params.scene_graph ?? {}, groundNodeId)?.center;
  if (explicitGround && Number.isFinite(explicitGround.x) && Number.isFinite(explicitGround.y)) {
    return { x: explicitGround.x, y: explicitGround.y };
  }

  const groundGroup = resolveLinkageGroups(params.scene_graph ?? {}).find((group) => group.groundNodeId === groundNodeId) ?? null;
  const sliderAxis = groundGroup?.sliderAxis === "vertical" ? "vertical" : (params?.slider_axis === "vertical" ? "vertical" : "horizontal");
  const sliderOffset = Number.isFinite(Number(groundGroup?.sliderOffset)) ? Number(groundGroup.sliderOffset) : (Number.isFinite(params?.slider_offset) ? params.slider_offset : 0);

  if (sliderAxis === "vertical") {
    return {
      x: sliderOffset,
      y: Number.isFinite(inputGearNode?.center?.y) ? inputGearNode.center.y : 0,
    };
  }

  return {
    x: Number.isFinite(inputGearNode?.center?.x) ? inputGearNode.center.x : 0,
    y: sliderOffset,
  };
}

function resolveRuntimeLinkageGroups(params = {}, state = {}, gearNodes = []) {
  const groups = resolveLinkageGroups(params.scene_graph ?? {});
  const gearLookup = Object.fromEntries(gearNodes.map((node) => [node.id, node]));

  return groups.map((group, index) => {
    const groupState = state?.linkageGroupsById?.[group.id] ?? null;
    const fallbackState = index === 0 ? state : null;
    const inputGearNode = gearLookup[group.inputGearId] ?? null;

    return {
      ...group,
      inputGearNode,
      crankRadius: groupState?.crankRadius ?? group.crankRadius ?? params.crank_radius,
      rodLength: groupState?.rodLength ?? group.rodLength ?? params.rod_length,
      sliderAxis: groupState?.sliderAxis ?? group.sliderAxis ?? params.slider_axis,
      sliderOffset: groupState?.sliderOffset ?? group.sliderOffset ?? params.slider_offset,
      crank: groupState?.crank ?? fallbackState?.crank ?? null,
      slider: groupState?.slider ?? fallbackState?.slider ?? null,
      ground: groupState?.ground ?? resolveGroundAnchorWorld(params, inputGearNode, group.groundNodeId),
      valid: groupState?.valid !== false,
      invalidReason: groupState?.invalidReason ?? null,
    };
  });
}

function computeGearNodes(params, state) {
  const nominalCenterDistance = params.gear_radius + params.driver_radius;
  const registry = params.scene_graph?.nodeRegistry ?? {};
  const rootGearId = resolveGraphRootGearId(params, state);
  const drivenGearId = resolveDrivenGearId(params, state, rootGearId);
  const rootRegistryNode = registry[rootGearId] ?? {};
  const drivenRegistryNode = registry[drivenGearId] ?? {};
  const layerOrder = getLayerOrderMap(params.scene_graph ?? {});
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
      rigidWith: rootRegistryNode?.rigidWith ?? null,
      layerId: getNodeLayerId(params.scene_graph ?? {}, rootGearId),
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
      rigidWith: drivenRegistryNode?.rigidWith ?? null,
      layerId: getNodeLayerId(params.scene_graph ?? {}, drivenGearId),
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
      rigidWith: extraNodeConfig?.rigidWith ?? null,
      layerId: getNodeLayerId(params.scene_graph ?? {}, node?.id),
      drawCenterMarker: false,
      drawMotorHub: false,
    };
    const normalized = normalizeGearNode(node, fallback, index);
    normalized.layerId = normalized.layerId ?? getNodeLayerId(params.scene_graph ?? {}, normalized.id);
    normalized.zIndex = (layerOrder.get(normalized.layerId) ?? 0) * 1000 + index;
    return normalized;
  });
}

function computeSceneAnchorPoints(params = {}, state = {}, gearNodes = []) {
  const anchors = Object.fromEntries(
    gearNodes
      .filter((node) => node && typeof node.id === "string" && Number.isFinite(node.center?.x) && Number.isFinite(node.center?.y))
      .map((node) => [node.id, { x: node.center.x, y: node.center.y }])
  );

  resolveRuntimeLinkageGroups(params, state, gearNodes).forEach((group) => {
    if (group.linkageNodeId && group.inputGearNode) {
      anchors[group.linkageNodeId] = { ...group.inputGearNode.center };
    }
    if (group.sliderNodeId && Number.isFinite(group.slider?.x) && Number.isFinite(group.slider?.y)) {
      anchors[group.sliderNodeId] = { x: group.slider.x, y: group.slider.y };
    }
    if (group.groundNodeId && Number.isFinite(group.ground?.x) && Number.isFinite(group.ground?.y)) {
      anchors[group.groundNodeId] = { x: group.ground.x, y: group.ground.y };
    }
  });

  return anchors;
}

function getSliderDimensionsForAxis(scene, sliderAxis = "horizontal") {
  return sliderAxis === "horizontal"
    ? scene.sliderBlock.horizontal
    : scene.sliderBlock.vertical;
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
  if (!selection) {
    return { title: "No object selected", details: [] };
  }

  const gearNodes = computeGearNodes(params, state);
  const jointNodes = computeJointNodes(params, state, gearNodes);
  const linkageGroups = resolveRuntimeLinkageGroups(params, state, gearNodes);
  const primaryLinkageGroup = linkageGroups[0] ?? null;
  const selectedGearNode = gearNodes.find((node) => node.id === selection);
  if (selectedGearNode) {
    const relation = selectedGearNode.rigidWith ?? selectedGearNode.parentId ?? selectedGearNode.meshPartnerId ?? "None";
    const relationLabel = selectedGearNode.rigidWith
      ? "Rigid with"
      : (selectedGearNode.parentId ? "Parent id" : "Mesh partner id");
    const weldedPeers = gearNodes
      .filter((node) => node.id !== selectedGearNode.id && (node.rigidWith === selectedGearNode.id || selectedGearNode.rigidWith === node.id))
      .map((node) => node.id)
      .join(", ") || "None";
    return {
      title: `Gear (${selectedGearNode.id})`,
      details: [
        ["Layer", selectedGearNode.layerId ?? "None"],
        ["Radius", formatValue(selectedGearNode.radius)],
        ["Module", formatValue(selectedGearNode.module)],
        ["Teeth", formatValue(selectedGearNode.toothCount, 0)],
        ["Current angle", formatValue(selectedGearNode.angle)],
        ["Angular speed (rad/s)", formatValue(selectedGearNode.angularSpeed)],
        ["Center", `(${formatValue(selectedGearNode.center.x)}, ${formatValue(selectedGearNode.center.y)})`],
        [relationLabel, relation],
        ["Rigid stack peers", weldedPeers],
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

  const selectedLinkageGroup = linkageGroups.find((group) => selection === group.linkageNodeId)
    ?? ((selection === "linkage" || selection === "linkage-1") ? primaryLinkageGroup : null);
  if (selectedLinkageGroup) {
    const crank = selectedLinkageGroup.crank ?? { x: Number.NaN, y: Number.NaN };
    const slider = selectedLinkageGroup.slider ?? { x: Number.NaN, y: Number.NaN };
    const currentCrankArmLength = selectedLinkageGroup.inputGearNode
      ? Math.hypot(crank.x - selectedLinkageGroup.inputGearNode.center.x, crank.y - selectedLinkageGroup.inputGearNode.center.y)
      : Number.NaN;
    const currentRodLength = Math.hypot(slider.x - crank.x, slider.y - crank.y);
    return {
      title: `Linkage (${selectedLinkageGroup.id})`,
      details: [
        ["Layer", selectedLinkageGroup.layerId ?? "None"],
        ["Crank radius", formatValue(selectedLinkageGroup.crankRadius)],
        ["Crank arm length (actual)", formatValue(currentCrankArmLength)],
        ["Rod length", formatValue(selectedLinkageGroup.rodLength)],
        ["Rod length (actual)", formatValue(currentRodLength)],
        ["Crank pin", `(${formatValue(crank.x)}, ${formatValue(crank.y)})`],
        ["Slider joint", `(${formatValue(slider.x)}, ${formatValue(slider.y)})`],
      ],
    };
  }

  const selectedGroundGroup = linkageGroups.find((group) => selection === group.groundNodeId)
    ?? ((selection === "ground" || selection === "ground-1") ? primaryLinkageGroup : null);
  if (selectedGroundGroup) {
    return {
      title: `Ground (${selectedGroundGroup.groundNodeId ?? selectedGroundGroup.id})`,
      details: [
        ["Layer", selectedGroundGroup.layerId ?? "None"],
        ["Slider axis", selectedGroundGroup.sliderAxis],
        ["Rail offset", formatValue(selectedGroundGroup.sliderOffset)],
        ["Ground origin", `(${formatValue(selectedGroundGroup.ground?.x)}, ${formatValue(selectedGroundGroup.ground?.y)})`],
      ],
    };
  }

  const selectedSliderGroup = linkageGroups.find((group) => selection === group.sliderNodeId)
    ?? ((selection === "slider" || selection === "slider-1") ? primaryLinkageGroup : null);
  if (selectedSliderGroup) {
    return {
      title: `Slider (${selectedSliderGroup.sliderNodeId ?? selectedSliderGroup.id})`,
      details: [
        ["Layer", selectedSliderGroup.layerId ?? "None"],
        ["Axis", selectedSliderGroup.sliderAxis],
        ["Offset", formatValue(selectedSliderGroup.sliderOffset)],
        ["Position", `(${formatValue(selectedSliderGroup.slider?.x)}, ${formatValue(selectedSliderGroup.slider?.y)})`],
      ],
    };
  }

  const selectedJointNode = jointNodes.find((node) => node.id === selection);
  if (selectedJointNode) {
    return {
      title: `Joint (${selectedJointNode.id})`,
      details: [
        ["Layer", getNodeLayerId(params.scene_graph ?? {}, selectedJointNode.id)],
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
  const t = createTransform(canvas, params, camera);
  const layerOrder = getLayerOrderMap(params.scene_graph ?? {});
  const gearNodes = computeGearNodes(params, state)
    .filter((node) => isNodeVisible(params.scene_graph ?? {}, node))
    .sort((a, b) => a.zIndex - b.zIndex || (layerOrder.get(a.layerId) ?? 0) - (layerOrder.get(b.layerId) ?? 0));
  const jointNodes = computeJointNodes(params, state, gearNodes);
  const linkageGroups = resolveRuntimeLinkageGroups(params, state, gearNodes);
  const isLightTheme = options.theme === "light";
  const gridPalette = isLightTheme ? scene.grid?.light : scene.grid?.dark;
  const hasGround = linkageGroups.some((group) => typeof group.groundNodeId === "string");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid(ctx, canvas, t, { grid: gridPalette });

  if (hasGround) {
    ctx.strokeStyle = scene.rail.stroke;
    ctx.lineWidth = scene.rail.lineWidth;
    linkageGroups.forEach((group) => {
      if (!group.groundNodeId) {
        return;
      }

      if (group.sliderAxis === "horizontal") {
        const railY = t.toCanvas({ x: 0, y: group.sliderOffset }).y;
        ctx.beginPath();
        ctx.moveTo(scene.rail.margin, railY);
        ctx.lineTo(canvas.width - scene.rail.margin, railY);
        ctx.stroke();
        return;
      }

      const railX = t.toCanvas({ x: group.sliderOffset, y: 0 }).x;
      ctx.beginPath();
      ctx.moveTo(railX, scene.rail.margin);
      ctx.lineTo(railX, canvas.height - scene.rail.margin);
      ctx.stroke();
    });
  }

  const selectedRigidPeers = new Set(
    gearNodes
      .filter((node) => node.id === selectedObject || node.rigidWith === selectedObject)
      .flatMap((node) => [node.id, node.rigidWith].filter(Boolean)),
  );
  const renderedGears = gearNodes.map((node) => ({ node, ...drawGearNode(ctx, t, params, { ...scene, gear: getGearNodeStyle(scene, node), driverGear: getGearNodeStyle(scene, node) }, node) }));
  renderedGears.forEach(({ node, centerCanvas, geometry }) => {
    if (node.showIndicator !== true) {
      return;
    }
    drawGearIndicator(ctx, scene, node, centerCanvas, geometry, params.angular_speed);
  });

  const rootGearId = resolveGraphRootGearId(params, state);
  const sliderCentersById = Object.fromEntries(
    linkageGroups
      .filter((group) => group.sliderNodeId && Number.isFinite(group.slider?.x) && Number.isFinite(group.slider?.y))
      .map((group) => [group.sliderNodeId, group.slider])
  );
  const groundCentersById = Object.fromEntries(
    linkageGroups
      .filter((group) => group.groundNodeId && Number.isFinite(group.ground?.x) && Number.isFinite(group.ground?.y))
      .map((group) => [group.groundNodeId, group.ground])
  );

  linkageGroups.forEach((group) => {
    if (!group.inputGearNode || !Number.isFinite(group.crank?.x) || !Number.isFinite(group.crank?.y)) {
      return;
    }

    const center = t.toCanvas(group.inputGearNode.center);
    const crank = t.toCanvas(group.crank);
    const slider = Number.isFinite(group.slider?.x) && Number.isFinite(group.slider?.y)
      ? t.toCanvas(group.slider)
      : null;

    ctx.strokeStyle = scene.crankArm.stroke;
    ctx.lineWidth = scene.crankArm.lineWidth;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(crank.x, crank.y);
    ctx.stroke();

    if (slider) {
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

    if (slider) {
      const sliderDimensions = getSliderDimensionsForAxis(scene, group.sliderAxis);
      ctx.fillStyle = scene.sliderBlock.fill;
      ctx.fillRect(
        slider.x - sliderDimensions.widthPx / 2,
        slider.y - sliderDimensions.heightPx / 2,
        sliderDimensions.widthPx,
        sliderDimensions.heightPx
      );
    }
  });

  const jointRadiusPx = 6;
  jointNodes.forEach((joint) => {
    const jointCenter = t.toCanvas(joint.center);
    const parentNode = joint.parentId
      ? (gearNodes.find((node) => node.id === joint.parentId) ?? jointNodes.find((node) => node.id === joint.parentId) ?? null)
      : null;
    const parentCenterWorld = parentNode?.center
      ?? sliderCentersById[joint.parentId]
      ?? groundCentersById[joint.parentId]
      ?? null;

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
  } else {
    const selectedLinkageGroup = linkageGroups.find((group) => selectedObject === group.linkageNodeId)
      ?? ((selectedObject === "linkage" || selectedObject === "linkage-1") ? linkageGroups[0] : null);
    const selectedGroundGroup = linkageGroups.find((group) => selectedObject === group.groundNodeId)
      ?? ((selectedObject === "ground" || selectedObject === "ground-1") ? linkageGroups[0] : null);
    const selectedSliderGroup = linkageGroups.find((group) => selectedObject === group.sliderNodeId)
      ?? ((selectedObject === "slider" || selectedObject === "slider-1") ? linkageGroups[0] : null);

    if (selectedLinkageGroup?.inputGearNode && Number.isFinite(selectedLinkageGroup.crank?.x) && Number.isFinite(selectedLinkageGroup.crank?.y)) {
      const center = t.toCanvas(selectedLinkageGroup.inputGearNode.center);
      const crank = t.toCanvas(selectedLinkageGroup.crank);
      const slider = Number.isFinite(selectedLinkageGroup.slider?.x) && Number.isFinite(selectedLinkageGroup.slider?.y)
        ? t.toCanvas(selectedLinkageGroup.slider)
        : null;

      ctx.strokeStyle = selectionStroke;
      ctx.lineWidth = selectionWidth;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(crank.x, crank.y);
      if (slider) {
        ctx.lineTo(slider.x, slider.y);
      }
      ctx.stroke();
    } else if (selectedGroundGroup) {
      ctx.strokeStyle = selectionStroke;
      ctx.lineWidth = selectionWidth;
      ctx.setLineDash([6, 4]);
      if (selectedGroundGroup.sliderAxis === "horizontal") {
        const railY = t.toCanvas({ x: 0, y: selectedGroundGroup.sliderOffset }).y;
        ctx.beginPath();
        ctx.moveTo(scene.rail.margin, railY);
        ctx.lineTo(canvas.width - scene.rail.margin, railY);
        ctx.stroke();
      } else {
        const railX = t.toCanvas({ x: selectedGroundGroup.sliderOffset, y: 0 }).x;
        ctx.beginPath();
        ctx.moveTo(railX, scene.rail.margin);
        ctx.lineTo(railX, canvas.height - scene.rail.margin);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (selectedSliderGroup && Number.isFinite(selectedSliderGroup.slider?.x) && Number.isFinite(selectedSliderGroup.slider?.y)) {
      const slider = t.toCanvas(selectedSliderGroup.slider);
      const sliderDimensions = getSliderDimensionsForAxis(scene, selectedSliderGroup.sliderAxis);
      ctx.strokeStyle = selectionStroke;
      ctx.lineWidth = selectionWidth;
      ctx.strokeRect(
        slider.x - sliderDimensions.widthPx / 2 - 2,
        slider.y - sliderDimensions.heightPx / 2 - 2,
        sliderDimensions.widthPx + 4,
        sliderDimensions.heightPx + 4
      );
    }
  }

  renderedGears.forEach(({ node, centerCanvas, geometry }) => {
    if (!selectedRigidPeers.has(node.id) || selectedRigidPeers.size <= 1) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerCanvas.x, centerCanvas.y, geometry.tipRadiusPx + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  const railTolerance = 8;
  const linkageTolerance = 8;
  const hitRegions = [
    ...linkageGroups
      .filter((group) => group.sliderNodeId && Number.isFinite(group.slider?.x) && Number.isFinite(group.slider?.y))
      .map((group) => {
        const slider = t.toCanvas(group.slider);
        const sliderDimensions = getSliderDimensionsForAxis(scene, group.sliderAxis);
        return {
          id: group.sliderNodeId,
          contains(point) {
            return (
              point.x >= slider.x - sliderDimensions.widthPx / 2 &&
              point.x <= slider.x + sliderDimensions.widthPx / 2 &&
              point.y >= slider.y - sliderDimensions.heightPx / 2 &&
              point.y <= slider.y + sliderDimensions.heightPx / 2
            );
          },
        };
      }),
    ...renderedGears.map((entry) => ({
      id: entry.node.id,
      contains(point) {
        return Math.hypot(point.x - entry.centerCanvas.x, point.y - entry.centerCanvas.y) <= entry.geometry.tipRadiusPx + 4;
      },
    })).filter((region) => isNodeSelectable(params.scene_graph ?? {}, { id: region.id })),
    ...jointNodes.map((joint) => ({
      id: joint.id,
      contains(point) {
        const centerCanvas = t.toCanvas(joint.center);
        return Math.hypot(point.x - centerCanvas.x, point.y - centerCanvas.y) <= jointRadiusPx + 4;
      },
    })).filter((region) => isNodeSelectable(params.scene_graph ?? {}, { id: region.id })),
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
    ...linkageGroups
      .filter((group) => group.linkageNodeId && group.inputGearNode && Number.isFinite(group.crank?.x) && Number.isFinite(group.crank?.y))
      .map((group) => {
        const center = t.toCanvas(group.inputGearNode.center);
        const crank = t.toCanvas(group.crank);
        const slider = Number.isFinite(group.slider?.x) && Number.isFinite(group.slider?.y)
          ? t.toCanvas(group.slider)
          : null;
        return {
          id: group.linkageNodeId,
          contains(point) {
            const closeToCrankArm = distanceToSegment(point, center, crank) <= linkageTolerance;
            const closeToRod = slider ? distanceToSegment(point, crank, slider) <= linkageTolerance : false;
            const closeToPin = Math.hypot(point.x - crank.x, point.y - crank.y) <= scene.crankPin.radiusPx + 4;
            return closeToCrankArm || closeToRod || closeToPin;
          },
        };
      }),
    ...linkageGroups
      .filter((group) => group.groundNodeId)
      .map((group) => ({
        id: group.groundNodeId,
        contains(point) {
          if (group.sliderAxis === "horizontal") {
            const railY = t.toCanvas({ x: 0, y: group.sliderOffset }).y;
            return (
              Math.abs(point.y - railY) <= railTolerance &&
              point.x >= scene.rail.margin &&
              point.x <= canvas.width - scene.rail.margin
            );
          }

          const railX = t.toCanvas({ x: group.sliderOffset, y: 0 }).x;
          return (
            Math.abs(point.x - railX) <= railTolerance &&
            point.y >= scene.rail.margin &&
            point.y <= canvas.height - scene.rail.margin
          );
        },
      })),
  ];

  return hitRegions;
}

function isoProject(point, layerDepth = 0) {
  return {
    x: point.x - point.y,
    y: (point.x + point.y) * 0.55 - layerDepth,
  };
}

function drawIsoDisc(ctx, x, y, radius, height, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.25;

  const discHalfWidth = Math.max(3, radius * 0.36);
  const discHalfHeight = Math.max(6, radius * 0.92);
  const thickness = Math.max(3, height * 0.38);
  const leftX = x - thickness / 2;
  const rightX = x + thickness / 2;

  ctx.beginPath();
  ctx.moveTo(leftX, y - discHalfHeight);
  ctx.lineTo(rightX, y - discHalfHeight);
  ctx.ellipse(rightX, y, discHalfWidth, discHalfHeight, 0, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(leftX, y + discHalfHeight);
  ctx.ellipse(leftX, y, discHalfWidth, discHalfHeight, 0, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(leftX, y, discHalfWidth, discHalfHeight, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(rightX, y, discHalfWidth, discHalfHeight, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawIsoBox(ctx, x, y, width, depth, height, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;

  const top = [
    { x, y: y - height },
    { x: x + width, y: y - height - depth * 0.5 },
    { x: x + width + depth, y: y - height },
    { x: x + depth, y: y - height + depth * 0.5 },
  ];
  const front = [
    top[0],
    top[3],
    { x: top[3].x, y: y + depth * 0.5 },
    { x: x, y },
  ];

  [top, front].forEach((face) => {
    ctx.beginPath();
    face.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

export function drawIsometricScene(ctx, canvas, params, state, selectedObject = null, options = {}) {
  const sceneGraph = params.scene_graph ?? {};
  const layers = resolveSceneLayers(sceneGraph);
  const layerIndex = new Map(layers.map((layer, index) => [layer.id, index]));
  const gearNodes = computeGearNodes(params, state);
  const jointNodes = computeJointNodes(params, state, gearNodes);
  const linkageGroups = resolveRuntimeLinkageGroups(params, state, gearNodes);
  const sliderCentersById = Object.fromEntries(linkageGroups.filter((group) => group.sliderNodeId && group.slider).map((group) => [group.sliderNodeId, group.slider]));
  const groundCentersById = Object.fromEntries(linkageGroups.filter((group) => group.groundNodeId && group.ground).map((group) => [group.groundNodeId, group.ground]));
  const linkageCentersById = Object.fromEntries(linkageGroups.filter((group) => group.linkageNodeId && group.inputGearNode).map((group) => [group.linkageNodeId, group.inputGearNode.center]));
  const nodes = [
    ...gearNodes.map((node) => ({ ...node, kind: "gear", center: node.center })),
    ...Object.keys(linkageCentersById).map((id) => ({ id, kind: "linkage-anchor", center: linkageCentersById[id], layerId: getNodeLayerId(sceneGraph, id) })),
    ...Object.keys(sliderCentersById).map((id) => ({ id, kind: "slider", center: sliderCentersById[id], layerId: getNodeLayerId(sceneGraph, id) })),
    ...Object.keys(groundCentersById).map((id) => ({ id, kind: "ground-anchor", center: groundCentersById[id], layerId: getNodeLayerId(sceneGraph, id) })),
    ...jointNodes.map((node) => ({ id: node.id, kind: "joint-anchor", center: node.center, layerId: getNodeLayerId(sceneGraph, node.id) })),
  ].filter((node) => isNodeVisible(sceneGraph, node));

  const projected = nodes.map((node) => {
    const layerDepth = (layerIndex.get(node.layerId ?? getNodeLayerId(sceneGraph, node.id)) ?? 0) * 22;
    const point = isoProject(node.center ?? { x: 0, y: 0 }, layerDepth);
    return { ...node, projected: point, layerDepth };
  });

  const framingNodes = projected.filter((node) => node.kind === "gear");
  const boundsSource = framingNodes.length > 0 ? framingNodes : projected;
  const bounds = boundsSource.reduce((acc, node) => {
    acc.minX = Math.min(acc.minX, node.projected.x);
    acc.maxX = Math.max(acc.maxX, node.projected.x);
    acc.minY = Math.min(acc.minY, node.projected.y);
    acc.maxY = Math.max(acc.maxY, node.projected.y);
    return acc;
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const width = Number.isFinite(bounds.maxX - bounds.minX) ? Math.max(1, bounds.maxX - bounds.minX) : 1;
  const height = Number.isFinite(bounds.maxY - bounds.minY) ? Math.max(1, bounds.maxY - bounds.minY) : 1;
  const scale = Math.min((canvas.width - 60) / width, (canvas.height - 50) / height, 28);
  const offsetX = canvas.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const offsetY = canvas.height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale + 18;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = options.theme === "light" ? "#f8fafc" : "#0f172a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sorted = projected.sort((a, b) => (a.projected.y - b.projected.y) || (layerIndex.get(a.layerId) ?? 0) - (layerIndex.get(b.layerId) ?? 0));
  sorted.forEach((node) => {
    const x = node.projected.x * scale + offsetX;
    const y = node.projected.y * scale + offsetY;
    const isSelected = selectedObject && (selectedObject === node.id || selectedObject === node.rigidWith);
    const stroke = isSelected ? "#f59e0b" : "#1f2937";

    if (node.kind === "gear") {
      drawIsoDisc(ctx, x, y, Math.max(7, node.radius * scale * 0.52), 7, node.rigidWith ? "#fde68a" : (node.role === "driver" ? "#99f6e4" : "#bfdbfe"), stroke);
      return;
    }

    if (node.kind === "slider") {
      drawIsoBox(ctx, x - 10, y, 18, 10, 12, "#86efac", stroke);
      return;
    }

    if (node.kind === "ground-anchor") {
      drawIsoBox(ctx, x - 12, y, 24, 12, 7, "#cbd5e1", stroke);
      return;
    }

    if (node.kind === "linkage-anchor") {
      drawIsoDisc(ctx, x, y, 7, 8, "#fca5a5", stroke);
      return;
    }

    drawIsoBox(ctx, x - 6, y, 12, 8, 10, "#67e8f9", stroke);
  });
}

if (typeof globalThis !== "undefined" && shouldExposeDebugGlobals()) {
  globalThis.LinkAndGearsRenderer = { drawScene, drawIsometricScene, createTransform, objectDetails };
}
