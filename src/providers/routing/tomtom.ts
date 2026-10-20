import { buildUrl, upstreamJson } from "@/lib/http";
import { cumulativeDistances } from "@/lib/routeGeometry";
import type {
  IncidentSeverity,
  RouteStep,
  RouteTrafficCategory,
  RouteTrafficSection,
} from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface TomTomRouteResponse {
  routes?: Array<{
    summary: {
      lengthInMeters: number;
      travelTimeInSeconds: number;
      trafficDelayInSeconds?: number;
      noTrafficTravelTimeInSeconds?: number;
      departureTime?: string;
      arrivalTime?: string;
    };
    legs: Array<{ points: Array<{ latitude: number; longitude: number }> }>;
    sections?: Array<{
      sectionType: string;
      startPointIndex: number;
      endPointIndex: number;
      simpleCategory?: "JAM" | "ROAD_WORK" | "ROAD_CLOSURE" | "OTHER";
      effectiveSpeedInKmh?: number;
      delayInSeconds?: number;
      magnitudeOfDelay?: number;
    }>;
    guidance?: {
      instructions?: Array<{
        routeOffsetInMeters: number;
        travelTimeInSeconds: number;
        street?: string;
        roadNumbers?: string[];
        instructionType?: string;
      }>;
    };
    progress?: Array<{ pointIndex: number; travelTimeInSeconds: number; distanceInMeters: number }>;
  }>;
  detailedError?: { code?: string; message?: string };
}

const CATEGORY: Record<string, RouteTrafficCategory> = {
  JAM: "jam",
  ROAD_WORK: "roadworks",
  ROAD_CLOSURE: "closure",
  OTHER: "other",
};

const MAGNITUDE: Record<number, IncidentSeverity> = {
  1: "minor",
  2: "moderate",
  3: "major",
  4: "major",
};

/** Builds major steps from TomTom guidance instructions, merging consecutive ones on the same road number. */
export function stepsFromInstructions(
  instructions: NonNullable<
    NonNullable<TomTomRouteResponse["routes"]>[number]["guidance"]
  >["instructions"],
  totalDistanceM: number,
  totalDurationS: number,
): RouteStep[] {
  const list = instructions ?? [];
  const steps: Array<RouteStep & { key: string }> = [];
  for (let i = 0; i < list.length; i++) {
    const current = list[i]!;
    const next = list[i + 1];
    const ref = current.roadNumbers?.[0]?.trim() ?? "";
    const street = current.street?.trim() ?? "";
    const key = ref || street;
    if (!key) continue;
    const name = ref && street && !street.includes(ref) ? `${ref} · ${street}` : street || ref;
    const distanceM = (next?.routeOffsetInMeters ?? totalDistanceM) - current.routeOffsetInMeters;
    const durationS = (next?.travelTimeInSeconds ?? totalDurationS) - current.travelTimeInSeconds;
    const last = steps[steps.length - 1];
    if (last && last.key === key) {
      last.distanceM += distanceM;
      last.durationS += durationS;
    } else
      steps.push({ key, name, distanceAlongM: current.routeOffsetInMeters, distanceM, durationS });
  }
  return steps
    .filter((s) => s.distanceM >= 1500)
    .map((s) => ({
      name: s.name,
      distanceAlongM: s.distanceAlongM,
      distanceM: Math.round(s.distanceM),
      durationS: Math.round(s.durationS),
    }));
}

/** RFC 3339 without milliseconds, as TomTom expects: 2026-10-20T14:00:00+00:00 */
export function toTomTomDateTime(date: Date): string {
  return `${date.toISOString().slice(0, 19)}+00:00`;
}

