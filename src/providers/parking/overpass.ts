import { haversineMeters } from "@/lib/geo";
import { upstreamJson } from "@/lib/http";
import { createThrottle } from "@/lib/throttle";
import type { ParkingFacility, ParkingKind } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const PUBLIC_HOSTS = new Set(["overpass-api.de", "overpass.kumi.systems", "maps.mail.ru"]);

// The public Overpass instance is shared and often overloaded: one request at a time.
const publicThrottle = createThrottle(1000);

const KIND: Record<string, ParkingKind> = {
  surface: "surface",
  underground: "underground",
  "multi-storey": "multi-storey",
  street_side: "street-side",
  lane: "street-side",
  layby: "street-side",
  rooftop: "rooftop",
};

const toInt = (value: string | undefined): number | null => {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
};

/** Maps an OSM parking element to a ParkingFacility, or null if it is not publicly usable. */
export function elementToParking(
  element: OverpassElement,
  origin: { lat: number; lon: number },
): Omit<ParkingFacility, "source"> | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const access = tags.access;
  if (access === "private" || access === "no" || access === "delivery") return null;
  const fee = tags.fee === "yes" ? "yes" : tags.fee === "no" ? "no" : "unknown";
  return {
    id: `osm:${element.type}/${element.id}`,
    ...(tags.name ? { name: tags.name } : {}),
    lat,
    lon,
    distanceM: Math.round(haversineMeters(origin, { lat, lon })),
    kind: KIND[tags.parking ?? ""] ?? "unknown",
    capacity: toInt(tags.capacity),
    capacityDisabled: toInt(tags["capacity:disabled"]),
    fee,
    access:
      access === undefined
        ? "unknown"
        : ["yes", "permissive", "public"].includes(access)
          ? "public"
          : ["customers", "destination"].includes(access)
            ? "customers"
            : "unknown",
    ...(tags.opening_hours ? { openingHours: tags.opening_hours } : {}),
    ...(tags.operator ? { operator: tags.operator } : {}),
    ...(tags.maxstay ? { maxStay: tags.maxstay } : {}),
    parkAndRide: tags.park_ride !== undefined && tags.park_ride !== "no",
  };
}

/**
 * Parking facilities from OpenStreetMap via the Overpass API. OSM describes
 * where parking is, its size, fee and opening hours, but not live occupancy.
 */
export const overpassParking: ProviderDefinition<"parking"> = {
  id: "overpass",
  kind: "parking",
  name: "OpenStreetMap (Overpass API)",
  homepage: "https://wiki.openstreetmap.org/wiki/Overpass_API",
  attribution: "© OpenStreetMap contributors (ODbL)",
  requiredEnv: [],
  isEnabled: (config) => config.PARKING_ENABLED,
  create(config) {
    const isPublic = PUBLIC_HOSTS.has(new URL(config.OVERPASS_URL).hostname);
    return {
      async parking(point, radiusM) {
        const r = Math.round(Math.min(radiusM, 3000));
        const query = `[out:json][timeout:20];nwr["amenity"="parking"](around:${r},${point.lat.toFixed(6)},${point.lon.toFixed(6)});out center tags qt 200;`;
        const request = () =>
          upstreamJson<{ elements?: OverpassElement[]; osm3s?: { timestamp_osm_base?: string } }>(
            config.OVERPASS_URL,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ data: query }).toString(),
              providerId: overpassParking.id,
              timeoutMs: Math.max(config.UPSTREAM_TIMEOUT_MS, 25_000),
            },
          );
        const data = await (isPublic ? publicThrottle(request) : request());
        const observedAt = data.osm3s?.timestamp_osm_base;
        const source = sourceFrom(overpassParking, observedAt);
        return (data.elements ?? [])
          .map((element) => elementToParking(element, point))
          .filter((p): p is Omit<ParkingFacility, "source"> => p !== null && p.distanceM <= r)
          .map((p) => ({ ...p, source }));
      },
    };
  },
};
