import { boundingBox, haversineMeters } from "@/lib/geo";
import { buildUrl, upstreamJson } from "@/lib/http";
import type { Incident, IncidentSeverity, IncidentType, Locale } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface TomTomIncident {
  type?: string;
  geometry?: { type: "Point" | "LineString"; coordinates: number[] | number[][] };
  properties?: {
    id?: string;
    iconCategory?: number;
    magnitudeOfDelay?: number;
    events?: Array<{ description?: string; code?: number }>;
    startTime?: string;
    endTime?: string;
    from?: string;
    to?: string;
    roadNumbers?: string[];
  };
}

// https://developer.tomtom.com/traffic-api/documentation/traffic-incidents/incident-details
const ICON_CATEGORY: Record<number, IncidentType> = {
  1: "accident",
  2: "weather", // fog
  3: "hazard", // dangerous conditions
  4: "weather", // rain
  5: "weather", // ice
  6: "congestion", // jam
  7: "closure", // lane closed
  8: "closure", // road closed
  9: "roadworks",
  10: "weather", // wind
  11: "weather", // flooding
  14: "breakdown",
};

const MAGNITUDE: Record<number, IncidentSeverity> = {
  1: "minor",
  2: "moderate",
  3: "major",
  4: "major",
};

const FIELDS =
  "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,roadNumbers}}}";

const TOMTOM_LANG: Record<Locale, string> = { he: "he-IL", en: "en-GB" };

export const tomtomIncidents: ProviderDefinition<"incidents"> = {
  id: "tomtom",
  kind: "incidents",
  name: "TomTom Traffic Incidents",
  homepage: "https://developer.tomtom.com/traffic-api/documentation",
  attribution: "Incidents © TomTom",
  requiredEnv: ["TOMTOM_API_KEY"],
  isEnabled: (config) => Boolean(config.TOMTOM_API_KEY),
  create(config) {
    return {
      async incidents(point, radiusM, locale) {
        const [minLat, minLon, maxLat, maxLon] = boundingBox(point, radiusM);
        const url = buildUrl(config.TOMTOM_URL, "traffic/services/5/incidentDetails", {
          bbox: [minLon, minLat, maxLon, maxLat].map((v) => v.toFixed(5)).join(","),
          fields: FIELDS,
          language: TOMTOM_LANG[locale],
          timeValidityFilter: "present",
          key: config.TOMTOM_API_KEY,
        });
        const data = await upstreamJson<{ incidents?: TomTomIncident[] }>(url, {
          providerId: tomtomIncidents.id,
        });
        const fetchedAt = new Date().toISOString();
        return (data.incidents ?? []).map((incident, index): Incident => {
          const p = incident.properties ?? {};
          const coords = incident.geometry?.coordinates;
          const first = Array.isArray(coords?.[0])
            ? (coords[0] as number[])
            : (coords as number[] | undefined);
          const lon = first?.[0];
          const lat = first?.[1];
          const hasPoint = typeof lat === "number" && typeof lon === "number";
          const category = p.iconCategory ?? 0;
          const road = [p.roadNumbers?.join("/"), p.from && p.to ? `${p.from} → ${p.to}` : p.from]
            .filter(Boolean)
            .join(" ");
          return {
            id: `tomtom:${p.id ?? index}`,
            type: ICON_CATEGORY[category] ?? "other",
            severity: MAGNITUDE[p.magnitudeOfDelay ?? 0] ?? "unknown",
            description:
              p.events
                ?.map((e) => e.description)
                .filter(Boolean)
                .join("; ") ?? "",
            ...(road ? { roadName: road } : {}),
            ...(hasPoint
              ? { lat, lon, distanceM: Math.round(haversineMeters(point, { lat, lon })) }
              : {}),
            ...(p.startTime ? { startTime: p.startTime } : {}),
            ...(p.endTime ? { endTime: p.endTime } : {}),
            roadClosed: category === 8,
            source: sourceFrom(tomtomIncidents, fetchedAt),
          };
        });
      },
    };
  },
};
