import { buildUrl, upstreamJson } from "@/lib/http";
import type { Camera } from "@/lib/types";
import type { ProviderDefinition } from "@/providers/types";

interface TflPlace {
  id: string;
  commonName?: string;
  lat: number;
  lon: number;
  additionalProperties?: Array<{ key: string; value: string; modified?: string }>;
}

const TERMS_URL = "https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service";

/**
 * Transport for London JamCams (traffic cameras), via the TfL Unified API.
 * Licensed under TfL's Transport Data Service terms (based on the Open
 * Government Licence v2.0); requires the attribution "Powered by TfL Open Data".
 * See docs/sources.md.
 */
export const tflJamCams: ProviderDefinition<"cameras"> = {
  id: "tfl-jamcams",
  kind: "cameras",
  name: "TfL JamCams",
  homepage: "https://tfl.gov.uk/info-for/open-data-users/our-open-data",
  attribution: "Powered by TfL Open Data",
  requiredEnv: ["TFL_APP_KEY"],
  isEnabled: (config) => Boolean(config.TFL_APP_KEY),
  create(config) {
    let cache: { at: number; cameras: Promise<Camera[]> } | undefined;

    const fetchAll = async (): Promise<Camera[]> => {
      const url = buildUrl(config.TFL_API_URL, "Place/Type/JamCam", {
        app_key: config.TFL_APP_KEY,
      });
      const places = await upstreamJson<TflPlace[]>(url, { providerId: tflJamCams.id });
      return places.flatMap((place): Camera[] => {
        const props = new Map((place.additionalProperties ?? []).map((p) => [p.key, p.value]));
        const imageUrl = props.get("imageUrl");
        if (!imageUrl || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return [];
        const slug = place.id
          .replace(/^JamCams_/i, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");
        return [
          {
            id: `gb-tfl-${slug}`,
            name: place.commonName ?? place.id,
            ...(props.get("view") ? { description: props.get("view") } : {}),
            country: "gb",
            city: "london",
            lat: place.lat,
            lon: place.lon,
            cameraType: "traffic",
            mediaType: "image",
            sourceUrl: "https://tfl.gov.uk/traffic/status/",
            mediaUrl: imageUrl,
            operator: { name: "Transport for London", url: "https://tfl.gov.uk/" },
            license: {
              name: "TfL Transport Data Service terms (based on OGL v2.0)",
              termsUrl: TERMS_URL,
              attribution: "Powered by TfL Open Data",
            },
            permissions: {
              embedAllowed: true,
              aiAnalysisAllowed: true,
              commercialUseAllowed: "unknown",
            },
            refreshSeconds: 300,
            verification: {
              lastVerified: "2026-10-14",
              verifiedBy: "ai-street-situation maintainers",
            },
            providerId: tflJamCams.id,
            ...(props.has("available") ? { available: props.get("available") === "true" } : {}),
          },
        ];
      });
    };

    return {
      list() {
        if (!cache || Date.now() - cache.at > 10 * 60_000) {
          const cameras = fetchAll();
          cache = { at: Date.now(), cameras };
          // Do not keep a failed request cached.
          cameras.catch(() => {
            if (cache?.cameras === cameras) cache = undefined;
          });
        }
        return cache.cameras;
      },
      // TfL's bucket only: the S3 host alone would admit any bucket on it.
      allowedMediaHosts: () => [
        "s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/",
        "jamcams.tfl.gov.uk",
      ],
    };
  },
};
