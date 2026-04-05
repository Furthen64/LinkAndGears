import { bootstrap } from "./controller.js";

export const CANONICAL_PARAM_SCHEMA = {
  gear: ["module", "teeth", "radiusMode", "radius", "meshWith", "showIndicator"],
  motor: ["module", "teeth", "radiusMode", "radius", "meshWith", "showIndicator", "inputRpm", "inputAngularSpeed"],
  scene: ["crank_radius", "rod_length", "slider_offset", "slider_axis", "theme-mode"],
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
