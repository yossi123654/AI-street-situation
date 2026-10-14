import { buildUrl, upstreamJson } from "@/lib/http";
import { createThrottle } from "@/lib/throttle";
import type { LatLon, Place } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface NominatimResult {
  place_id: number;
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  display_name: string;
  category?: string;
  type?: string;
  addresstype?: string;
  boundingbox?: [string, string, string, string];
  name?: string;
  address?: Record<string, string>;
}

/**
 * Builds a short label from Nominatim's address details. display_name lists
 * every administrative level (and repeats some), which is hard to read.
 */
export function shortLabel(r: Pick<NominatimResult, "name" | "address" | "display_name">): string {
  const a = r.address ?? {};
  const road = a.road ? [a.road, a.house_number].filter(Boolean).join(" ") : undefined;
  const primary = r.name || road || a.pedestrian || a.square;
  const area = a.neighbourhood ?? a.suburb ?? a.quarter;
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
  const parts = [primary, primary !== road ? road : undefined, area, city, a.country];
  const unique = parts.filter(
    (part, index): part is string => Boolean(part) && parts.indexOf(part) === index,
  );
  return unique.length >= 2 ? unique.join(", ") : r.display_name;
}

const PUBLIC_HOST = "nominatim.openstreetmap.org";

// The public instance allows an absolute maximum of 1 request per second
// across all users of this server. Self-hosted instances are not throttled.
const publicThrottle = createThrottle(1100);

export const nominatim: ProviderDefinition<"geocoding"> = {
  id: "nominatim",
  kind: "geocoding",
  name: "Nominatim (OpenStreetMap)",
  homepage: "https://nominatim.org/",
  attribution: "© OpenStreetMap contributors (ODbL)",
  requiredEnv: [],
  isEnabled: () => true,
  create(config) {
    const base = config.NOMINATIM_URL;
    const isPublic = new URL(base).hostname === PUBLIC_HOST;
    if (isPublic) {
      console.info(
        "[geocoding] Using the public Nominatim instance. You are responsible for following its usage policy " +
          "(https://operations.osmfoundation.org/policies/nominatim/): set APP_USER_AGENT to identify your deployment, " +
          "and switch NOMINATIM_URL to your own instance or another provider if your traffic is more than moderate.",
      );
    }
    const run = <T>(task: () => Promise<T>) => (isPublic ? publicThrottle(task) : task());
    const common = {
      format: "jsonv2",
      addressdetails: 1,
      email: config.NOMINATIM_EMAIL,
    };

    const toPlace = (r: NominatimResult): Place => {
      const bb = r.boundingbox?.map(Number);
      const label = shortLabel(r);
      return {
        id: `nominatim:${r.osm_type ?? "x"}${r.osm_id ?? r.place_id}`,
        label,
        ...(label !== r.display_name ? { fullLabel: r.display_name } : {}),
        lat: Number(r.lat),
        lon: Number(r.lon),
        kind: r.addresstype ?? r.type,
        // Nominatim order: [south, north, west, east]
        ...(bb && bb.length === 4 && bb.every(Number.isFinite)
          ? { bbox: [bb[0]!, bb[2]!, bb[1]!, bb[3]!] as [number, number, number, number] }
          : {}),
        source: sourceFrom(nominatim),
      };
    };

    return {
      async search(query, locale) {
        const url = buildUrl(base, "search", {
          ...common,
          q: query,
          limit: 6,
          "accept-language": locale,
          countrycodes: config.GEOCODING_COUNTRY_CODES,
        });
        const results = await run(() =>
          upstreamJson<NominatimResult[]>(url, { providerId: nominatim.id }),
        );
        return results.map(toPlace).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      },
      async reverse(point: LatLon, locale) {
        const url = buildUrl(base, "reverse", {
          ...common,
          lat: point.lat,
          lon: point.lon,
          zoom: 18,
          "accept-language": locale,
        });
        const result = await run(() =>
          upstreamJson<NominatimResult | { error: string }>(url, { providerId: nominatim.id }),
        );
        if ("error" in result) return null;
        return toPlace(result);
      },
    };
  },
};
