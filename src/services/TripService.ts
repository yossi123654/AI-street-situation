import { TtlCache } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { badRequest } from "@/lib/errors";
import { freshnessOf, worstFreshness } from "@/lib/freshness";
import { haversineMeters, roundCoord } from "@/lib/geo";
import {
  cumulativeDistances,
  interpolateAlong,
  nearestVertex,
  sampleIndexes,
} from "@/lib/routeGeometry";
import type {
  Confidence,
  Freshness,
  Incident,
  LatLon,
  Locale,
  Route,
  RoutePointWeather,
  RouteTrafficSample,
  RouteTrafficSection,
  Section,
  SourceInfo,
  TravelMode,
  TripMissingCode,
  TripReport,
  TripStop,
} from "@/lib/types";
import { getProvider, getProviders } from "@/providers/registry";
import type { ParkingService } from "@/services/ParkingService";

const MINUTE = 60_000;
/** Weather samples: one every 10 km, at most 12. */
const WEATHER_EVERY_M = 10_000;
const WEATHER_MAX = 12;
/** Traffic flow samples when the router has no live traffic: at most 6 calls per trip. */
const FLOW_MAX = 6;
/** Incidents are collected around a few points with a wide radius, then filtered to the corridor. */
const INCIDENT_SAMPLE_MAX = 4;
const INCIDENT_SAMPLE_RADIUS_M = 8000;
const CORRIDOR_M = 1000;
const STOP_CORRIDOR_M = 400;

type Endpoint = LatLon & { label?: string };

function uniqueSources(sources: SourceInfo[]): SourceInfo[] {
  const seen = new Map<string, SourceInfo>();
  for (const s of sources) if (!seen.has(s.providerId)) seen.set(s.providerId, s);
  return [...seen.values()];
}

