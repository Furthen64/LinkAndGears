export const SIMULATION_MODES = Object.freeze({
  KINEMATIC: "kinematic",
  PHYSICS: "physics",
});

export function normalizeSimulationMode(value) {
  return value === SIMULATION_MODES.PHYSICS
    ? SIMULATION_MODES.PHYSICS
    : SIMULATION_MODES.KINEMATIC;
}

export function simulationModeMessage(mode) {
  return normalizeSimulationMode(mode) === SIMULATION_MODES.PHYSICS
    ? "Physics mode selected; native Box3D backend is not connected, using the deterministic fallback."
    : "Kinematic mode";
}
