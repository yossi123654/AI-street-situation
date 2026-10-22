import { TtlCache } from "@/lib/cache";
import { freshnessOf } from "@/lib/freshness";
import type {
  AreaSummary,
  DailyOutlook,
  Freshness,
  LatLon,
  Section,
  SourceInfo,
  WeatherData,
} from "@/lib/types";
import { getProvider } from "@/providers/registry";
import type { CameraRegistry } from "@/services/CameraRegistry";

const MINUTE = 60_000;
/** "Your area" for the camera count. */
export const AREA_CAMERA_RADIUS_M = 50_000;
const PREVIEW_COUNT = 3;

async function section<T>(
  kind: string,
  available: boolean,
  load: () => Promise<{ data: T; freshness: Freshness; sources: SourceInfo[] }>,
): Promise<Section<T>> {
  if (!available) return { status: "unavailable", reason: "not_configured" };
  try {
    return { status: "ok", ...(await load()) };
  } catch (error) {
    console.warn(`[area] ${kind} failed:`, error);
    return {
      status: "unavailable",
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Rounds to ~1 km: the home page never needs (or sends) a more precise location. */
export function roundToArea(point: LatLon): LatLon {
  return { lat: Math.round(point.lat * 100) / 100, lon: Math.round(point.lon * 100) / 100 };
}

/**
 * The home page's overview of the visitor's area: weather now and today, and
 * how many cameras there are within 50 km. Cheap on purpose: no traffic or
 * incident calls (those can cost API quota), and everything is cached per
 * ~1 km cell.
 */
export class AreaService {
  private readonly weatherCache = new TtlCache<WeatherData>(2000);
  private readonly todayCache = new TtlCache<DailyOutlook>(2000);

  constructor(private readonly cameras: CameraRegistry) {}

  async summary(requested: LatLon): Promise<AreaSummary> {
    const point = roundToArea(requested);
    const key = `${point.lat},${point.lon}`;
    const weather = getProvider("weather");

    const [current, today, cameras] = await Promise.all([
      section<WeatherData>("weather", Boolean(weather), async () => {
        const data = await this.weatherCache.getOrSet(
          `${weather!.def.id}:${key}`,
          10 * MINUTE,
          () => weather!.instance.current(point),
        );
        return {
          data,
          freshness: freshnessOf("weather", data.source.observedAt),
          sources: [data.source],
        };
      }),
      section<DailyOutlook>("today", Boolean(weather?.instance.today), async () => {
        const data = await this.todayCache.getOrSet(`${weather!.def.id}:${key}`, 30 * MINUTE, () =>
          weather!.instance.today!(point),
        );
        return { data, freshness: "unknown" as Freshness, sources: [data.source] };
      }),
      this.cameras.findNear(point, AREA_CAMERA_RADIUS_M, 5000),
    ]);

    const all = cameras.cameras;
    const embeddable = all.filter((camera) => camera.display === "embed");
    const preview = [...embeddable, ...all.filter((camera) => camera.display !== "embed")].slice(
      0,
      PREVIEW_COUNT,
    );
    return {
      point,
      weather: current,
      today,
      cameras: {
        radiusM: AREA_CAMERA_RADIUS_M,
        count: all.length,
        embeddableCount: embeddable.length,
        preview,
      },
    };
  }
}
