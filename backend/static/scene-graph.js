export function normalizeNodeType(rawType) {
  if (typeof rawType !== "string") {
    return "gear";
  }

  return rawType.toLowerCase() === "joint-anchor" ? "joint-anchor" : rawType.toLowerCase();
}

export function normalizeNodeRole(rawRole, rawType = "gear") {
  if (typeof rawRole === "string" && rawRole.trim().length > 0) {
    return rawRole.trim().toLowerCase();
  }

  const nodeType = normalizeNodeType(rawType);
  switch (nodeType) {
    case "motor":
      return "motor-root";
    case "linkage-anchor":
      return "linkage-anchor";
    case "slider":
      return "slider-carriage";
    case "ground-anchor":
      return "ground-reference";
    case "joint-anchor":
      return "joint-anchor";
    default:
      return "gear";
  }
}

function normalizeSliderAxis(rawAxis, fallback = "horizontal") {
  return rawAxis === "vertical" ? "vertical" : fallback;
}

export function getNodeRegistry(sceneGraph = {}) {
  return sceneGraph?.nodeRegistry && typeof sceneGraph.nodeRegistry === "object"
    ? sceneGraph.nodeRegistry
    : {};
}

export function getSceneNode(sceneGraph = {}, nodeId) {
  if (typeof nodeId !== "string" || nodeId.length === 0) {
    return null;
  }

  return getNodeRegistry(sceneGraph)[nodeId] ?? null;
}

export function buildParentChildEdges(nodeRegistry = {}) {
  return Object.values(nodeRegistry)
    .filter((node) => typeof node?.parentId === "string" && typeof node?.id === "string" && node.id !== node.parentId)
    .map((node) => ({ parentId: node.parentId, childId: node.id }));
}

export function resolveSceneRootNodeId(sceneGraph = {}) {
  const registry = getNodeRegistry(sceneGraph);
  const explicitRootId = typeof sceneGraph?.rootNodeId === "string" ? sceneGraph.rootNodeId : null;
  if (explicitRootId && registry[explicitRootId]) {
    return explicitRootId;
  }

  const motorNode = Object.values(registry).find((node) => {
    const nodeType = normalizeNodeType(node?.type);
    const nodeRole = normalizeNodeRole(node?.role, nodeType);
    return nodeType === "motor" || nodeRole === "motor-root";
  });
  if (motorNode?.id) {
    return motorNode.id;
  }

  return Object.keys(registry)[0] ?? null;
}

export function resolveSceneRootGearId(sceneGraph = {}) {
  const registry = getNodeRegistry(sceneGraph);
  const rootId = resolveSceneRootNodeId(sceneGraph);
  const rootNode = rootId ? registry[rootId] : null;
  if (rootNode && ["motor", "gear"].includes(normalizeNodeType(rootNode.type))) {
    return rootId;
  }

  const gearLikeRoot = Object.values(registry).find((node) => {
    const nodeType = normalizeNodeType(node?.type);
    return nodeType === "motor" || nodeType === "gear";
  });
  return gearLikeRoot?.id ?? rootId;
}

export function resolvePrimaryDrivenGearId(sceneGraph = {}, rootGearId = resolveSceneRootGearId(sceneGraph)) {
  const registry = getNodeRegistry(sceneGraph);
  if (!rootGearId || !registry[rootGearId]) {
    return null;
  }

  const explicitDriven = Object.values(registry).find((node) => {
    if (!node || node.id === rootGearId) {
      return false;
    }

    const nodeType = normalizeNodeType(node.type);
    if (nodeType !== "gear") {
      return false;
    }

    const nodeRole = normalizeNodeRole(node.role, nodeType);
    if (["gear-driven", "driven", "primary-driven"].includes(nodeRole)) {
      return true;
    }

    const attachment = node.meshWith ?? node.parentId ?? node.attachmentTargetId;
    return attachment === rootGearId;
  });

  return explicitDriven?.id ?? rootGearId;
}

function findLinkedNode(registry, parentId, type, role) {
  return Object.values(registry).find((node) => {
    if (!node) {
      return false;
    }

    const nodeType = normalizeNodeType(node.type);
    const nodeRole = normalizeNodeRole(node.role, nodeType);
    const attachment = node.parentId ?? node.attachmentTargetId ?? null;
    return attachment === parentId && (nodeType === type || nodeRole === role);
  }) ?? null;
}

