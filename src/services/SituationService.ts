import { TtlCache } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { freshnessOf, worstFreshness } from "@/lib/freshness";
import { roundCoord } from "@/lib/geo";
import type {
  Confidence,
  Freshness,
  Incident,
  LatLon,
  Locale,
  MissingCode,
  Section,
  SituationReport,
  SourceInfo,
  TrafficFlow,
  WeatherData,
} from "@/lib/types";
import { getProvider } from "@/providers/registry";
import type { CameraRegistry } from "@/services/CameraRegistry";

const MINUTE = 60_000;
/** Radius used for incidents and traffic flow around the selected point. */
const INCIDENT_RADIUS_M = 2000;
const FLOW_RADIUS_M = 500;

function uniqueSources(sources: SourceInfo[]): SourceInfo[] {
  const seen = new Map<string, SourceInfo>();
  for (const source of sources)
    if (!seen.has(source.providerId)) seen.set(source.providerId, source);
  return [...seen.values()];
}

async function section<T>(
  kind: string,
  available: boolean,
  /** Resolves to null when the provider answered but had no data for this place. */
  load: () => Promise<{ data: T; freshness: Freshness; sources: SourceInfo[] } | null>,
): Promise<Section<T>> {
  if (!available) return { status: "unavailable", reason: "not_configured" };
  try {
    const result = await load();
    return result ? { status: "ok", ...result } : { status: "unavailable", reason: "no_data" };
  } catch (error) {
    console.warn(`[situation] ${kind} failed:`, error);
    return {
      status: "unavailable",
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Derives the "missing data" list and an overall confidence level. */
export function assessReport(
  report: Pick<SituationReport, "weather" | "traffic" | "incidents" | "cameras">,
): { missing: MissingCode[]; confidence: Confidence } {
  const missing: MissingCode[] = [];
  let usable = 0;
  for (const kind of ["weather", "traffic", "incidents"] as const) {
    const s = report[kind];
    if (s.status !== "ok") missing.push(kind);
    else if (s.freshness === "stale") missing.push(`${kind}_stale`);
    else usable += 1;
  }
  const cameras = report.cameras;
  const hasCameras = cameras.status === "ok" && cameras.data.length > 0;
  if (!hasCameras) missing.push("cameras");
  const confidence: Confidence =
    usable === 3 ? "high" : usable === 2 || (usable === 1 && hasCameras) ? "medium" : "low";
  return { missing, confidence };
}

/**
 * Builds the situation report for a point by querying every configured
 * provider in parallel. Each section fails independently and says why.
 */
export class SituationService {
  private readonly weatherCache = new TtlCache<WeatherData>(1000);
  private readonly trafficCache = new TtlCache<TrafficFlow[]>(1000);
  private readonly incidentCache = new TtlCache<Incident[]>(1000);

  constructor(private readonly cameras: CameraRegistry) {}

  async report(point: LatLon, locale: Locale, label?: string): Promise<SituationReport> {
    const config = getConfig();
    const weatherProvider = getProvider("weather");
    const trafficProvider = getProvider("traffic");
    const incidentsProvider = getProvider("incidents");
    const key3 = `${roundCoord(point.lat, 3)},${roundCoord(point.lon, 3)}`;

    const [weather, traffic, incidents, cameras] = await Promise.all([
      section<WeatherData>("weather", Boolean(weatherProvider), async () => {
        const data = await this.weatherCache.getOrSet(
          `${weatherProvider!.def.id}:${key3}`,
          10 * MINUTE,
          () => weatherProvider!.instance.current(point),
        );
        return {
          data,
          freshness: freshnessOf("weather", data.source.observedAt),
          sources: [data.source],
        };
      }),
      section<TrafficFlow[]>("traffic", Boolean(trafficProvider), async () => {
        const data = await this.trafficCache.getOrSet(
          `${trafficProvider!.def.id}:${key3}`,
          2 * MINUTE,
          () => trafficProvider!.instance.flow(point, FLOW_RADIUS_M),
        );
        if (data.length === 0) return null;
        return {
          data,
          freshness: worstFreshness(data.map((f) => freshnessOf("traffic", f.source.observedAt))),
          sources: uniqueSources(data.map((f) => f.source)),
        };
      }),
      section<Incident[]>("incidents", Boolean(incidentsProvider), async () => {
        const data = await this.incidentCache.getOrSet(
          `${incidentsProvider!.def.id}:${locale}:${key3}`,
          3 * MINUTE,
          () => incidentsProvider!.instance.incidents(point, INCIDENT_RADIUS_M, locale),
        );
        const sorted = [...data].sort(
          (a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity),
        );
        const fetchedAt = sorted[0]?.source.fetchedAt ?? new Date().toISOString();
        return {
          data: sorted.slice(0, 20),
          freshness: freshnessOf("incidents", sorted[0]?.source.observedAt ?? fetchedAt),
          sources: [
            sorted[0]?.source ?? {
              providerId: incidentsProvider!.def.id,
              name: incidentsProvider!.def.name,
              attribution: incidentsProvider!.def.attribution,
              url: incidentsProvider!.def.homepage,
              fetchedAt,
            },
          ],
        };
      }),
      section("cameras", true, async () => {
        const { cameras: near } = await this.cameras.findNear(point, config.CAMERA_SEARCH_RADIUS_M);
        const sources = uniqueSources(
          near.map((camera) => ({
            providerId: `camera:${camera.operator.name}`,
            name: camera.operator.name,
            attribution: camera.license.attribution ?? camera.operator.name,
            url: camera.license.termsUrl,
            fetchedAt: new Date().toISOString(),
          })),
        );
        return { data: near, freshness: "unknown" as Freshness, sources };
      }),
    ]);

    const base = { weather, traffic, incidents, cameras };
    return {
      location: { lat: point.lat, lon: point.lon, ...(label ? { label } : {}) },
      generatedAt: new Date().toISOString(),
      ...base,
      ...assessReport(base),
    };
  }
}
