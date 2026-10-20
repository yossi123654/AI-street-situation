import { cumulativeDistances, nearestVertex, thinLine } from "@/lib/routeGeometry";
import type { TripFacility, TripStop, TripStopKind } from "@/lib/types";
import { createOverpassClient, type OverpassElement } from "@/providers/overpass/client";
import type { ProviderDefinition } from "@/providers/types";

const FACILITY_TAGS: Array<[string, string, TripFacility]> = [
  // [tag, value that means "yes", facility label]
  ["toilets", "yes", "toilets"],
  ["shop", "*", "shop"],
  ["amenity", "cafe", "cafe"],
  ["amenity", "restaurant", "restaurant"],
  ["car_wash", "yes", "car_wash"],
  ["compressed_air", "yes", "compressed_air"],
  ["fuel:electricity", "yes", "charging"],
];

/** Maps an OSM element to a stop, or null if it is not a public roadside stop. */
export function elementToStop(
  element: OverpassElement,
  line: Array<[number, number]>,
  cumulative: number[],
): TripStop | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  if (tags.access === "private" || tags.access === "no") return null;
  let kind: TripStopKind;
  if (tags.amenity === "fuel") kind = "fuel";
  else if (tags.amenity === "charging_station") kind = "charging";
  else if (tags.highway === "services") kind = "services";
  else if (tags.highway === "rest_area") kind = "rest_area";
  else return null;
  const nearest = nearestVertex(line, { lat, lon });
  if (nearest.index < 0) return null;
  const facilities = FACILITY_TAGS.filter(
    ([tag, value]) => tags[tag] && (value === "*" || tags[tag] === value),
  ).map(([, , label]) => label);
  return {
    id: `osm:${element.type}/${element.id}`,
    kind,
    ...(tags.name ? { name: tags.name } : {}),
    ...(tags.brand ? { brand: tags.brand } : {}),
    lat,
    lon,
    distanceAlongM: Math.round(cumulative[nearest.index] ?? 0),
    detourM: Math.round(nearest.distanceM),
    ...(tags.opening_hours ? { openingHours: tags.opening_hours } : {}),
    facilities: [...new Set(facilities)],
  };
}

/** Fuel stations, EV chargers, rest areas and motorway services along a route, from OpenStreetMap. */
export const overpassStops: ProviderDefinition<"stops"> = {
  id: "overpass-stops",
  kind: "stops",
  name: "OpenStreetMap stops (Overpass API)",
  homepage: "https://wiki.openstreetmap.org/wiki/Overpass_API",
  attribution: "© OpenStreetMap contributors (ODbL)",
  requiredEnv: [],
  isEnabled: (config) => config.TRIP_STOPS_ENABLED,
  create(config) {
    const query = createOverpassClient(config, overpassStops.id);
    return {
      async stopsAlong(line, radiusM) {
        if (line.length < 2) return [];
        // Keep the corridor polyline short: Overpass evaluates `around` against every vertex.
        const corridor = thinLine(line, 80)
          .map(([lat, lon]) => `${lat.toFixed(5)},${lon.toFixed(5)}`)
          .join(",");
        const r = Math.round(Math.min(radiusM, 1000));
        const ql =
          `[out:json][timeout:25];(` +
          `nwr["amenity"="fuel"](around:${r},${corridor});` +
          `nwr["amenity"="charging_station"]["motorcar"!="no"](around:${r},${corridor});` +
          `nwr["highway"~"^(rest_area|services)$"](around:${r},${corridor});` +
          `);out center tags qt 120;`;
        const data = await query(ql);
        const cumulative = cumulativeDistances(line);
        // Overpass already filters by the corridor; enforce it here too (the detour is
        // measured to the nearest vertex, so allow some slack over the corridor radius).
        const maxDetourM = r * 1.5;
        return (data.elements ?? [])
          .map((element) => elementToStop(element, line, cumulative))
          .filter((stop): stop is TripStop => stop !== null && stop.detourM <= maxDetourM)
          .sort((a, b) => a.distanceAlongM - b.distanceAlongM);
      },
    };
  },
};