/** TomTom Routing API with live traffic: ETA includes current delays and jams are marked along the route. */
export const tomtomRouting: ProviderDefinition<"routing"> = {
  id: "tomtom",
  kind: "routing",
  name: "TomTom Routing (traffic)",
  homepage: "https://developer.tomtom.com/routing-api/documentation/tomtom-maps/calculate-route",
  attribution: "Routing and traffic © TomTom",
  requiredEnv: ["TOMTOM_API_KEY"],
  isEnabled: (config) => Boolean(config.TOMTOM_API_KEY),
  create(config) {
    return {
      async route(from, to, mode, locale, options = {}) {
        void mode; // only "car" is supported today
        const locations = `${from.lat.toFixed(6)},${from.lon.toFixed(6)}:${to.lat.toFixed(6)},${to.lon.toFixed(6)}`;
        const url = buildUrl(config.TOMTOM_URL, `routing/1/calculateRoute/${locations}/json`, {
          key: config.TOMTOM_API_KEY,
          traffic: true,
          travelMode: "car",
          routeType: "fastest",
          sectionType: "traffic",
          computeTravelTimeFor: "all",
          instructionsType: "text",
          language: locale === "he" ? "he-IL" : "en-GB",
          // A future departure switches TomTom from live to predicted traffic.
          departAt: options.departAt ? toTomTomDateTime(options.departAt) : undefined,
        });
        const data = await upstreamJson<TomTomRouteResponse>(url, {
          providerId: tomtomRouting.id,
          timeoutMs: 20_000,
        });
        const best = data.routes?.[0];
        if (!best) throw new Error(`tomtom routing: ${data.detailedError?.message ?? "no route"}`);
        const geometry = best.legs.flatMap((leg) =>
          leg.points.map((p) => [p.latitude, p.longitude] as [number, number]),
        );
        const cumulative = cumulativeDistances(geometry);
        const summary = best.summary;
        const steps = stepsFromInstructions(
          best.guidance?.instructions,
          summary.lengthInMeters,
          summary.travelTimeInSeconds,
        );
        const trafficSections: RouteTrafficSection[] = (best.sections ?? [])
          .filter((s) => s.sectionType.toUpperCase() === "TRAFFIC")
          .map((s) => {
            const start = Math.min(Math.max(0, s.startPointIndex), geometry.length - 1);
            const end = Math.min(Math.max(start, s.endPointIndex), geometry.length - 1);
            return {
              startIndex: start,
              endIndex: end,
              category: CATEGORY[s.simpleCategory ?? "OTHER"] ?? "other",
              severity: MAGNITUDE[s.magnitudeOfDelay ?? 0] ?? "unknown",
              effectiveSpeedKmh:
                typeof s.effectiveSpeedInKmh === "number" ? s.effectiveSpeedInKmh : null,
              delayS: s.delayInSeconds ?? 0,
              distanceAlongM: Math.round(cumulative[start] ?? 0),
              lengthM: Math.round((cumulative[end] ?? 0) - (cumulative[start] ?? 0)),
            };
          });
        let cumulativeDurationS: number[] | undefined;
        if (best.progress && best.progress.length >= 2) {
          // Interpolate the sparse progress list onto every geometry point.
          cumulativeDurationS = new Array(geometry.length).fill(0);
          const prog = best.progress;
          let p = 0;
          for (let i = 0; i < geometry.length; i++) {
            while (p < prog.length - 2 && prog[p + 1]!.pointIndex <= i) p++;
            const a = prog[p]!;
            const b = prog[p + 1] ?? a;
            const span = b.pointIndex - a.pointIndex;
            const t = span > 0 ? Math.min(1, Math.max(0, (i - a.pointIndex) / span)) : 0;
            cumulativeDurationS[i] =
              a.travelTimeInSeconds + t * (b.travelTimeInSeconds - a.travelTimeInSeconds);
          }
        }
        return {
          geometry,
          distanceM: summary.lengthInMeters,
          durationS: summary.travelTimeInSeconds,
          trafficAware: true,
          trafficKind: options.departAt ? "predicted" : "live",
          ...(typeof summary.noTrafficTravelTimeInSeconds === "number"
            ? { noTrafficDurationS: summary.noTrafficTravelTimeInSeconds }
            : {}),
          ...(typeof summary.trafficDelayInSeconds === "number"
            ? { trafficDelayS: summary.trafficDelayInSeconds }
            : {}),
          ...(cumulativeDurationS ? { cumulativeDurationS } : {}),
          roads: [...new Set(steps.map((s) => s.name))],
          steps,
          trafficSections,
          source: sourceFrom(tomtomRouting, summary.departureTime ?? new Date().toISOString()),
        };
      },
    };
  },
};
