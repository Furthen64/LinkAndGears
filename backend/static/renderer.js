export function createTransform(canvas, params) {
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

function clampToPositive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getGearGeometry(radiusWorld, params, gearScene, t, toothCountOverride) {
  const pitchRadiusPx = t.toCanvasLength(radiusWorld);
  const moduleWorld = Number.isFinite(params.module) && params.module > 0 ? params.module : Number.NaN;
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

export function objectDetails(selection, params, state) {
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

  if (selection === "motor") {
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

  if (selection === "linkage") {
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

export function drawScene(ctx, canvas, params, state, scene, selectedObject, options = {}) {
  const t = createTransform(canvas, params);
  const center = t.toCanvas({ x: 0, y: 0 });
  const nominalCenterDistance = params.gear_radius + params.driver_radius;
  const driverToothCount = Number.isFinite(params.driver_teeth) ? Math.max(4, Math.round(params.driver_teeth)) : null;
  const drivenToothCount = Number.isFinite(params.driven_teeth) ? Math.max(4, Math.round(params.driven_teeth)) : null;
  const crank = t.toCanvas(state.crank);
  const slider = t.toCanvas(state.slider);
  const isLightTheme = options.theme === "light";

  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  const gearGeometry = getGearGeometry(params.gear_radius, params, scene.gear, t, drivenToothCount);
  const driverGeometry = getGearGeometry(params.driver_radius, params, scene.driverGear, t, driverToothCount);
  const driverCenter = t.toCanvas({ x: -nominalCenterDistance, y: 0 });
  const driverToothPhaseOffset = Math.PI / driverGeometry.toothCount;

  drawGearBody(ctx, driverCenter, state.driver_angle + driverToothPhaseOffset, driverGeometry, scene.driverGear);

  ctx.fillStyle = scene.driverGear.motorHubFill;
  ctx.beginPath();
  ctx.arc(driverCenter.x, driverCenter.y, scene.driverGear.motorHubRadiusPx, 0, Math.PI * 2);
  ctx.fill();

  drawGearBody(ctx, center, state.gear_angle, gearGeometry, scene.gear);

  ctx.fillStyle = scene.centerMarker.fill;
  ctx.beginPath();
  ctx.arc(center.x, center.y, scene.centerMarker.radiusPx, 0, Math.PI * 2);
  ctx.fill();

  const arrowAngle = state.gear_angle;
  const arrowRadius = gearGeometry.pitchRadiusPx;
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

  ctx.strokeStyle = scene.crankArm.stroke;
  ctx.lineWidth = scene.crankArm.lineWidth;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(crank.x, crank.y);
  ctx.stroke();

  ctx.strokeStyle = scene.connectingRod.stroke;
  ctx.lineWidth = scene.connectingRod.lineWidth;
  ctx.beginPath();
  ctx.moveTo(crank.x, crank.y);
  ctx.lineTo(slider.x, slider.y);
  ctx.stroke();

  ctx.fillStyle = scene.crankPin.fill;
  ctx.beginPath();
  ctx.arc(crank.x, crank.y, scene.crankPin.radiusPx, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = scene.sliderBlock.fill;
  const sliderDimensions =
    params.slider_axis === "horizontal" ? scene.sliderBlock.horizontal : scene.sliderBlock.vertical;
  ctx.fillRect(
    slider.x - sliderDimensions.widthPx / 2,
    slider.y - sliderDimensions.heightPx / 2,
    sliderDimensions.widthPx,
    sliderDimensions.heightPx
  );

  const selectionStroke = isLightTheme ? "#111827" : "#f8fafc";
  const selectionWidth = 2;
  if (selectedObject === "motor") {
    ctx.strokeStyle = selectionStroke;
    ctx.lineWidth = selectionWidth;
    ctx.beginPath();
    ctx.arc(driverCenter.x, driverCenter.y, driverGeometry.tipRadiusPx + 4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (selectedObject === "gear") {
    ctx.strokeStyle = selectionStroke;
    ctx.lineWidth = selectionWidth;
    ctx.beginPath();
    ctx.arc(center.x, center.y, gearGeometry.tipRadiusPx + 4, 0, Math.PI * 2);
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

  return [
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
          driverGeometry.tipRadiusPx + 4
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
        return Math.hypot(point.x - center.x, point.y - center.y) <= gearGeometry.tipRadiusPx + 4;
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
}

if (typeof globalThis !== "undefined") {
  globalThis.LinkAndGearsRenderer = { drawScene, createTransform, objectDetails };
}
