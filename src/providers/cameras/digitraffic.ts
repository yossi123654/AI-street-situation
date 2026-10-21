import { buildUrl, upstreamJson } from "@/lib/http";
import type { Camera } from "@/lib/types";
import { cachedList } from "@/providers/cameras/cachedList";
import type { ProviderDefinition } from "@/providers/types";

interface StationCollection {
  features: Array<{
    id: string;
    geometry?: { coordinates?: number[] };
    properties: {
      id: string;
      name: string;
      collectionStatus?: string;
      presets?: Array<{ id: string; inCollection?: boolean }>;
    };
  }>;
}

const TERMS_URL = "https://www.digitraffic.fi/en/terms-of-service/";
const ATTRIBUTION = "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY";
const IMAGE_HOST = "weathercam.digitraffic.fi";
const ROAD_PREFIX = /^(vt|kt|st|mt|yt|pt)(\d+)$/i;

/** "vt1_Espoo_Kehä_III" -> "Road 1 · Espoo Kehä III". */
export function digitrafficStationName(raw: string): string {
  const [first = "", ...rest] = raw.split("_");
  const road = first.match(ROAD_PREFIX);
  const place = (road ? rest : [first, ...rest]).join(" ").trim();
  if (!road) return place || raw;
  return place ? `Road ${road[2]} · ${place}` : `Road ${road[2]}`;
}

/** Preset ids end in a direction code: 1 and 2 are the two driving directions, 9 the road surface. */
function presetDescription(presetId: string): string {
  const code = presetId.slice(-2);
  if (code === "01") return "Camera view: direction 1";
  if (code === "02") return "Camera view: direction 2";
  if (code === "09") return "Camera view: road surface";
  return `Camera view ${Number(code) || code}`;
}

/**
 * Finnish road weather cameras from Fintraffic's Digitraffic service. Open
 * data under CC BY 4.0, no key; Digitraffic asks clients to identify
 * themselves with a Digitraffic-User header and to accept gzip.
 * See docs/sources.md.
 */
export const digitrafficCameras: ProviderDefinition<"cameras"> = {
  id: "digitraffic-weathercams",
  kind: "cameras",
  name: "Fintraffic road weather cameras",
  homepage: "https://www.digitraffic.fi/en/road-traffic/",
  attribution: ATTRIBUTION,
  requiredEnv: [],
  isEnabled: (config) => config.DIGITRAFFIC_CAMERAS_ENABLED,
  create(config) {
    const fetchAll = async (): Promise<Camera[]> => {
      const url = buildUrl(config.DIGITRAFFIC_URL, "api/weathercam/v1/stations");
      const data = await upstreamJson<StationCollection>(url, {
        providerId: digitrafficCameras.id,
        headers: { "Digitraffic-User": "ai-street-situation", "Accept-Encoding": "gzip" },
      });
      return (data.features ?? []).flatMap((feature): Camera[] => {
        const [lon, lat] = feature.geometry?.coordinates ?? [];
        const props = feature.properties;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        if (props.collectionStatus && props.collectionStatus !== "GATHERING") return [];
        const stationName = digitrafficStationName(props.name);
        return (props.presets ?? [])
          .filter((preset) => preset.inCollection !== false && /^[A-Z0-9]+$/i.test(preset.id))
          .map((preset): Camera => ({
            id: `fi-digitraffic-${preset.id.toLowerCase()}`,
            name: stationName,
            description: presetDescription(preset.id),
            country: "fi",
            city: "finland",
            lat: lat!,
            lon: lon!,
            cameraType: "traffic",
            mediaType: "image",
            sourceUrl: "https://liikennetilanne.fintraffic.fi/",
            mediaUrl: `https://${IMAGE_HOST}/${preset.id}.jpg`,
            operator: { name: "Fintraffic", url: "https://www.fintraffic.fi/en" },
            license: {
              name: "Creative Commons Attribution 4.0 (CC BY 4.0)",
              termsUrl: TERMS_URL,
              attribution: ATTRIBUTION,
            },
            permissions: {
              embedAllowed: true,
              aiAnalysisAllowed: true,
              commercialUseAllowed: true,
            },
            refreshSeconds: 600,
            verification: {
              lastVerified: "2026-10-21",
              verifiedBy: "ai-street-situation maintainers",
            },
            providerId: digitrafficCameras.id,
          }));
      });
    };

    return {
      list: cachedList(60 * 60_000, fetchAll),
      coverage: [[59.3, 19.0, 70.2, 31.8]],
      idPrefix: "fi-digitraffic-",
      allowedMediaHosts: () => [IMAGE_HOST],
    };
  },
};
