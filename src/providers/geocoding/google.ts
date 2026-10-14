import { UpstreamError, buildUrl, upstreamJson } from "@/lib/http";
import type { Place } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface GoogleResult {
  place_id: string;
  formatted_address: string;
  types?: string[];
  geometry: {
    location: { lat: number; lng: number };
    viewport?: { northeast: { lat: number; lng: number }; southwest: { lat: number; lng: number } };
  };
}

interface GoogleResponse {
  status: string;
  results: GoogleResult[];
  error_message?: string;
}

export const google: ProviderDefinition<"geocoding"> = {
  id: "google",
  kind: "geocoding",
  name: "Google Geocoding",
  homepage: "https://developers.google.com/maps/documentation/geocoding",
  attribution: "Geocoding by Google",
  requiredEnv: ["GEOCODING_PROVIDER=google", "GOOGLE_MAPS_API_KEY"],
  isEnabled: (config) =>
    config.GEOCODING_PROVIDER === "google" && Boolean(config.GOOGLE_MAPS_API_KEY),
  create(config) {
    const key = config.GOOGLE_MAPS_API_KEY!;
    const toPlace = (r: GoogleResult): Place => {
      const v = r.geometry.viewport;
      return {
        id: `google:${r.place_id}`,
        label: r.formatted_address,
        lat: r.geometry.location.lat,
        lon: r.geometry.location.lng,
        kind: r.types?.[0],
        ...(v
          ? {
              bbox: [v.southwest.lat, v.southwest.lng, v.northeast.lat, v.northeast.lng] as [
                number,
                number,
                number,
                number,
              ],
            }
          : {}),
        source: sourceFrom(google),
      };
    };
    const call = async (params: Record<string, string>) => {
      const url = buildUrl(config.GOOGLE_GEOCODING_URL, "maps/api/geocode/json", {
        ...params,
        key,
      });
      const data = await upstreamJson<GoogleResponse>(url, { providerId: google.id });
      if (data.status === "ZERO_RESULTS") return [];
      if (data.status !== "OK") {
        throw new UpstreamError(`google geocoding status ${data.status}`, undefined, google.id);
      }
      return data.results.map(toPlace);
    };
    return {
      search: (query, locale) => call({ address: query, language: locale }),
      async reverse(point, locale) {
        const results = await call({ latlng: `${point.lat},${point.lon}`, language: locale });
        return results[0] ?? null;
      },
    };
  },
};
