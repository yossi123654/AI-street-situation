import { boundingBox } from "@/lib/geo";
import { buildUrl, upstreamJson } from "@/lib/http";
import type { LatLon } from "@/lib/types";
import type { ProviderDefinition, ProviderPhoto } from "@/providers/types";

interface PanoramaxItem {
  id: string;
  geometry?: { coordinates?: number[] };
  properties?: {
    datetime?: string;
    license?: string;
    "view:azimuth"?: number;
    "geovisio:producer"?: string;
    "pers:interior_orientation"?: { field_of_view?: number };
  };
  assets?: { thumb?: { href?: string }; sd?: { href?: string } };
  links?: Array<{ rel?: string; href?: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "CC-BY-SA-4.0" -> "CC BY-SA 4.0"; other SPDX-style ids are shown as they are. */
export function licenseName(spdx: string | undefined): string {
  if (!spdx) return "See source";
  const cc = spdx.match(/^CC-(BY(?:-SA|-ND|-NC|-NC-SA|-NC-ND)?)-(\d\.\d)$/i);
  if (cc) return `CC ${cc[1]!.toUpperCase()} ${cc[2]}`;
  if (/^CC0-1\.0$/i.test(spdx)) return "CC0 1.0";
  return spdx;
}

export function mapPanoramaxItem(item: PanoramaxItem, viewerBase: string): ProviderPhoto | null {
  const [lon, lat] = item.geometry?.coordinates ?? [];
  const thumbUrl = item.assets?.thumb?.href;
  const largeUrl = item.assets?.sd?.href ?? thumbUrl;
  if (!UUID.test(item.id) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!thumbUrl || !largeUrl) return null;
  const props = item.properties ?? {};
  const licenseUrl = item.links?.find((link) => link.rel === "license")?.href;
  const heading = props["view:azimuth"];
  const fov = props["pers:interior_orientation"]?.field_of_view;
  return {
    id: `panoramax-${item.id.toLowerCase()}`,
    providerId: panoramax.id,
    kind: "street",
    lat: lat!,
    lon: lon!,
    ...(props.datetime ? { capturedAt: props.datetime } : {}),
    ...(Number.isFinite(heading) ? { headingDeg: Math.round(heading!) % 360 } : {}),
    ...(fov === 360 ? { panorama: true } : {}),
    ...(props["geovisio:producer"] ? { author: props["geovisio:producer"] } : {}),
    license: {
      name: licenseName(props.license),
      ...(licenseUrl?.startsWith("https://") ? { url: licenseUrl } : {}),
    },
    pageUrl: `${viewerBase}/#focus=pic&pic=${item.id}&map=18/${lat}/${lon}`,
    thumbUrl,
    largeUrl,
  };
}

/**
 * Panoramax, the open and federated street-level imagery commons. The
 * meta-catalog (api.panoramax.xyz) searches every instance; pictures are
 * served by the instance that hosts them. Faces and licence plates are
 * blurred by Panoramax before publication. No key. See docs/sources.md.
 */
export const panoramax: ProviderDefinition<"photos"> = {
  id: "panoramax",
  kind: "photos",
  name: "Panoramax",
  homepage: "https://panoramax.fr/",
  attribution: "Street-level imagery: Panoramax contributors",
  requiredEnv: [],
  isEnabled: (config) => config.PANORAMAX_ENABLED,
  create(config) {
    const base = config.PANORAMAX_URL.replace(/\/+$/, "");
    return {
      async near(point: LatLon, radiusM: number) {
        const [south, west, north, east] = boundingBox(point, radiusM);
        const url = buildUrl(base, "api/search", {
          bbox: [west, south, east, north].map((v) => v.toFixed(6)).join(","),
          limit: "100",
          // Newest first, so a busy street shows what it looks like now.
          sortby: "-ts",
        });
        const data = await upstreamJson<{ features?: PanoramaxItem[] }>(url, {
          providerId: panoramax.id,
        });
        return (data.features ?? [])
          .map((item) => mapPanoramaxItem(item, base))
          .filter((photo): photo is ProviderPhoto => photo !== null);
      },
      // Pictures live on many federated instances, so any public https host
      // is accepted; the URLs only ever come from the meta-catalog.
    };
  },
};
