import { haversineMeters } from "@/lib/geo";
import { buildUrl, upstreamJson } from "@/lib/http";
import type { Incident, IncidentSeverity, IncidentType } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface HereIncidentsResponse {
  sourceUpdated?: string;
  results?: Array<{
    location?: {
      description?: string;
      shape?: { links?: Array<{ points?: Array<{ lat: number; lng: number }> }> };
    };
    incidentDetails?: {
      id?: string;
      type?: string;
      criticality?: string;
      roadClosed?: boolean;
      startTime?: string;
      endTime?: string;
      description?: { value?: string };
      summary?: { value?: string };
    };
  }>;
}

const TYPES: Record<string, IncidentType> = {
  accident: "accident",
  congestion: "congestion",
  construction: "roadworks",
  disabledVehicle: "breakdown",
  plannedEvent: "event",
  roadHazard: "hazard",
  roadClosure: "closure",
  laneRestriction: "closure",
  weather: "weather",
};

const CRITICALITY: Record<string, IncidentSeverity> = {
  critical: "major",
  major: "major",
  minor: "moderate",
  lowImpact: "minor",
};

export const hereIncidents: ProviderDefinition<"incidents"> = {
  id: "here",
  kind: "incidents",
  name: "HERE Traffic Incidents",
  homepage: "https://www.here.com/docs/bundle/traffic-api-developer-guide-v7/page/README.html",
  attribution: "Incidents © HERE",
  group: "commercial-traffic",
  requiredEnv: ["HERE_API_KEY"],
  isEnabled: (config) => Boolean(config.HERE_API_KEY),
  create(config) {
    return {
      async incidents(point, radiusM, locale) {
        const url = buildUrl(config.HERE_TRAFFIC_URL, "v7/incidents", {
          in: `circle:${point.lat},${point.lon};r=${Math.round(radiusM)}`,
          locationReferencing: "shape",
          lang: locale === "he" ? "he-IL" : "en-US",
          apiKey: config.HERE_API_KEY,
        });
        const data = await upstreamJson<HereIncidentsResponse>(url, {
          providerId: hereIncidents.id,
        });
        const observedAt = data.sourceUpdated ?? new Date().toISOString();
        return (data.results ?? []).map((r, index): Incident => {
          const d = r.incidentDetails ?? {};
          const firstPoint = r.location?.shape?.links?.[0]?.points?.[0];
          return {
            id: `here:${d.id ?? index}`,
            type: TYPES[d.type ?? ""] ?? "other",
            severity: CRITICALITY[d.criticality ?? ""] ?? "unknown",
            description: d.description?.value ?? d.summary?.value ?? "",
            ...(r.location?.description ? { roadName: r.location.description } : {}),
            ...(firstPoint
              ? {
                  lat: firstPoint.lat,
                  lon: firstPoint.lng,
                  distanceM: Math.round(
                    haversineMeters(point, { lat: firstPoint.lat, lon: firstPoint.lng }),
                  ),
                }
              : {}),
            ...(d.startTime ? { startTime: d.startTime } : {}),
            ...(d.endTime ? { endTime: d.endTime } : {}),
            roadClosed: Boolean(d.roadClosed),
            source: sourceFrom(hereIncidents, observedAt),
          };
        });
      },
    };
  },
};
