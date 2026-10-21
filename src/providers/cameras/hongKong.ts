import { buildUrl, upstreamFetch } from "@/lib/http";
import type { Camera } from "@/lib/types";
import { cachedList } from "@/providers/cameras/cachedList";
import type { ProviderDefinition } from "@/providers/types";

const TERMS_URL = "https://data.gov.hk/en/terms-and-conditions";
const ATTRIBUTION = "Traffic snapshots: Transport Department, HKSAR Government, via DATA.GOV.HK";
const IMAGE_HOST = "tdcctv.data.one.gov.hk";

function tag(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return match?.[1]?.trim();
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parses the Transport Department's camera location list. */
export function parseHongKongCameras(xml: string, providerId: string): Camera[] {
  const blocks = xml.match(/<image>[\s\S]*?<\/image>/g) ?? [];
  return blocks.flatMap((block): Camera[] => {
    const key = tag(block, "key");
    const lat = Number(tag(block, "latitude"));
    const lon = Number(tag(block, "longitude"));
    const mediaUrl = tag(block, "url");
    if (!key || !/^[A-Za-z0-9]+$/.test(key) || !mediaUrl) return [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const description = decodeXml(tag(block, "description") ?? key);
    const area = [tag(block, "district"), tag(block, "region")].filter(Boolean).map(String);
    return [
      {
        id: `hk-td-${key.toLowerCase()}`,
        name: description.replace(/\s*\[[^\]]*\]\s*$/, "") || key,
        ...(area.length ? { description: decodeXml(area.join(", ")) } : {}),
        country: "hk",
        city: "hong-kong",
        lat,
        lon,
        cameraType: "traffic",
        mediaType: "image",
        sourceUrl:
          "https://www.td.gov.hk/en/transport_in_hong_kong/its/its_achievements/traffic_snapshots/index.html",
        mediaUrl,
        operator: { name: "Transport Department, HKSAR Government", url: "https://www.td.gov.hk/" },
        license: {
          name: "DATA.GOV.HK Terms and Conditions",
          termsUrl: TERMS_URL,
          attribution: ATTRIBUTION,
        },
        permissions: { embedAllowed: true, aiAnalysisAllowed: true, commercialUseAllowed: true },
        refreshSeconds: 120,
        verification: { lastVerified: "2026-10-21", verifiedBy: "ai-street-situation maintainers" },
        providerId,
      },
    ];
  });
}

/**
 * Hong Kong Transport Department traffic snapshots (DATA.GOV.HK). Reuse is
 * free, including commercially, but the terms require users to indemnify the
 * government, so the provider is opt-in. See docs/sources.md.
 */
export const hongKongCameras: ProviderDefinition<"cameras"> = {
  id: "hk-td-snapshots",
  kind: "cameras",
  name: "Hong Kong Transport Department snapshots",
  homepage: "https://data.gov.hk/en-data/dataset/hk-td-tis_2-traffic-snapshot-images",
  attribution: ATTRIBUTION,
  requiredEnv: ["HK_TRAFFIC_CAMERAS_ENABLED"],
  isEnabled: (config) => config.HK_TRAFFIC_CAMERAS_ENABLED,
  create(config) {
    const fetchAll = async (): Promise<Camera[]> => {
      const url = buildUrl(
        config.HK_TRAFFIC_CAMERAS_URL,
        "td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.xml",
      );
      const response = await upstreamFetch(url, {
        providerId: hongKongCameras.id,
        headers: { Accept: "application/xml, text/xml" },
      });
      return parseHongKongCameras(await response.text(), hongKongCameras.id);
    };

    return {
      // Camera locations rarely change; the images themselves refresh every two minutes.
      list: cachedList(6 * 60 * 60_000, fetchAll),
      coverage: [[22.13, 113.8, 22.58, 114.45]],
      idPrefix: "hk-td-",
      allowedMediaHosts: () => [IMAGE_HOST],
    };
  },
};
