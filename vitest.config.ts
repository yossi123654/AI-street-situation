import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Tests mock Overpass; keep the shipped OSM extract out of them unless a test opts in.
    env: { OSM_EXTRACT_DIR: "tests/fixtures/no-osm-extract" },
  },
});
