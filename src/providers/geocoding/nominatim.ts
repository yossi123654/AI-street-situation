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
    const run = <T>(task: () => Promise<T>) => (isPublic ? publicThrottle(task) : task());
    const common = {
      format: "jsonv2",
      email: config.NOMINATIM_EMAIL,
    };

    const toPlace = (r: NominatimResult): Place => {
      const bb = r.boundingbox?.map(Number);
      return {
        id: `nominatim:${r.osm_type ?? "x"}${r.osm_id ?? r.place_id}`,
        label: r.display_name,
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
