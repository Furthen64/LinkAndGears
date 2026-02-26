import { bootstrap } from "./controller.js";

export const CANONICAL_PARAM_SCHEMA = {
  gear: ["module", "z1", "z2"],
  linkage: ["gear_radius", "driver_radius", "crank_radius", "rod_length", "slider_offset", "slider_axis"],
  motion: ["motor_rpm", "angular_speed"],
};

if (typeof globalThis !== "undefined") {
  globalThis.LinkAndGearsApp = {
    CANONICAL_PARAM_SCHEMA,
  };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
}
