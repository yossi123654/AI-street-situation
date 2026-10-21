import { buildUrl, upstreamJson } from "@/lib/http";
import type { Camera } from "@/lib/types";
import { cachedList, todayIso } from "@/providers/cameras/cachedList";
import type { ProviderDefinition } from "@/providers/types";

interface TrafficImages {
  items?: Array<{
    cameras?: Array<{
      camera_id: string;
      image: string;
      timestamp?: string;
      location?: { latitude: number; longitude: number };
    }>;
  }>;
}

const TERMS_URL = "https://data.gov.sg/open-data-licence";
const IMAGE_HOST = "images.data.gov.sg";

/**
 * Singapore LTA traffic cameras via data.gov.sg. Open data under the
 * Singapore Open Data Licence v1.0 (commercial use allowed, attribution
 * required), no key. Image URLs change with every snapshot, so the list is
 * refreshed every minute. See docs/sources.md.
 */
export const singaporeCameras: ProviderDefinition<"cameras"> = {
  id: "sg-lta-traffic-images",
  kind: "cameras",
  name: "LTA traffic cameras (data.gov.sg)",
  homepage: "https://data.gov.sg/datasets?query=traffic+images",
  attribution:
    "Contains information from Traffic Images from LTA via data.gov.sg, made available under the Singapore Open Data Licence v1.0",
  requiredEnv: [],
  isEnabled: (config) => config.SG_TRAFFIC_CAMERAS_ENABLED,
  create(config) {
    const fetchAll = async (): Promise<Camera[]> => {
      const url = buildUrl(config.SG_TRAFFIC_IMAGES_URL, "v1/transport/traffic-images");
      const data = await upstreamJson<TrafficImages>(url, { providerId: singaporeCameras.id });
      // The licence asks for the date the data was accessed.
      const attribution = `Contains information from Traffic Images accessed on ${todayIso()} from LTA via data.gov.sg, made available under the Singapore Open Data Licence v1.0`;
      return (data.items?.[0]?.cameras ?? []).flatMap((camera): Camera[] => {
        const lat = camera.location?.latitude;
        const lon = camera.location?.longitude;
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lon) ||
          !/^[0-9A-Za-z]+$/.test(camera.camera_id)
        )
          return [];
        return [
          {
            id: `sg-lta-${camera.camera_id.toLowerCase()}`,
            name: `LTA traffic camera ${camera.camera_id}`,
            country: "sg",
            city: "singapore",
            lat: lat!,
            lon: lon!,
            cameraType: "traffic",
            mediaType: "image",
            sourceUrl:
              "https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html",
            mediaUrl: camera.image,
            operator: { name: "Land Transport Authority (LTA)", url: "https://www.lta.gov.sg/" },
            license: { name: "Singapore Open Data Licence v1.0", termsUrl: TERMS_URL, attribution },
            permissions: {
              embedAllowed: true,
              aiAnalysisAllowed: true,
              commercialUseAllowed: true,
            },
            refreshSeconds: 60,
            verification: {
              lastVerified: "2026-10-21",
              verifiedBy: "ai-street-situation maintainers",
            },
            providerId: singaporeCameras.id,
          },
        ];
      });
    };

    return {
      list: cachedList(60_000, fetchAll),
      coverage: [[1.15, 103.55, 1.5, 104.1]],
      idPrefix: "sg-lta-",
      allowedMediaHosts: () => [IMAGE_HOST],
    };
  },
};
