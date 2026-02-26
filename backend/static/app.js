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
    } = params;

    const theta = initial_angle + angular_speed * t + crank_angle_offset;

    const crank = {
      x: crank_radius * Math.cos(theta),
      y: crank_radius * Math.sin(theta),
    };

    const baseState = {
      valid: true,
      gear_angle: theta,
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

  function createTransform(canvas, params, state) {
    const safeSliderX = Number.isFinite(state.slider.x) ? state.slider.x : 0;
    const safeSliderY = Number.isFinite(state.slider.y) ? state.slider.y : 0;
    const extent =
      Math.max(
        1,
        params.gear_radius,
        params.crank_radius,
        params.rod_length,
        Math.abs(params.slider_offset),
        Math.abs(safeSliderX),
        Math.abs(safeSliderY)
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
    if (!selection) {
      return { title: "No object selected", details: [] };
    }

    if (selection === "gear") {
      return {
        title: "Gear",
        details: [
          ["Radius", formatValue(params.gear_radius)],
          ["Angular speed", formatValue(params.angular_speed)],
          ["Current angle", formatValue(state.gear_angle)],
          ["Center", "(0.000, 0.000)"],
        ],
      };
    }

    if (selection === "linkage") {
      return {
        title: "Linkage",
        details: [
          ["Crank radius", formatValue(params.crank_radius)],
          ["Rod length", formatValue(params.rod_length)],
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
    const t = createTransform(canvas, params, state);
    const center = t.toCanvas({ x: 0, y: 0 });
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

    // 2) gear body + rotating teeth
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

    // 3) crank arm on the gear face (offset pin)
    ctx.strokeStyle = scene.crankArm.stroke;
    ctx.lineWidth = scene.crankArm.lineWidth;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(crank.x, crank.y);
    ctx.stroke();

    // 4) connecting rod
    ctx.strokeStyle = scene.connectingRod.stroke;
    ctx.lineWidth = scene.connectingRod.lineWidth;
    ctx.beginPath();
    ctx.moveTo(crank.x, crank.y);
    ctx.lineTo(slider.x, slider.y);
    ctx.stroke();

    // 5) crank pin
    ctx.fillStyle = scene.crankPin.fill;
    ctx.beginPath();
    ctx.arc(crank.x, crank.y, scene.crankPin.radiusPx, 0, Math.PI * 2);
    ctx.fill();

    // 6) slider block
    ctx.fillStyle = scene.sliderBlock.fill;
    const sliderDimensions =
      params.slider_axis === "horizontal" ? scene.sliderBlock.horizontal : scene.sliderBlock.vertical;
    ctx.fillRect(
      slider.x - sliderDimensions.widthPx / 2,
      slider.y - sliderDimensions.heightPx / 2,
      sliderDimensions.widthPx,
      sliderDimensions.heightPx
    );

    const selectionStroke = "#111827";
    const selectionWidth = 2;
    if (selectedObject === "gear") {
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
      gear_radius: document.getElementById("gear-radius"),
      crank_radius: document.getElementById("crank-radius"),
      rod_length: document.getElementById("rod-length"),
      angular_speed: document.getElementById("angular-speed"),
      slider_offset: document.getElementById("slider-offset"),
      slider_axis: document.getElementById("slider-axis"),
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
        gear_radius: 1.6,
        crank_radius: 1.2,
        rod_length: 3.2,
        angular_speed: 1.8,
        slider_offset: 0,
        slider_axis: "horizontal",
      },
    };

    function syncParamsFromControls() {
      simulation.params = {
        ...simulation.params,
        gear_radius: Number(controls.gear_radius?.value ?? 1.6),
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
      controls.gear_radius,
      controls.crank_radius,
      controls.rod_length,
      controls.angular_speed,
      controls.slider_offset,
      controls.slider_axis,
    ].forEach(attachLiveUpdates);

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
