function readDebugUrlParam() {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }

  const value = new URLSearchParams(window.location.search).get("debug_globals");
  if (value == null) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function readBuildTimeLikeFlag() {
  if (typeof globalThis === "undefined") {
    return false;
  }

  return globalThis.__LINK_AND_GEARS_DEBUG_GLOBALS__ === true;
}

export function shouldExposeDebugGlobals() {
  return readBuildTimeLikeFlag() || readDebugUrlParam();
}
