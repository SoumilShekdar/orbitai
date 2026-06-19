import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Physics modules import three.js and use the "@/" path alias; run them in a
// plain Node environment (no DOM needed — these are pure math modules).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Live-API tests opt in via RUN_LIVE_TESTS=1 (see tests/live.test.ts).
    testTimeout: 30000,
  },
});
