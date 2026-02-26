export const MIN_PRACTICAL_TOOTH_COUNT = 6;
export const MODULE_MATCH_TOLERANCE = 1e-9;
export const CENTER_DISTANCE_TOLERANCE = 1e-6;

export function validateGearParams(params) {
  const driverModuleInput = params.raw_driver_module;
  const sharedModuleInput = params.raw_shared_module;
  const driverTeethInput = params.raw_driver_teeth;
  const drivenTeethInput = params.raw_driven_teeth;

  if (Number.isFinite(driverModuleInput) && driverModuleInput <= 0) {
    return {
      valid: false,
      reason: "Driver module must be > 0",
    };
  }

  if (Number.isFinite(sharedModuleInput) && sharedModuleInput <= 0) {
    return {
      valid: false,
      reason: "Shared module must be > 0",
    };
  }

  if (
    Number.isFinite(driverModuleInput) &&
    Number.isFinite(sharedModuleInput) &&
    Math.abs(driverModuleInput - sharedModuleInput) > MODULE_MATCH_TOLERANCE
  ) {
    return {
      valid: false,
      reason: "Meshing gears must use the same module",
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
  } = params;

  const gearValidation = validateGearParams(params);
  if (!gearValidation.valid) {
    return {
      valid: false,
      invalidCategory: "constraint",
      invalidReason: gearValidation.reason,
      gear_angle: Number.NaN,
      driver_angle: Number.NaN,
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
      crank: { x: Number.NaN, y: Number.NaN },
      slider: { x: Number.NaN, y: Number.NaN },
    };
  }

  const driverTheta = initial_angle + angular_speed * t;
  const drivenTheta = -(driverTheta * driver_radius) / params.gear_radius;
  const theta = drivenTheta + crank_angle_offset;

  const crank = {
    x: crank_radius * Math.cos(theta),
    y: crank_radius * Math.sin(theta),
  };

  const baseState = {
    valid: true,
    gear_angle: drivenTheta,
    driver_angle: driverTheta,
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
    validateGearParams,
    MIN_PRACTICAL_TOOTH_COUNT,
    MODULE_MATCH_TOLERANCE,
    CENTER_DISTANCE_TOLERANCE,
  };
}
