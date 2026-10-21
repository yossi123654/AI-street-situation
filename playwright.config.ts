import { defineConfig, devices } from "@playwright/test";

const MOCK = "http://127.0.0.1:4010";

/** Full configuration: every provider enabled, pointed at the mock upstream. */
const fullEnv = {
  NEXT_TELEMETRY_DISABLED: "1",
  NOMINATIM_URL: `${MOCK}/nominatim`,
  OPEN_METEO_URL: `${MOCK}/open-meteo`,
  TOMTOM_API_KEY: "test-key",
  TOMTOM_URL: `${MOCK}/tomtom`,
  OSRM_URL: `${MOCK}/osrm/routed-car`,
  WZDX_FEED_URLS: `${MOCK}/wzdx/feed.json`,
  OVERPASS_URLS: `${MOCK}/overpass/api/interpreter`,
  OLLAMA_URL: `${MOCK}/ollama`,
  CAMERA_DATA_DIR: "tests/fixtures/cameras",
  DEV_ALLOW_INSECURE_MEDIA: "true",
  MAP_TYPE: "vector",
  MAP_STYLE_URL: `${MOCK}/style.json`,
  MAP_STYLE_ATTRIBUTION: "Test vector style · © OpenStreetMap contributors",
  MAP_TILE_URL: `${MOCK}/tiles/{z}/{x}/{y}.png`,
  MAP_ATTRIBUTION: "Test tiles · © OpenStreetMap contributors",
  RATE_LIMIT_PER_MINUTE: "1000",
};

/** Default "no keys" configuration: only the keyless providers. */
const minimalEnv = {
  NEXT_TELEMETRY_DISABLED: "1",
  NOMINATIM_URL: `${MOCK}/nominatim`,
  OPEN_METEO_URL: `${MOCK}/open-meteo`,
  OSRM_URL: `${MOCK}/osrm/routed-car`,
  CAMERA_DATA_DIR: "tests/fixtures/empty-cameras",
  OVERPASS_URLS: `${MOCK}/overpass/api/interpreter`,
  MAP_TYPE: "raster",
  MAP_TILE_URL: `${MOCK}/tiles/{z}/{x}/{y}.png`,
  MAP_ATTRIBUTION: "Test tiles · © OpenStreetMap contributors",
  RATE_LIMIT_PER_MINUTE: "1000",
};

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [
    {
      name: "full",
      testMatch: /(full|trip)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3100" },
      metadata: { server: "full" },
    },
    {
      name: "minimal",
      testMatch: /(minimal|trip)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3101" },
      metadata: { server: "minimal" },
    },
  ],
  webServer: [
    {
      command: "node tests/e2e/mock-upstream.mjs",
      url: `${MOCK}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx next start -p 3100 -H 127.0.0.1",
      url: "http://127.0.0.1:3100/api/health",
      env: fullEnv,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx next start -p 3101 -H 127.0.0.1",
      url: "http://127.0.0.1:3101/api/health",
      env: minimalEnv,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
