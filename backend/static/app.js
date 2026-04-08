import { bootstrap } from "./controller.js";
import { shouldExposeDebugGlobals } from "./debug-flags.js";

export const CANONICAL_PARAM_SCHEMA = {
  gear: ["teeth", "radiusMode", "radius", "meshWith", "showIndicator"],
  motor: ["teeth", "radiusMode", "radius", "meshWith", "showIndicator", "inputRpm", "inputAngularSpeed"],
  scene: ["shared-module", "crank_radius", "rod_length", "slider_offset", "slider_axis", "theme-mode"],
};

if (typeof globalThis !== "undefined" && shouldExposeDebugGlobals()) {
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