async function section<T>(
  kind: string,
  available: boolean,
  load: () => Promise<{ data: T; freshness: Freshness; sources: SourceInfo[] } | null>,
): Promise<Section<T>> {
  if (!available) return { status: "unavailable", reason: "not_configured" };
  try {
    const result = await load();
    return result ? { status: "ok", ...result } : { status: "unavailable", reason: "no_data" };
  } catch (error) {
    console.warn(`[trip] ${kind} failed:`, error);
    return {
      status: "unavailable",
      reason: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Departures within this window count as "now" (live data applies). */
const NOW_WINDOW_MS = 5 * 60_000;

export function isFutureDeparture(departAt: Date | undefined, now = Date.now()): departAt is Date {
  return Boolean(departAt && departAt.getTime() - now > NOW_WINDOW_MS);
}

/** Cache-key part for a departure: "now", or the time rounded to 15 minutes. */
export function departureKey(departAt: Date | undefined, now = Date.now()): string {
  if (!isFutureDeparture(departAt, now)) return "now";
  return String(Math.round(departAt.getTime() / (15 * 60_000)));
}

/** Road name of the step covering a given distance along the route. */
export function roadAt(route: Route, distanceM: number): string | undefined {
  // Steps only cover the major roads; between them the name is unknown.
  return route.steps.find(
    (s) => distanceM >= s.distanceAlongM && distanceM <= s.distanceAlongM + s.distanceM,
  )?.name;
}

/** Seconds after departure at which the traveller reaches `distanceM` along the route. */
export function etaOffsetAt(route: Route, cumulative: number[], distanceM: number): number {
  if (route.cumulativeDurationS && route.cumulativeDurationS.length === cumulative.length) {
    return interpolateAlong(cumulative, route.cumulativeDurationS, distanceM);
  }
  return route.distanceM > 0 ? (distanceM / route.distanceM) * route.durationS : 0;
}

export function assessTrip(
  report: Pick<
    TripReport,
    "route" | "weatherAlong" | "trafficAlong" | "incidents" | "stops" | "destinationParking"
  >,
): { missing: TripMissingCode[]; confidence: Confidence } {
  const missing: TripMissingCode[] = [];
  if (report.route.status !== "ok") return { missing: ["route"], confidence: "low" };
  if (report.weatherAlong.status !== "ok") missing.push("weather");
  if (report.trafficAlong.status !== "ok") missing.push("traffic");
  if (report.incidents.status !== "ok") missing.push("incidents");
  if (report.stops.status !== "ok") missing.push("stops");
  if (report.destinationParking.status !== "ok") missing.push("parking");
  const hasTraffic = report.trafficAlong.status === "ok";
  const hasWeather = report.weatherAlong.status === "ok";
  const confidence: Confidence =
    hasTraffic && hasWeather && report.incidents.status === "ok"
      ? "high"
      : hasWeather || hasTraffic
        ? "medium"
        : "low";
  return { missing, confidence };
}

/**
 * Plans a trip: route, then weather for the time the traveller passes each
 * point, traffic and incidents along the corridor, places to stop, and
 * parking at the destination. Every part fails independently.
 */
export class TripService {
  private readonly routeCache = new TtlCache<Route>(200);
  private readonly stopsCache = new TtlCache<TripStop[]>(200);
  private readonly reportCache = new TtlCache<TripReport>(200);

  constructor(private readonly parking: ParkingService) {}

  isConfigured(): boolean {
    return Boolean(getProvider("routing"));
  }

  async plan(
    from: Endpoint,
    to: Endpoint,
    locale: Locale,
    mode: TravelMode = "car",
    departAt?: Date,
  ): Promise<TripReport> {
    const config = getConfig();
    const straightKm = haversineMeters(from, to) / 1000;
    if (straightKm < 0.2) throw badRequest("origin and destination are the same place");
    if (straightKm > config.TRIP_MAX_DISTANCE_KM) {
      throw badRequest(`trips longer than ${config.TRIP_MAX_DISTANCE_KM} km are not supported`);
    }
    const key = [
      roundCoord(from.lat, 3),
      roundCoord(from.lon, 3),
      roundCoord(to.lat, 3),
      roundCoord(to.lon, 3),
      mode,
      locale,
      departureKey(departAt),
    ].join(",");
    // The cached report is shared between users, so it never stores their labels:
    // labels are user input (from the URL) and are attached per request.
    const bare = await this.reportCache.getOrSet(key, 3 * MINUTE, () =>
      this.build(
        { lat: from.lat, lon: from.lon },
        { lat: to.lat, lon: to.lon },
        locale,
        mode,
        key,
        isFutureDeparture(departAt) ? departAt : undefined,
      ),
    );
    return {
      ...bare,
      from: { ...bare.from, ...(from.label ? { label: from.label } : {}) },
      to: { ...bare.to, ...(to.label ? { label: to.label } : {}) },
    };
  }

  private async build(
    from: Endpoint,
    to: Endpoint,
    locale: Locale,
    mode: TravelMode,
    key: string,
    /** Set only for departures more than a few minutes ahead. */
    departAt?: Date,
  ): Promise<TripReport> {
    const departureIsNow = !departAt;
    const departureTime = departAt ?? new Date();
    const routing = getProvider("routing");
    const route = await section<Route>("route", Boolean(routing), async () => {
      // Traffic-aware routes change quickly; free-flow routes can be cached longer.
      const data = await this.routeCache.getOrSet(
        `${routing!.def.id}:${key}`,
        routing!.def.id === "osrm" ? 30 * MINUTE : 3 * MINUTE,
        () => routing!.instance.route(from, to, mode, locale, departAt ? { departAt } : {}),
      );
      return {
        data,
        freshness:
          data.trafficKind === "live" ? freshnessOf("traffic", data.source.observedAt) : "unknown",
        sources: [data.source],
      };
    });

    if (route.status !== "ok") {
      const base = {
        route,
        weatherAlong: { status: "unavailable", reason: "no_data" } as const,
        trafficAlong: { status: "unavailable", reason: "no_data" } as const,
        incidents: { status: "unavailable", reason: "no_data" } as const,
        stops: { status: "unavailable", reason: "no_data" } as const,
        destinationParking: { status: "unavailable", reason: "no_data" } as const,
      };
      return {
        from,
        to,
        mode,
        generatedAt: new Date().toISOString(),
        departureTime: departureTime.toISOString(),
        departureIsNow,
        ...base,
        ...assessTrip(base),
      };
    }

    const r = route.data;
    const cumulative = cumulativeDistances(r.geometry);
    const pointAt = (index: number) => {
      const [lat, lon] = r.geometry[index]!;
      const distanceAlongM = cumulative[index]!;
      return { lat, lon, distanceAlongM, etaOffsetS: etaOffsetAt(r, cumulative, distanceAlongM) };
    };

    // Stops are fetched separately (/api/trip/stops): Overpass can be slow and must not delay the trip.
    const [weatherAlong, trafficAlong, incidents, destinationParking] = await Promise.all([
      this.weatherAlong(r, cumulative, departureTime, pointAt),
      this.trafficAlong(r, cumulative, pointAt, departureIsNow),
      this.incidentsAlong(r, cumulative, locale, pointAt, departureTime),
      this.parking.find(to, getConfig().PARKING_SEARCH_RADIUS_M),
    ]);
    const stops: Section<TripStop[]> = getProvider("stops")
      ? { status: "unavailable", reason: "no_data" }
      : { status: "unavailable", reason: "not_configured" };

    const base = { route, weatherAlong, trafficAlong, incidents, stops, destinationParking };
    return {
      from,
      to,
      mode,
      generatedAt: new Date().toISOString(),
      departureTime: departureTime.toISOString(),
      departureIsNow,
      ...base,
      ...assessTrip(base),
    };
  }

  private weatherAlong(
    route: Route,
    cumulative: number[],
    departure: Date,
    pointAt: (i: number) => {
      lat: number;
      lon: number;
      distanceAlongM: number;
      etaOffsetS: number;
    },
  ) {
    const weather = getProvider("weather");
    const supported = Boolean(weather?.instance.forecastAt);
    return section<RoutePointWeather[]>("weather", supported, async () => {
      const indexes = sampleIndexes(cumulative, { everyM: WEATHER_EVERY_M, max: WEATHER_MAX });
      const samples = indexes.map(pointAt);
      const forecasts = await weather!.instance.forecastAt!(
        samples.map((s) => ({
          lat: s.lat,
          lon: s.lon,
          at: new Date(departure.getTime() + s.etaOffsetS * 1000),
        })),
      );
      const data = samples.map((s, i): RoutePointWeather => {
        const f = forecasts[i]!;
        const roadName = roadAt(route, s.distanceAlongM);
        return {
          lat: s.lat,
          lon: s.lon,
          distanceAlongM: Math.round(s.distanceAlongM),
          etaOffsetS: Math.round(s.etaOffsetS),
          forecastFor: f.validAt,
          kind: f.kind,
          temperatureC: f.temperatureC,
          weatherCode: f.weatherCode,
          precipitationMm: f.precipitationMm,
          windSpeedKmh: f.windSpeedKmh,
          visibilityM: f.visibilityM,
          isDay: f.isDay,
          ...(roadName ? { roadName } : {}),
        };
      });
      const now = new Date().toISOString();
      return {
        data,
        freshness: "live",
        sources: [
          {
            providerId: weather!.def.id,
            name: weather!.def.name,
            attribution: weather!.def.attribution,
            url: weather!.def.homepage,
            fetchedAt: now,
            observedAt: now,
          },
        ],
      };
    });
  }

  private trafficAlong(
    route: Route,
    cumulative: number[],
    pointAt: (i: number) => {
      lat: number;
      lon: number;
      distanceAlongM: number;
      etaOffsetS: number;
    },
    departureIsNow: boolean,
  ) {
    const flow = getProvider("traffic");
    const available = route.trafficAware || Boolean(flow);
    if (available && !route.trafficAware && !departureIsNow) {
      // Sampled flow is live: it says nothing about traffic at a later departure.
      return Promise.resolve<
        Section<{ sections: RouteTrafficSection[]; samples: RouteTrafficSample[] }>
      >({
        status: "unavailable",
        reason: "not_live",
      });
    }
    return section<{ sections: RouteTrafficSection[]; samples: RouteTrafficSample[] }>(
      "traffic",
      available,
      async () => {
        if (route.trafficAware) {
          return {
            data: { sections: route.trafficSections ?? [], samples: [] },
            freshness:
              route.trafficKind === "predicted"
                ? "unknown"
                : freshnessOf("traffic", route.source.observedAt),
            sources: [route.source],
          };
        }
        // No traffic in the route itself: sample the flow provider along the way.
        const indexes = sampleIndexes(cumulative, { everyM: 5000, max: FLOW_MAX });
        const results = await Promise.allSettled(
          indexes.map(async (index) => {
            const p = pointAt(index);
            const flows = await flow!.instance.flow({ lat: p.lat, lon: p.lon }, 500);
            const first = flows[0];
            if (!first) return null;
            const roadName = first.roadName ?? roadAt(route, p.distanceAlongM);
            return {
              lat: p.lat,
              lon: p.lon,
              distanceAlongM: Math.round(p.distanceAlongM),
              ...(roadName ? { roadName } : {}),
              flow: first,
            } satisfies RouteTrafficSample;
          }),
        );
        const samples = results.flatMap((res) =>
          res.status === "fulfilled" && res.value ? [res.value] : [],
        );
        if (samples.length === 0) {
          if (results.every((res) => res.status === "rejected"))
            throw (results[0] as PromiseRejectedResult).reason;
          return null;
        }
        return {
          data: { sections: [], samples },
          freshness: worstFreshness(
            samples.map((s) => freshnessOf("traffic", s.flow.source.observedAt)),
          ),
          sources: uniqueSources(samples.map((s) => s.flow.source)),
        };
      },
    );
  }

  private incidentsAlong(
    route: Route,
    cumulative: number[],
    locale: Locale,
    pointAt: (i: number) => {
      lat: number;
      lon: number;
      distanceAlongM: number;
      etaOffsetS: number;
    },
    departure: Date,
  ) {
    const providers = getProviders("incidents");
    return section<Incident[]>("incidents", providers.length > 0, async () => {
      const indexes = sampleIndexes(cumulative, {
        everyM: INCIDENT_SAMPLE_RADIUS_M * 1.5,
        max: INCIDENT_SAMPLE_MAX,
      });
      const calls = providers.flatMap(({ instance }) =>
        indexes.map((index) => {
          const p = pointAt(index);
          return instance.incidents({ lat: p.lat, lon: p.lon }, INCIDENT_SAMPLE_RADIUS_M, locale);
        }),
      );
      const results = await Promise.allSettled(calls);
      if (results.every((res) => res.status === "rejected"))
        throw (results[0] as PromiseRejectedResult).reason;
      const byId = new Map<string, Incident>();
      for (const res of results) {
        if (res.status !== "fulfilled") continue;
        for (const incident of res.value) {
          if (incident.lat === undefined || incident.lon === undefined) continue;
          // Over before the driver even leaves.
          if (incident.endTime && Date.parse(incident.endTime) < departure.getTime()) continue;
          const nearest = nearestVertex(route.geometry, { lat: incident.lat, lon: incident.lon });
          if (nearest.index < 0 || nearest.distanceM > CORRIDOR_M) continue;
          // Reuse distanceM to mean "distance along the route" for trips.
          byId.set(incident.id, { ...incident, distanceM: Math.round(cumulative[nearest.index]!) });
        }
      }
      const data = [...byId.values()].sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
      const sources = uniqueSources(data.map((i) => i.source));
      const now = new Date().toISOString();
      return {
        data,
        freshness:
          data.length > 0
            ? worstFreshness(
                data.map((i) =>
                  freshnessOf("incidents", i.source.observedAt ?? i.source.fetchedAt),
                ),
              )
            : "live",
        sources:
          sources.length > 0
            ? sources
            : providers.map(({ def }) => ({
                providerId: def.id,
                name: def.name,
                attribution: def.attribution,
                url: def.homepage,
                fetchedAt: now,
              })),
      };
    });
  }

  /** Places to stop along the planned trip. Separate from `plan` because Overpass is slow. */
  async stops(
    from: Endpoint,
    to: Endpoint,
    locale: Locale,
    mode: TravelMode = "car",
    departAt?: Date,
  ): Promise<Section<TripStop[]>> {
    const report = await this.plan(from, to, locale, mode, departAt);
    if (report.route.status !== "ok") return { status: "unavailable", reason: "no_data" };
    const route = report.route.data;
    const key = `${roundCoord(from.lat, 3)},${roundCoord(from.lon, 3)}:${roundCoord(to.lat, 3)},${roundCoord(to.lon, 3)}:${mode}`;
    const provider = getProvider("stops");
    return section<TripStop[]>("stops", Boolean(provider), async () => {
      const data = await this.stopsCache.getOrSet(
        `${provider!.def.id}:${key}`,
        24 * 60 * MINUTE,
        () => provider!.instance.stopsAlong(route.geometry, STOP_CORRIDOR_M),
      );
      const now = new Date().toISOString();
      return {
        data,
        freshness: "unknown",
        sources: [
          {
            providerId: provider!.def.id,
            name: provider!.def.name,
            attribution: provider!.def.attribution,
            url: provider!.def.homepage,
            fetchedAt: now,
          },
        ],
      };
    });
  }
}
