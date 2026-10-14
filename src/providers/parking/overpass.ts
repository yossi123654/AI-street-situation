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

const PUBLIC_HOSTS = new Set([
  "overpass-api.de",
  "maps.mail.ru",
  "overpass.private.coffee",
  "overpass.kumi.systems",
]);

// Public instances are shared and often overloaded: one request at a time from this server.
const publicThrottle = createThrottle(1000);

/** After an error, leave an instance alone for 30 s (as the Overpass usage policy asks). */
const COOLDOWN_MS = 30_000;
const cooldownUntil = new Map<string, number>();

/** Test helper. */
export function resetOverpassCooldowns(): void {
  cooldownUntil.clear();
}

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
    const endpoints = config.OVERPASS_URLS;
    const timeoutMs = Math.max(config.UPSTREAM_TIMEOUT_MS, 20_000);

    type OverpassResponse = {
      elements?: OverpassElement[];
      osm3s?: { timestamp_osm_base?: string };
    };

    /** Tries each endpoint in order, skipping ones that recently failed. */
    const query = async (body: string): Promise<OverpassResponse> => {
      const now = Date.now();
      const available = endpoints.filter((url) => (cooldownUntil.get(url) ?? 0) <= now);
      // If every instance is cooling down, still try the first one rather than failing outright.
      const candidates = available.length > 0 ? available : endpoints.slice(0, 1);
      let lastError: unknown;
      for (const url of candidates) {
        const request = () =>
          upstreamJson<OverpassResponse>(url, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            providerId: overpassParking.id,
            timeoutMs,
          });
        try {
          return await (PUBLIC_HOSTS.has(new URL(url).hostname)
            ? publicThrottle(request)
            : request());
        } catch (error) {
          lastError = error;
          cooldownUntil.set(url, Date.now() + COOLDOWN_MS);
          console.warn(
            `[parking] ${new URL(url).hostname} failed, trying the next Overpass instance`,
          );
        }
      }
      throw lastError;
    };

    return {
      async parking(point, radiusM) {
        const r = Math.round(Math.min(radiusM, 3000));
        const ql = `[out:json][timeout:20];nwr["amenity"="parking"](around:${r},${point.lat.toFixed(6)},${point.lon.toFixed(6)});out center tags qt 200;`;
        const data = await query(new URLSearchParams({ data: ql }).toString());
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
