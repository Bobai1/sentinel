export function register() {
  // Load the detector only in the Node.js runtime. A static import would pull
  // better-sqlite3 and node:https into the Edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTINEL_DETECTOR !== "0") {
    import("./lib/sentinel/detector")
      .then(({ startDetector }) => startDetector())
      .catch((error) => console.error("[sentinel] detector failed to start", error));
  }
}
