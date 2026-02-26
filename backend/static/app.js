(function attachComputeState(globalScope) {
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
      previous_slider = null,
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

      const chosenX = chooseNearest(
        candidateA,
        candidateB,
        previous_slider && Number.isFinite(previous_slider.x)
          ? previous_slider.x
          : candidateA
      );

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

      const chosenY = chooseNearest(
        candidateA,
        candidateB,
        previous_slider && Number.isFinite(previous_slider.y)
          ? previous_slider.y
          : candidateA
      );

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

  function chooseNearest(a, b, target) {
    const distanceA = Math.abs(a - target);
    const distanceB = Math.abs(b - target);

    if (distanceA === distanceB) {
      return a >= b ? a : b;
    }

    return distanceA < distanceB ? a : b;
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

  function drawScene(ctx, canvas, params, state) {
    const t = createTransform(canvas, params, state);
    const center = t.toCanvas({ x: 0, y: 0 });
    const crank = t.toCanvas(state.crank);
    const slider = t.toCanvas(state.slider);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1) guide rail
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 3;
    if (params.slider_axis === "horizontal") {
      const railY = t.toCanvas({ x: 0, y: params.slider_offset }).y;
      ctx.beginPath();
      ctx.moveTo(20, railY);
      ctx.lineTo(canvas.width - 20, railY);
      ctx.stroke();
    } else {
      const railX = t.toCanvas({ x: params.slider_offset, y: 0 }).x;
      ctx.beginPath();
      ctx.moveTo(railX, 20);
      ctx.lineTo(railX, canvas.height - 20);
      ctx.stroke();
    }

    // 2) gear and center marker
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(center.x, center.y, t.toCanvasLength(params.gear_radius), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // rim arrow for rotation direction
    const arrowAngle = state.gear_angle;
    const arrowRadius = t.toCanvasLength(params.gear_radius);
    const arrowTail = {
      x: center.x + Math.cos(arrowAngle) * arrowRadius,
      y: center.y - Math.sin(arrowAngle) * arrowRadius,
    };
    const direction = params.angular_speed >= 0 ? -1 : 1;
    const tangent = {
      x: -Math.sin(arrowAngle) * direction,
      y: -Math.cos(arrowAngle) * direction,
    };
    const arrowTip = {
      x: arrowTail.x + tangent.x * 18,
      y: arrowTail.y + tangent.y * 18,
    };

    ctx.strokeStyle = "#0ea5e9";
    ctx.fillStyle = "#0ea5e9";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(arrowTail.x, arrowTail.y);
    ctx.lineTo(arrowTip.x, arrowTip.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(arrowTip.x, arrowTip.y);
    ctx.lineTo(arrowTip.x - tangent.y * 5 - tangent.x * 5, arrowTip.y + tangent.x * 5 - tangent.y * 5);
    ctx.lineTo(arrowTip.x + tangent.y * 5 - tangent.x * 5, arrowTip.y - tangent.x * 5 - tangent.y * 5);
    ctx.closePath();
    ctx.fill();

    // 3) connecting rod
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(crank.x, crank.y);
    ctx.lineTo(slider.x, slider.y);
    ctx.stroke();

    // 4) crank pin
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    ctx.arc(crank.x, crank.y, 6, 0, Math.PI * 2);
    ctx.fill();

    // 5) slider block
    ctx.fillStyle = "#16a34a";
    const sliderWidth = params.slider_axis === "horizontal" ? 28 : 22;
    const sliderHeight = params.slider_axis === "horizontal" ? 22 : 28;
    ctx.fillRect(
      slider.x - sliderWidth / 2,
      slider.y - sliderHeight / 2,
      sliderWidth,
      sliderHeight
    );
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
      gear_radius: document.getElementById("gear-radius"),
      crank_radius: document.getElementById("crank-radius"),
      rod_length: document.getElementById("rod-length"),
      angular_speed: document.getElementById("angular-speed"),
      slider_offset: document.getElementById("slider-offset"),
      slider_axis: document.getElementById("slider-axis"),
    };

    let previousSlider = null;
    let lastTick = performance.now();
    let elapsed = 0;

    function currentParams() {
      return {
        initial_angle: 0,
        crank_angle_offset: 0,
        gear_radius: Number(controls.gear_radius?.value ?? 1.6),
        crank_radius: Number(controls.crank_radius?.value ?? 1.2),
        rod_length: Number(controls.rod_length?.value ?? 3.2),
        angular_speed: Number(controls.angular_speed?.value ?? 1.8),
        slider_offset: Number(controls.slider_offset?.value ?? 0),
        slider_axis: controls.slider_axis?.value === "vertical" ? "vertical" : "horizontal",
        previous_slider: previousSlider,
      };
    }

    function render(now) {
      const deltaS = (now - lastTick) / 1000;
      lastTick = now;
      elapsed += Math.max(0, Math.min(deltaS, 0.05));

      const params = currentParams();
      const state = computeState(params, elapsed);
      previousSlider = state.slider;

      drawScene(ctx, canvas, params, state);

      status.textContent = state.valid
        ? `Running (${params.slider_axis})`
        : `Invalid geometry: ${state.invalidReason}`;

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { computeState };
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
