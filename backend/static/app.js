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
      // (x - x_c)^2 + (slider_offset - y_c)^2 = rod_length^2
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
      // (slider_offset - x_c)^2 + (y - y_c)^2 = rod_length^2
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

    // Deterministic tie-break to keep branch selection stable.
    if (distanceA === distanceB) {
      return a >= b ? a : b;
    }

    return distanceA < distanceB ? a : b;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { computeState };
  }

  globalScope.computeState = computeState;
})(typeof window !== "undefined" ? window : globalThis);
