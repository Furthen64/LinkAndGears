import { computeState } from "./kinematics.js";
import { drawScene, objectDetails } from "./renderer.js";

export const DEFAULT_SCENE_TEMPLATE = {
  rail: {
    stroke: "#7c3aed",
    lineWidth: 3,
    margin: 20,
  },
  gear: {
    stroke: "#2563eb",
    fill: "#dbeafe",
    lineWidth: 4,
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
    lineWidth: 4,
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
  const simulation = {
    isPlaying: true,
    timeSeconds: 0,
    lastTimestamp: null,
    scene: DEFAULT_SCENE_TEMPLATE,
    selectedObject: "gear",
    hitRegions: [],
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
  };

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
      simulation.params = normalization.params;
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

    const data = objectDetails(simulation.selectedObject, simulation.params, state);
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
  }

  function renderScene() {
    const state = computeState(simulation.params, simulation.timeSeconds);

    simulation.hitRegions = drawScene(
      ctx,
      canvas,
      simulation.params,
      state,
      simulation.scene,
      simulation.selectedObject,
      { theme: getTheme() }
    );

    updateSelectionPanel(state);

    if (simulation.normalizationError) {
      status.textContent = `Invalid parameters: ${simulation.normalizationError}`;
      return;
    }

    const invalidPrefix = state.invalidCategory === "constraint" ? "Invalid parameters" : "Invalid geometry";
    const invalidField = resolveFieldNameFromReason(state.invalidReason, simulation.scene.inputConstraints);
    const invalidDetail = invalidField ? `[${invalidField}] ${state.invalidReason}` : state.invalidReason;

    status.textContent = state.valid
      ? `${simulation.isPlaying ? "Running" : "Paused"} (${simulation.params.slider_axis}) t=${simulation.timeSeconds.toFixed(2)}s`
      : `${invalidPrefix}: ${invalidDetail}`;
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

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };

    const matched = simulation.hitRegions.find((region) => region.contains(point));
    simulation.selectedObject = matched ? matched.name : null;
    renderScene();
  });

  applyTheme(controls.theme_mode?.value);
  applyInputConstraints(simulation.scene.inputConstraints);
  syncParamsFromControls();
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
