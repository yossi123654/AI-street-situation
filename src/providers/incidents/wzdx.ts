import { haversineMeters } from "@/lib/geo";
import { upstreamJson } from "@/lib/http";
import type { Incident, IncidentSeverity, LatLon } from "@/lib/types";
import type { ProviderDefinition } from "@/providers/types";

/**
 * Work Zone Data Exchange (WZDx) v4 feeds: an open GeoJSON standard that road
 * authorities use to publish road works and detours
 * (https://github.com/usdot-jpo-ode/wzdx). Any number of feeds can be
 * configured with WZDX_FEED_URLS; each feed's own publisher and licence are
 * used for attribution.
 */

interface WzdxFeed {
  feed_info?: WzdxFeedInfo;
  /** v3 / early v4 name of feed_info. */
  road_event_feed_info?: WzdxFeedInfo;
  features?: WzdxFeature[];
}

interface WzdxFeedInfo {
  publisher?: string;
  license?: string;
  update_date?: string;
  data_sources?: Array<{ data_source_id?: string; organization_name?: string }>;
}

interface WzdxFeature {
  id?: string;
  geometry?: { type: string; coordinates: unknown };
  properties?: {
    core_details?: {
      event_type?: string;
      road_names?: string[];
      direction?: string;
      description?: string;
      update_date?: string;
    };
    start_date?: string;
    end_date?: string;
    vehicle_impact?: string;
  };
}

const FEED_TTL_MS = 5 * 60_000;

/** All [lon, lat] positions of a LineString / MultiPoint / Point geometry. */
function positions(geometry: WzdxFeature["geometry"]): Array<[number, number]> {
  if (!geometry) return [];
  const c = geometry.coordinates;
  if (geometry.type === "Point" && Array.isArray(c)) return [c as [number, number]];
  if ((geometry.type === "LineString" || geometry.type === "MultiPoint") && Array.isArray(c)) {
    return (c as Array<[number, number]>).filter((p) => Array.isArray(p) && p.length >= 2);
  }
  return [];
}

function severity(impact: string | undefined): IncidentSeverity {
  if (!impact || impact === "unknown") return "unknown";
  if (impact === "all-lanes-closed") return "major";
  if (impact.startsWith("some-lanes-closed") || impact === "alternating-one-way") return "moderate";
  return "minor";
}

/** Converts a WZDx feed into incidents near a point. Exported for tests. */
export function wzdxToIncidents(
  feed: WzdxFeed,
  point: LatLon,
  radiusM: number,
  feedUrl: string,
  now: number = Date.now(),
): Incident[] {
  const info = feed.feed_info ?? feed.road_event_feed_info ?? {};
  const publisher =
    info.publisher ?? info.data_sources?.[0]?.organization_name ?? new URL(feedUrl).hostname;
  const fetchedAt = new Date(now).toISOString();
  const incidents: Incident[] = [];
  for (const [index, feature] of (feed.features ?? []).entries()) {
    const props = feature.properties ?? {};
    const core = props.core_details ?? {};
    // Only events that are active now.
    if (props.start_date && Date.parse(props.start_date) > now) continue;
    if (props.end_date && Date.parse(props.end_date) < now) continue;
    let nearest: { lat: number; lon: number; d: number } | undefined;
    for (const [lon, lat] of positions(feature.geometry)) {
      const d = haversineMeters(point, { lat, lon });
      if (!nearest || d < nearest.d) nearest = { lat, lon, d };
    }
    if (!nearest || nearest.d > radiusM) continue;
    const roads = core.road_names?.filter(Boolean).join(" / ");
    incidents.push({
      id: `wzdx:${feature.id ?? `${feedUrl}#${index}`}`,
      type: core.event_type === "detour" ? "closure" : "roadworks",
      severity: severity(props.vehicle_impact),
      description: core.description ?? "",
      ...(roads
        ? {
            roadName:
              core.direction && core.direction !== "unknown"
                ? `${roads} (${core.direction})`
                : roads,
          }
        : {}),
      lat: nearest.lat,
      lon: nearest.lon,
      distanceM: Math.round(nearest.d),
      ...(props.start_date ? { startTime: props.start_date } : {}),
      ...(props.end_date ? { endTime: props.end_date } : {}),
      roadClosed: props.vehicle_impact === "all-lanes-closed",
      source: {
        providerId: `wzdx:${new URL(feedUrl).hostname}`,
        name: `${publisher} (WZDx)`,
        attribution: `Road works data: ${publisher}`,
        url: info.license ?? feedUrl,
        fetchedAt,
        // The feed's generation time; an event's own update_date can be days old.
        ...(info.update_date ? { observedAt: info.update_date } : {}),
      },
    });
  }
  return incidents;
}

export const wzdxIncidents: ProviderDefinition<"incidents"> = {
  id: "wzdx",
  kind: "incidents",
  name: "Open road-work feeds (WZDx)",
  homepage: "https://github.com/usdot-jpo-ode/wzdx",
  attribution: "Road works data from the publishing road authority",
  requiredEnv: ["WZDX_FEED_URLS"],
  isEnabled: (config) => config.WZDX_FEED_URLS.length > 0,
  create(config) {
    const cache = new Map<string, { at: number; feed: Promise<WzdxFeed> }>();
    const load = (url: string) => {
      const hit = cache.get(url);
      if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.feed;
      const feed = upstreamJson<WzdxFeed>(url, { providerId: wzdxIncidents.id, timeoutMs: 20_000 });
      cache.set(url, { at: Date.now(), feed });
      feed.catch(() => cache.delete(url));
      return feed;
    };
    return {
      async incidents(point, radiusM) {
        const results = await Promise.allSettled(config.WZDX_FEED_URLS.map(load));
        const incidents = results.flatMap((result, i) =>
          result.status === "fulfilled"
            ? wzdxToIncidents(result.value, point, radiusM, config.WZDX_FEED_URLS[i]!)
            : [],
        );
        if (incidents.length === 0 && results.every((r) => r.status === "rejected")) {
          throw new Error("all WZDx feeds failed");
        }
        return incidents;
      },
    };
  },
};
