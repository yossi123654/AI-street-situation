import { z } from "zod";

/**
 * Server-side configuration, read from environment variables.
 * Every key is optional; see `.env.example` for documentation.
 * Never import this module from client components.
 */

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const url = (fallback: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? fallback : v.replace(/\/+$/, "")))
    .pipe(z.url())
    .default(fallback);

const bool = (fallback: boolean) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? fallback : ["1", "true", "yes", "on"].includes(v)))
    .default(fallback);

const int = (fallback: number, min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? fallback : Number(v)))
    .pipe(z.number().int().min(min).max(max))
    .default(fallback);

const schema = z.object({
  APP_USER_AGENT: z
    .string()
    .trim()
    .default("AI-Street-Situation/0.1 (+https://github.com/yossi123654/ai-street-situation)"),

  GEOCODING_PROVIDER: z.enum(["nominatim", "photon", "google"]).default("nominatim"),
  GEOCODING_COUNTRY_CODES: optionalString,
  NOMINATIM_URL: url("https://nominatim.openstreetmap.org"),
  NOMINATIM_EMAIL: optionalString,
  PHOTON_URL: url("https://photon.komoot.io"),
  GOOGLE_MAPS_API_KEY: optionalString,
  GOOGLE_GEOCODING_URL: url("https://maps.googleapis.com"),

  WEATHER_ENABLED: bool(true),
  OPEN_METEO_URL: url("https://api.open-meteo.com"),

  TRAFFIC_PROVIDER: z.enum(["tomtom", "here", ""]).default(""),
  TOMTOM_API_KEY: optionalString,
  TOMTOM_URL: url("https://api.tomtom.com"),
  HERE_API_KEY: optionalString,
  HERE_TRAFFIC_URL: url("https://data.traffic.hereapi.com"),
  /** Comma-separated URLs of WZDx v4 road-work feeds published by road authorities. */
  WZDX_FEED_URLS: z
    .string()
    .trim()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((u) => u.trim())
            .filter(Boolean)
        : [],
    )
    .pipe(z.array(z.url({ protocol: /^https?$/ }))),

  CAMERA_DATA_DIR: z.string().trim().default("data/cameras"),
  CAMERA_SEARCH_RADIUS_M: int(3000, 100, 50000),
  TFL_APP_KEY: optionalString,
  TFL_API_URL: url("https://api.tfl.gov.uk"),
  /** Testing only: allow http:// and private hosts for camera media. Never enable in production. */
  DEV_ALLOW_INSECURE_MEDIA: bool(false),

  PARKING_ENABLED: bool(true),
  OVERPASS_URL: url("https://overpass-api.de/api/interpreter"),
  PARKING_SEARCH_RADIUS_M: int(800, 100, 3000),

  AI_PROVIDER: z.enum(["ollama", "anthropic", ""]).default(""),
  OLLAMA_URL: optionalString,
  OLLAMA_MODEL: z.string().trim().default("qwen2.5vl:7b"),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().trim().default("claude-sonnet-5-5"),
  ANTHROPIC_URL: url("https://api.anthropic.com"),
  AI_TIMEOUT_MS: int(60000, 1000, 300000),

  /** "vector" (OpenFreeMap / any MapLibre style) or "raster" (classic tile URL). */
  MAP_TYPE: z.enum(["vector", "raster"]).default("vector"),
  MAP_STYLE_URL: url("https://tiles.openfreemap.org/styles/liberty"),
  MAP_STYLE_ATTRIBUTION: z
    .string()
    .trim()
    .default(
      '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    ),
  MAP_TILE_URL: z.string().trim().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  MAP_ATTRIBUTION: z
    .string()
    .trim()
    .default(
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    ),
  MAP_MAX_ZOOM: int(19, 1, 22),
  MAP_DEFAULT_CENTER: z
    .string()
    .trim()
    .default("31.65,34.95")
    .refine((v) => /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v), 'expected "lat,lon"'),
  MAP_DEFAULT_ZOOM: int(8, 1, 20),

  RATE_LIMIT_PER_MINUTE: int(60, 1, 10000),
  TRUST_PROXY: bool(false),
  UPSTREAM_TIMEOUT_MS: int(10000, 500, 120000),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  const input: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) {
    const value = env[key];
    // Empty values (e.g. `KEY=` copied from .env.example) mean "use the default".
    if (value !== undefined && value.trim() !== "") input[key] = value;
  }
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }
  return result.data;
}

export function getConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}

/** Test helper. */
export function resetConfigForTests(): void {
  cached = undefined;
}
