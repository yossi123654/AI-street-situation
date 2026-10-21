import { buildUrl, upstreamJson } from "@/lib/http";
import { cumulativeDistances } from "@/lib/routeGeometry";
import { createThrottle } from "@/lib/throttle";
import type { RouteStep } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface OsrmStep {
  name?: string;
  ref?: string;
  distance: number;
  duration: number;
  maneuver?: { type?: string };
}

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { type: "LineString"; coordinates: Array<[number, number]> };
    legs: Array<{
      summary?: string;
      steps?: OsrmStep[];
      annotation?: { duration?: number[]; distance?: number[] };
    }>;
  }>;
}

const PUBLIC_HOSTS = new Set(["routing.openstreetmap.de", "router.project-osrm.org"]);
// FOSSGIS asks for at most one request per second per application.
const publicThrottle = createThrottle(1100);

/** Road label for a step: "ref name" with duplicates removed, e.g. "1 כביש ירושלים תל אביב". */
export function stepLabel(step: Pick<OsrmStep, "name" | "ref">): string {
  const ref = step.ref?.split(";")[0]?.trim() ?? "";
  const name = step.name?.trim() ?? "";
  if (ref && name && !name.includes(ref)) return `${ref} · ${name}`;
  return name || ref;
}

/**
 * Merges consecutive steps on the same road (same road number, or same name
 * when there is no number) and keeps the ones long enough to matter.
 */
export function majorSteps(steps: OsrmStep[], minDistanceM = 1500): RouteStep[] {
  const merged: Array<RouteStep & { key: string }> = [];
  let offset = 0;
  for (const step of steps) {
    const ref = step.ref?.split(";")[0]?.trim() ?? "";
    const key = ref || step.name?.trim() || "";
    const last = merged[merged.length - 1];
    if (key && last && last.key === key) {
      last.distanceM += step.distance;
      last.durationS += step.duration;
    } else if (key) {
      merged.push({
        key,
        name: stepLabel(step),
        distanceAlongM: offset,
        distanceM: step.distance,
        durationS: step.duration,
      });
    }
    offset += step.distance;
  }
  return merged
    .filter((s) => s.distanceM >= minDistanceM)
    .map((s) => ({
      name: s.name,
      distanceAlongM: Math.round(s.distanceAlongM),
      distanceM: Math.round(s.distanceM),
      durationS: Math.round(s.durationS),
    }));
}

/**
 * OSRM (Open Source Routing Machine) over OpenStreetMap data. The default
 * server is run by FOSSGIS for openstreetmap.org: free, no key, fair use.
 * Travel times are free-flow estimates: OSRM has no live traffic.
 */
export const osrm: ProviderDefinition<"routing"> = {
  id: "osrm",
  kind: "routing",
  name: "OSRM (OpenStreetMap routing)",
  homepage: "https://routing.openstreetmap.de/about.html",
  attribution: "Routing: OSRM · © OpenStreetMap contributors (ODbL)",
  requiredEnv: [],
  isEnabled: () => true,
  create(config) {
    const base = config.OSRM_URL;
    const isPublic = PUBLIC_HOSTS.has(new URL(base).hostname);
    const run = <T>(task: () => Promise<T>) => (isPublic ? publicThrottle(task) : task());
    return {
      async route(from, to) {
        const coords = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}`;
        const url = buildUrl(base, `route/v1/driving/${coords}`, {
          overview: "full",
          geometries: "geojson",
          steps: true,
          annotations: "duration",
        });
        const data = await run(() =>
          upstreamJson<OsrmResponse>(url, { providerId: osrm.id, timeoutMs: 20_000 }),
        );
        const best = data.routes?.[0];
        if (data.code !== "Ok" || !best) {
          throw new Error(`osrm: ${data.code}${data.message ? ` (${data.message})` : ""}`);
        }
        const geometry = best.geometry.coordinates.map(
          ([lon, lat]) => [lat, lon] as [number, number],
        );
        const steps = majorSteps(best.legs.flatMap((leg) => leg.steps ?? []));
        // Per-segment durations line up with the full geometry; accumulate them per point.
        const segmentDurations = best.legs.flatMap((leg) => leg.annotation?.duration ?? []);
        let cumulativeDurationS: number[] | undefined;
        if (segmentDurations.length === geometry.length - 1) {
          cumulativeDurationS = [0];
          for (const d of segmentDurations)
            cumulativeDurationS.push(cumulativeDurationS[cumulativeDurationS.length - 1]! + d);
        }
        // Sanity check the geometry against the reported distance.
        const measured = cumulativeDistances(geometry);
        const distanceM = Math.round(best.distance || measured[measured.length - 1] || 0);
        return {
          geometry,
          distanceM,
          durationS: Math.round(best.duration),
          trafficAware: false,
          ...(cumulativeDurationS ? { cumulativeDurationS } : {}),
          roads: [...new Set(steps.map((s) => s.name))],
          steps,
          source: sourceFrom(osrm, new Date().toISOString()),
        };
      },
    };
  },
};
