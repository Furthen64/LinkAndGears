(function attachComputeState(globalScope) {
  const DEFAULT_SCENE_TEMPLATE = {
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

  function deepMerge(base, override) {
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

  /**
   * Compute deterministic kinematic state for a gear-crank-slider mechanism.
   *
   * @param {Object} params - Mechanism parameters.
   * @param {number} t - Simulation time in seconds.
   * @returns {{
   *   valid: boolean,
   *   invalidReason?: string,
   *   gear_angle: number,
   *   driver_angle: number,
   *   crank: {x:number, y:number},
   *   slider: {x:number, y:number}
   * }}
  */
  function computeState(params, t) {
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

  function createTransform(canvas, params) {
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

    const scale = Math.min(
      (canvas.width - padding * 2) / worldWidth,
      (canvas.height - padding * 2) / worldHeight
    );

    return {
      scale,
      toCanvas(point) {
        return {
          x: (point.x - worldMinX) * scale + padding,
          y: (worldMaxY - point.y) * scale + padding,
        };
      },
      toCanvasLength(length) {
        return length * scale;
      },
    };
  }


  function formatValue(value, digits = 3) {
    return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
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

  function objectDetails(selection, params, state) {
    const currentCrankArmLength = Math.hypot(state.crank.x, state.crank.y);
    const currentRodLength = Math.hypot(
      state.slider.x - state.crank.x,
      state.slider.y - state.crank.y
    );

    if (!selection) {
      return { title: "No object selected", details: [] };
    }

    if (selection === "gear") {
      return {
        title: "Gear",
        details: [
          ["Radius", formatValue(params.gear_radius)],
          ["Driven pitch diameter", formatValue(params.driven_pitch_diameter)],
          ["Module", formatValue(params.module)],
          ["Driven teeth", formatValue(params.driven_teeth, 0)],
          ["Angular speed", formatValue(params.angular_speed)],
          ["Current angle", formatValue(state.gear_angle)],
          ["Center", "(0.000, 0.000)"],
        ],
      };
    }

    if (selection === "motor") {
      return {
        title: "Motor gear",
        details: [
          ["Radius", formatValue(params.driver_radius)],
          ["Driver pitch diameter", formatValue(params.driver_pitch_diameter)],
          ["Module", formatValue(params.module)],
          ["Driver teeth", formatValue(params.driver_teeth, 0)],
          ["Angular speed", formatValue(params.angular_speed)],
          ["Current angle", formatValue(state.driver_angle)],
          ["Center", `(${formatValue(-(params.gear_radius + params.driver_radius))}, 0.000)`],
        ],
      };
    }

    if (selection === "linkage") {
      return {
        title: "Linkage",
        details: [
          ["Crank arm length", formatValue(currentCrankArmLength)],
          ["Crank radius (configured)", formatValue(params.crank_radius)],
          ["Rod length", formatValue(currentRodLength)],
          ["Rod length (configured)", formatValue(params.rod_length)],
          ["Crank pin", `(${formatValue(state.crank.x)}, ${formatValue(state.crank.y)})`],
          ["Slider joint", `(${formatValue(state.slider.x)}, ${formatValue(state.slider.y)})`],
        ],
      };
    }

    if (selection === "ground") {
      return {
        title: "Ground",
        details: [
          ["Slider axis", params.slider_axis],
          ["Rail offset", formatValue(params.slider_offset)],
          ["Ground origin", "(0.000, 0.000)"],
        ],
      };
    }

    return {
      title: "Slider",
      details: [
        ["Axis", params.slider_axis],
        ["Offset", formatValue(params.slider_offset)],
        ["Position", `(${formatValue(state.slider.x)}, ${formatValue(state.slider.y)})`],
      ],
    };
  }

  function drawScene(ctx, canvas, params, state, scene, selectedObject) {
    const t = createTransform(canvas, params);
    const center = t.toCanvas({ x: 0, y: 0 });
    const driverCenterWorld = { x: -(params.gear_radius + params.driver_radius), y: 0 };
    const driverCenter = t.toCanvas(driverCenterWorld);
    const crank = t.toCanvas(state.crank);
    const slider = t.toCanvas(state.slider);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1) guide rail
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

    // 2) driving motor gear
    const driverRadius = t.toCanvasLength(params.driver_radius);
    const driverToothCount = Math.max(
      scene.driverGear.minToothCount,
      Math.round(params.driver_radius * scene.driverGear.teethPerRadiusUnit)
    );
    const driverToothDepth = Math.max(
      scene.driverGear.minToothDepthPx,
      driverRadius * scene.driverGear.toothDepthFactor
    );

    ctx.strokeStyle = scene.driverGear.toothStroke;
    ctx.lineWidth = scene.driverGear.toothLineWidth;
    for (let i = 0; i < driverToothCount; i += 1) {
      const toothAngle = state.driver_angle + (i / driverToothCount) * Math.PI * 2;
      const inner = {
        x: driverCenter.x + Math.cos(toothAngle) * driverRadius,
        y: driverCenter.y - Math.sin(toothAngle) * driverRadius,
      };
      const outer = {
        x: driverCenter.x + Math.cos(toothAngle) * (driverRadius + driverToothDepth),
        y: driverCenter.y - Math.sin(toothAngle) * (driverRadius + driverToothDepth),
      };

      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
    }

    ctx.strokeStyle = scene.driverGear.stroke;
    ctx.lineWidth = scene.driverGear.lineWidth;
    ctx.beginPath();
    ctx.arc(driverCenter.x, driverCenter.y, driverRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = scene.driverGear.fill;
    ctx.beginPath();
    ctx.arc(driverCenter.x, driverCenter.y, Math.max(1, driverRadius - 2), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = scene.driverGear.motorHubFill;
    ctx.beginPath();
    ctx.arc(driverCenter.x, driverCenter.y, scene.driverGear.motorHubRadiusPx, 0, Math.PI * 2);
    ctx.fill();

    // 3) large driven gear body + rotating teeth
    const gearCanvasRadius = t.toCanvasLength(params.gear_radius);
    const toothCount = Math.max(
      scene.gear.minToothCount,
      Math.round(params.gear_radius * scene.gear.teethPerRadiusUnit)
    );
    const toothDepth = Math.max(
      scene.gear.minToothDepthPx,
      gearCanvasRadius * scene.gear.toothDepthFactor
    );

    ctx.strokeStyle = scene.gear.toothStroke;
    ctx.lineWidth = scene.gear.toothLineWidth;
    for (let i = 0; i < toothCount; i += 1) {
      const toothAngle = state.gear_angle + (i / toothCount) * Math.PI * 2;
      const inner = {
        x: center.x + Math.cos(toothAngle) * gearCanvasRadius,
        y: center.y - Math.sin(toothAngle) * gearCanvasRadius,
      };
      const outer = {
        x: center.x + Math.cos(toothAngle) * (gearCanvasRadius + toothDepth),
        y: center.y - Math.sin(toothAngle) * (gearCanvasRadius + toothDepth),
      };

      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
    }

    ctx.strokeStyle = scene.gear.stroke;
    ctx.lineWidth = scene.gear.lineWidth;
    ctx.beginPath();
    ctx.arc(center.x, center.y, gearCanvasRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = scene.gear.fill;
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(1, gearCanvasRadius - 2), 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = scene.gear.stroke;
    ctx.beginPath();
    ctx.arc(center.x, center.y, gearCanvasRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = scene.centerMarker.fill;
    ctx.beginPath();
    ctx.arc(center.x, center.y, scene.centerMarker.radiusPx, 0, Math.PI * 2);
    ctx.fill();

    // rim arrow for rotation direction
    const arrowAngle = state.gear_angle;
    const arrowRadius = t.toCanvasLength(params.gear_radius);
    const arrowTail = {
      x: center.x + Math.cos(arrowAngle) * arrowRadius,
      y: center.y - Math.sin(arrowAngle) * arrowRadius,
    };
    const direction =
      params.angular_speed >= 0
        ? scene.rotationArrow.directionWithPositiveSpeed
        : -scene.rotationArrow.directionWithPositiveSpeed;
    const tangent = {
      x: -Math.sin(arrowAngle) * direction,
      y: -Math.cos(arrowAngle) * direction,
    };
    const arrowTip = {
      x: arrowTail.x + tangent.x * scene.rotationArrow.shaftLengthPx,
      y: arrowTail.y + tangent.y * scene.rotationArrow.shaftLengthPx,
    };

    ctx.strokeStyle = scene.rotationArrow.stroke;
    ctx.fillStyle = scene.rotationArrow.fill;
    ctx.lineWidth = scene.rotationArrow.lineWidth;
    ctx.beginPath();
    ctx.moveTo(arrowTail.x, arrowTail.y);
    ctx.lineTo(arrowTip.x, arrowTip.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(arrowTip.x, arrowTip.y);
    ctx.lineTo(
      arrowTip.x - tangent.y * scene.rotationArrow.headLengthPx - tangent.x * scene.rotationArrow.headLengthPx,
      arrowTip.y + tangent.x * scene.rotationArrow.headLengthPx - tangent.y * scene.rotationArrow.headLengthPx
    );
    ctx.lineTo(
      arrowTip.x + tangent.y * scene.rotationArrow.headLengthPx - tangent.x * scene.rotationArrow.headLengthPx,
      arrowTip.y - tangent.x * scene.rotationArrow.headLengthPx - tangent.y * scene.rotationArrow.headLengthPx
    );
    ctx.closePath();
    ctx.fill();

    // 4) crank arm on the driven gear face (offset pin)
    ctx.strokeStyle = scene.crankArm.stroke;
    ctx.lineWidth = scene.crankArm.lineWidth;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(crank.x, crank.y);
    ctx.stroke();

    // 5) connecting rod
    ctx.strokeStyle = scene.connectingRod.stroke;
    ctx.lineWidth = scene.connectingRod.lineWidth;
    ctx.beginPath();
    ctx.moveTo(crank.x, crank.y);
    ctx.lineTo(slider.x, slider.y);
    ctx.stroke();

    // 6) crank pin
    ctx.fillStyle = scene.crankPin.fill;
    ctx.beginPath();
    ctx.arc(crank.x, crank.y, scene.crankPin.radiusPx, 0, Math.PI * 2);
    ctx.fill();

    // 7) slider block
    ctx.fillStyle = scene.sliderBlock.fill;
    const sliderDimensions =
      params.slider_axis === "horizontal" ? scene.sliderBlock.horizontal : scene.sliderBlock.vertical;
    ctx.fillRect(
      slider.x - sliderDimensions.widthPx / 2,
      slider.y - sliderDimensions.heightPx / 2,
      sliderDimensions.widthPx,
      sliderDimensions.heightPx
    );

    const selectionStroke = document.body?.dataset.theme === "light" ? "#111827" : "#f8fafc";
    const selectionWidth = 2;
    if (selectedObject === "motor") {
      ctx.strokeStyle = selectionStroke;
      ctx.lineWidth = selectionWidth;
      ctx.beginPath();
      ctx.arc(driverCenter.x, driverCenter.y, driverRadius + driverToothDepth + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (selectedObject === "gear") {
      ctx.strokeStyle = selectionStroke;
      ctx.lineWidth = selectionWidth;
      ctx.beginPath();
      ctx.arc(center.x, center.y, gearCanvasRadius + toothDepth + 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (selectedObject === "linkage") {
      ctx.strokeStyle = selectionStroke;
      ctx.lineWidth = selectionWidth;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(crank.x, crank.y);
      ctx.lineTo(slider.x, slider.y);
      ctx.stroke();
    } else if (selectedObject === "ground") {
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
    } else if (selectedObject === "slider") {
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
      {
        name: "slider",
        contains(point) {
          return (
            point.x >= slider.x - sliderDimensions.widthPx / 2 &&
            point.x <= slider.x + sliderDimensions.widthPx / 2 &&
            point.y >= slider.y - sliderDimensions.heightPx / 2 &&
            point.y <= slider.y + sliderDimensions.heightPx / 2
          );
        },
      },
      {
        name: "motor",
        contains(point) {
          return (
            Math.hypot(point.x - driverCenter.x, point.y - driverCenter.y) <=
            driverRadius + driverToothDepth + 4
          );
        },
      },
      {
        name: "linkage",
        contains(point) {
          const closeToCrankArm = distanceToSegment(point, center, crank) <= linkageTolerance;
          const closeToRod = distanceToSegment(point, crank, slider) <= linkageTolerance;
          const closeToPin = Math.hypot(point.x - crank.x, point.y - crank.y) <= scene.crankPin.radiusPx + 4;
          return closeToCrankArm || closeToRod || closeToPin;
        },
      },
      {
        name: "gear",
        contains(point) {
          return Math.hypot(point.x - center.x, point.y - center.y) <= gearCanvasRadius + toothDepth + 4;
        },
      },
      {
        name: "ground",
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
      },
    ];

    return hitRegions;
  }

  function bootstrap() {
    const canvas = document.getElementById("mechanism-canvas");
    const status = document.getElementById("status");
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const controls = {
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
      angular_speed: document.getElementById("angular-speed"),
      slider_offset: document.getElementById("slider-offset"),
      slider_axis: document.getElementById("slider-axis"),
      theme_mode: document.getElementById("theme-mode"),
      selection_name: document.getElementById("selection-name"),
      selection_details: document.getElementById("selection-details"),
    };

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
      const moduleValue = Number.isFinite(driverModule) && driverModule > 0
        ? driverModule
        : sharedModule;

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

      const driverPitchDiameter = usesRealGearParameters
        ? moduleValue * driverToothCount
        : Number.NaN;
      const drivenPitchDiameter = usesRealGearParameters
        ? moduleValue * drivenToothCount
        : Number.NaN;
      const derivedDriverRadius = driverPitchDiameter / 2;
      const derivedDrivenRadius = drivenPitchDiameter / 2;

      const fallbackGearRadius = Number(controls.gear_radius?.value ?? 1.6);
      const fallbackDriverRadius = Number(controls.driver_radius?.value ?? 0.9);

      simulation.params = {
        ...simulation.params,
        module: usesRealGearParameters ? moduleValue : Number.NaN,
        driver_teeth: usesRealGearParameters ? driverToothCount : Number.NaN,
        driven_teeth: usesRealGearParameters ? drivenToothCount : Number.NaN,
        driver_pitch_diameter: usesRealGearParameters ? driverPitchDiameter : fallbackDriverRadius * 2,
        driven_pitch_diameter: usesRealGearParameters ? drivenPitchDiameter : fallbackGearRadius * 2,
        gear_radius: usesRealGearParameters ? derivedDrivenRadius : fallbackGearRadius,
        driver_radius: usesRealGearParameters ? derivedDriverRadius : fallbackDriverRadius,
        crank_radius: Number(controls.crank_radius?.value ?? 1.2),
        rod_length: Number(controls.rod_length?.value ?? 3.2),
        angular_speed: Number(controls.angular_speed?.value ?? 1.8),
        slider_offset: Number(controls.slider_offset?.value ?? 0),
        slider_axis: controls.slider_axis?.value === "vertical" ? "vertical" : "horizontal",
      };
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
        simulation.selectedObject
      );

      updateSelectionPanel(state);

      status.textContent = state.valid
        ? `${simulation.isPlaying ? "Running" : "Paused"} (${simulation.params.slider_axis}) t=${simulation.timeSeconds.toFixed(2)}s`
        : `Invalid geometry: ${state.invalidReason}`;
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

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { computeState, deepMerge, DEFAULT_SCENE_TEMPLATE };
  }

  globalScope.computeState = computeState;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
      bootstrap();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