export function sanitizeLinkageGroup(rawGroup = {}, registry = {}, fallbackIndex = 1, defaults = {}) {
  const id = typeof rawGroup?.id === "string" && rawGroup.id.length > 0
    ? rawGroup.id
    : `linkage-group-${fallbackIndex}`;
  const label = typeof rawGroup?.label === "string" && rawGroup.label.length > 0
    ? rawGroup.label
    : `LinkageGroup${fallbackIndex}`;
  const type = typeof rawGroup?.type === "string" && rawGroup.type.length > 0
    ? rawGroup.type
    : "slider-crank";
  const inputGearId = typeof rawGroup?.inputGearId === "string"
    ? rawGroup.inputGearId
    : typeof rawGroup?.drivenGearId === "string"
      ? rawGroup.drivenGearId
      : typeof rawGroup?.driveNodeId === "string"
        ? rawGroup.driveNodeId
        : null;
  const linkageNodeId = typeof rawGroup?.linkageNodeId === "string"
    ? rawGroup.linkageNodeId
    : typeof rawGroup?.anchorNodeId === "string"
      ? rawGroup.anchorNodeId
      : typeof rawGroup?.crankAnchorId === "string"
        ? rawGroup.crankAnchorId
        : null;
  const sliderNodeId = typeof rawGroup?.sliderNodeId === "string"
    ? rawGroup.sliderNodeId
    : typeof rawGroup?.sliderId === "string"
      ? rawGroup.sliderId
      : null;
  const groundNodeId = typeof rawGroup?.groundNodeId === "string"
    ? rawGroup.groundNodeId
    : typeof rawGroup?.groundId === "string"
      ? rawGroup.groundId
      : null;
  const crankRadius = Number.isFinite(Number(rawGroup?.crankRadius ?? rawGroup?.crank_radius))
    ? Number(rawGroup.crankRadius ?? rawGroup.crank_radius)
    : Number.isFinite(Number(defaults?.crankRadius))
      ? Number(defaults.crankRadius)
      : 1.2;
  const rodLength = Number.isFinite(Number(rawGroup?.rodLength ?? rawGroup?.rod_length))
    ? Number(rawGroup.rodLength ?? rawGroup.rod_length)
    : Number.isFinite(Number(defaults?.rodLength))
      ? Number(defaults.rodLength)
      : 3.2;
  const sliderAxis = normalizeSliderAxis(rawGroup?.sliderAxis ?? rawGroup?.slider_axis, normalizeSliderAxis(defaults?.sliderAxis));
  const sliderOffset = Number.isFinite(Number(rawGroup?.sliderOffset ?? rawGroup?.slider_offset))
    ? Number(rawGroup.sliderOffset ?? rawGroup.slider_offset)
    : Number.isFinite(Number(defaults?.sliderOffset))
      ? Number(defaults.sliderOffset)
      : 0;
  const crankAngleOffset = Number.isFinite(Number(rawGroup?.crankAngleOffset ?? rawGroup?.crank_angle_offset))
    ? Number(rawGroup.crankAngleOffset ?? rawGroup.crank_angle_offset)
    : Number.isFinite(Number(defaults?.crankAngleOffset))
      ? Number(defaults.crankAngleOffset)
      : 0;

  return {
    id,
    label,
    type,
    inputGearId: inputGearId && registry[inputGearId] ? inputGearId : inputGearId,
    linkageNodeId: linkageNodeId && registry[linkageNodeId] ? linkageNodeId : linkageNodeId,
    sliderNodeId: sliderNodeId && registry[sliderNodeId] ? sliderNodeId : sliderNodeId,
    groundNodeId: groundNodeId && registry[groundNodeId] ? groundNodeId : groundNodeId,
    crankRadius,
    rodLength,
    sliderAxis,
    sliderOffset,
    crankAngleOffset,
  };
}

function inferLegacyLinkageGroups(sceneGraph = {}) {
  const registry = getNodeRegistry(sceneGraph);
  const rootGearId = resolveSceneRootGearId(sceneGraph);
  const drivenGearId = resolvePrimaryDrivenGearId(sceneGraph, rootGearId);
  if (!drivenGearId) {
    return [];
  }

  const linkageNode = findLinkedNode(registry, drivenGearId, "linkage-anchor", "linkage-anchor")
    ?? registry["linkage-1"]
    ?? null;
  const sliderNode = linkageNode
    ? (findLinkedNode(registry, linkageNode.id, "slider", "slider-carriage") ?? registry["slider-1"] ?? null)
    : (registry["slider-1"] ?? null);
  const groundNode = linkageNode
    ? (findLinkedNode(registry, linkageNode.id, "ground-anchor", "ground-reference") ?? registry["ground-1"] ?? null)
    : (registry["ground-1"] ?? null);

  if (!linkageNode && !sliderNode && !groundNode) {
    return [];
  }

  return [sanitizeLinkageGroup({
    id: "linkage-group-1",
    label: "Primary Linkage",
    type: "slider-crank",
    inputGearId: drivenGearId,
    linkageNodeId: linkageNode?.id ?? null,
    sliderNodeId: sliderNode?.id ?? null,
    groundNodeId: groundNode?.id ?? null,
  }, registry, 1)];
}

export function resolveLinkageGroups(sceneGraph = {}) {
  const registry = getNodeRegistry(sceneGraph);
  const rawGroups = Array.isArray(sceneGraph?.linkageGroups) ? sceneGraph.linkageGroups : [];
  if (rawGroups.length > 0) {
    return rawGroups.map((group, index) => sanitizeLinkageGroup(group, registry, index + 1));
  }

  return inferLegacyLinkageGroups(sceneGraph);
}

export function findFirstNodeByRole(sceneGraph = {}, role) {
  if (typeof role !== "string" || role.length === 0) {
    return null;
  }

  return Object.values(getNodeRegistry(sceneGraph)).find((node) => normalizeNodeRole(node?.role, node?.type) === role) ?? null;
}