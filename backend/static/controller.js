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

function getControls() {
  return {
    play_pause: document.getElementById("play-pause"),
    reset_time: document.getElementById("reset-time"),
    driver_module: document.getElementById("driver-module"),
    driver_teeth: document.getElementById("driver-teeth"),
    driven_teeth: document.getElementById("driven-teeth"),
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
  const simulation = {
    isPlaying: true,
    timeSeconds: 0,
    lastTimestamp: null,
    scene: DEFAULT_SCENE_TEMPLATE,
    selectedObject: null,
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
  };

  function applyTheme(theme) {
    const normalizedTheme = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = normalizedTheme;
    if (controls.theme_mode) {
      controls.theme_mode.value = normalizedTheme;
    }
  }

  function syncParamsFromControls() {
    const driverModule = Number(controls.driver_module?.value);
    const sharedModule = Number(controls.module?.value);
    const moduleValue = Number.isFinite(driverModule) && driverModule > 0 ? driverModule : sharedModule;

    const driverTeeth = Number(controls.driver_teeth?.value);
    const z1 = Number(controls.z1?.value);
    const driverToothCount = Number.isFinite(driverTeeth) && driverTeeth > 0 ? driverTeeth : z1;

    const drivenTeeth = Number(controls.driven_teeth?.value);
    const z2 = Number(controls.z2?.value);
    const drivenToothCount = Number.isFinite(drivenTeeth) && drivenTeeth > 0 ? drivenTeeth : z2;

    const usesRealGearParameters =
      Number.isFinite(moduleValue) &&
      moduleValue > 0 &&
      Number.isFinite(driverToothCount) &&
      driverToothCount > 0 &&
      Number.isFinite(drivenToothCount) &&
      drivenToothCount > 0;

    const driverPitchDiameter = usesRealGearParameters ? moduleValue * driverToothCount : Number.NaN;
    const drivenPitchDiameter = usesRealGearParameters ? moduleValue * drivenToothCount : Number.NaN;
    const derivedDriverRadius = driverPitchDiameter / 2;
    const derivedDrivenRadius = drivenPitchDiameter / 2;

    const fallbackGearRadius = Number(controls.gear_radius?.value ?? 1.6);
    const fallbackDriverRadius = Number(controls.driver_radius?.value ?? 0.9);
    const rpmInput = Number(controls.motor_rpm?.value ?? Number.NaN);
    const angularSpeedInput = Number(controls.angular_speed?.value ?? 1.8);
    const hasRpmInput = Number.isFinite(rpmInput);
    const angularSpeedFromRpm = hasRpmInput ? (2 * Math.PI * rpmInput) / 60 : Number.NaN;
    const angularSpeed = hasRpmInput ? angularSpeedFromRpm : angularSpeedInput;

    simulation.params = {
      ...simulation.params,
      raw_driver_module: driverModule,
      raw_shared_module: sharedModule,
      raw_driver_teeth: driverToothCount,
      raw_driven_teeth: drivenToothCount,
      module: usesRealGearParameters ? moduleValue : Number.NaN,
      driver_teeth: usesRealGearParameters ? driverToothCount : Number.NaN,
      driven_teeth: usesRealGearParameters ? drivenToothCount : Number.NaN,
      driver_pitch_diameter: usesRealGearParameters ? driverPitchDiameter : fallbackDriverRadius * 2,
      driven_pitch_diameter: usesRealGearParameters ? drivenPitchDiameter : fallbackGearRadius * 2,
      gear_radius: usesRealGearParameters ? derivedDrivenRadius : fallbackGearRadius,
      driver_radius: usesRealGearParameters ? derivedDriverRadius : fallbackDriverRadius,
      crank_radius: Number(controls.crank_radius?.value ?? 1.2),
      rod_length: Number(controls.rod_length?.value ?? 3.2),
      motor_rpm: hasRpmInput ? rpmInput : Number.NaN,
      angular_speed: angularSpeed,
      slider_offset: Number(controls.slider_offset?.value ?? 0),
      slider_axis: controls.slider_axis?.value === "vertical" ? "vertical" : "horizontal",
    };

    if (controls.angular_speed && Number.isFinite(angularSpeedFromRpm)) {
      controls.angular_speed.value = angularSpeedFromRpm.toFixed(3);
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

    const invalidPrefix = state.invalidCategory === "constraint" ? "Invalid parameters" : "Invalid geometry";

    status.textContent = state.valid
      ? `${simulation.isPlaying ? "Running" : "Paused"} (${simulation.params.slider_axis}) t=${simulation.timeSeconds.toFixed(2)}s`
      : `${invalidPrefix}: ${state.invalidReason}`;
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
    controls.driver_module,
    controls.driver_teeth,
    controls.driven_teeth,
    controls.module,
    controls.z1,
    controls.z2,
    controls.gear_radius,
    controls.crank_radius,
    controls.driver_radius,
    controls.rod_length,
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
  syncParamsFromControls();
  loadSceneTemplate("/static/templates/default-scene.json").then((scene) => {
    simulation.scene = scene;
    renderScene();
  });

  renderScene();
  requestAnimationFrame(renderLoop);
}

if (typeof globalThis !== "undefined") {
  globalThis.LinkAndGearsController = { bootstrap, deepMerge, DEFAULT_SCENE_TEMPLATE };
}
