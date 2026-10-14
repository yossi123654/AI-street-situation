import { buildUrl, upstreamJson } from "@/lib/http";
import type { Locale, Place } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    type?: string;
    extent?: [number, number, number, number];
  };
}

// Photon supports a fixed set of languages; others fall back to local names.
const PHOTON_LANGS = new Set(["en", "de", "fr"]);
const photonLang = (locale: Locale) => (PHOTON_LANGS.has(locale) ? locale : "default");

function label(p: PhotonFeature["properties"]): string {
  const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : undefined;
  const parts = [p.name, street, p.city, p.state, p.country].filter(
    (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index,
  );
  return parts.join(", ");
}

export const photon: ProviderDefinition<"geocoding"> = {
  id: "photon",
  kind: "geocoding",
  name: "Photon (OpenStreetMap)",
  homepage: "https://photon.komoot.io/",
  attribution: "© OpenStreetMap contributors (ODbL)",
  requiredEnv: ["GEOCODING_PROVIDER=photon"],
  isEnabled: (config) => config.GEOCODING_PROVIDER === "photon",
  create(config) {
    const toPlace = (f: PhotonFeature): Place => {
      const [lon, lat] = f.geometry.coordinates;
      const e = f.properties.extent;
      return {
        id: `photon:${f.properties.osm_type ?? "x"}${f.properties.osm_id ?? `${lat},${lon}`}`,
        label: label(f.properties) || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        lat,
        lon,
        kind: f.properties.type,
        // Photon extent: [minLon, maxLat, maxLon, minLat]
        ...(e ? { bbox: [e[3], e[0], e[1], e[2]] as [number, number, number, number] } : {}),
        source: sourceFrom(photon),
      };
    };
    return {
      async search(query, locale) {
        const url = buildUrl(config.PHOTON_URL, "api", {
          q: query,
          limit: 6,
          lang: photonLang(locale),
        });
        const data = await upstreamJson<{ features: PhotonFeature[] }>(url, {
          providerId: photon.id,
        });
        return (data.features ?? []).map(toPlace);
      },
      async reverse(point, locale) {
        const url = buildUrl(config.PHOTON_URL, "reverse", {
          lat: point.lat,
          lon: point.lon,
          lang: photonLang(locale),
        });
        const data = await upstreamJson<{ features: PhotonFeature[] }>(url, {
          providerId: photon.id,
        });
        const first = data.features?.[0];
        return first ? toPlace(first) : null;
      },
    };
  },
};
