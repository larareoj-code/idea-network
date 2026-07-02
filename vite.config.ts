/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // Node polyfills are needed by pst-extractor (Buffer etc.) in the browser,
  // but must not stub real node builtins when vitest runs in Node.
  plugins: [react(), ...(process.env.VITEST ? [] : [nodePolyfills()])],
  worker: {
    // "es" because the worker graph contains a dynamic import (pst-extractor);
    // polyfills must be re-declared here — config-level plugins don't apply to
    // the worker's separate module graph at build time.
    format: "es",
    plugins: () => (process.env.VITEST ? [] : [nodePolyfills()]),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
