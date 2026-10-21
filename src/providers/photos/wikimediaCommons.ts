import { UpstreamError, buildUrl, upstreamJson } from "@/lib/http";
import { createThrottle } from "@/lib/throttle";
import type { LatLon } from "@/lib/types";
import type { ProviderDefinition, ProviderPhoto } from "@/providers/types";

interface CommonsPage {
  pageid: number;
  title: string;
  coordinates?: Array<{ lat: number; lon: number }>;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    descriptionurl?: string;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Plain text from a Commons metadata value, which is often HTML. */
export function stripHtml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 200) : undefined;
}

/** Commons "DateTimeOriginal" is free text; only clear dates are used. */
export function parseCommonsDate(value: string | undefined): string | undefined {
  const text = stripHtml(value);
  const match = text?.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return undefined;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = match;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function mapCommonsPage(page: CommonsPage): ProviderPhoto | null {
  const info = page.imageinfo?.[0];
  const coords = page.coordinates?.[0];
  if (!info || !coords || !info.thumburl || !info.descriptionurl) return null;
  if (!IMAGE_MIME.has(info.mime ?? "") || !Number.isInteger(page.pageid)) return null;
  const meta = info.extmetadata ?? {};
  const licenseName = stripHtml(meta.LicenseShortName?.value) ?? "See source";
  const licenseUrl = meta.LicenseUrl?.value;
  const author = stripHtml(meta.Artist?.value);
  const capturedAt = parseCommonsDate(meta.DateTimeOriginal?.value);
  const title =
    stripHtml(meta.ObjectName?.value) ??
    page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
  return {
    id: `commons-${page.pageid}`,
    providerId: wikimediaCommons.id,
    kind: "photo",
    lat: coords.lat,
    lon: coords.lon,
    ...(capturedAt ? { capturedAt } : {}),
    title,
    ...(author ? { author } : {}),
    license: {
      name: licenseName,
      ...(licenseUrl?.startsWith("https://") || licenseUrl?.startsWith("http://")
        ? { url: licenseUrl }
        : {}),
    },
    pageUrl: info.descriptionurl,
    thumbUrl: info.thumburl,
    // The 640 px thumbnail is also used in the viewer: Commons originals can be huge.
    largeUrl: info.thumburl,
  };
}

// Wikimedia asks API clients to identify themselves and keep concurrency low;
// identified clients get 200 requests a minute.
const throttle = createThrottle(400);
/** After HTTP 429, stay away for a while instead of adding to the load. */
const COOLDOWN_MS = 2 * 60_000;

/**
 * Geotagged photos on Wikimedia Commons, under the free licence chosen by
 * each author (shown with every photo). No key. See docs/sources.md.
 */
export const wikimediaCommons: ProviderDefinition<"photos"> = {
  id: "wikimedia-commons",
  kind: "photos",
  name: "Wikimedia Commons",
  homepage: "https://commons.wikimedia.org/",
  attribution: "Photos: Wikimedia Commons contributors (licence per photo)",
  requiredEnv: [],
  isEnabled: (config) => config.WIKIMEDIA_COMMONS_ENABLED,
  create(config) {
    let blockedUntil = 0;
    return {
      async near(point: LatLon, radiusM: number) {
        if (Date.now() < blockedUntil) {
          throw new UpstreamError("wikimedia-commons is rate limiting us; retrying later", 429);
        }
        const url = buildUrl(config.WIKIMEDIA_COMMONS_URL, "w/api.php", {
          action: "query",
          format: "json",
          formatversion: "2",
          generator: "geosearch",
          ggscoord: `${point.lat.toFixed(6)}|${point.lon.toFixed(6)}`,
          ggsradius: String(Math.min(Math.round(radiusM), 10_000)),
          ggsnamespace: "6",
          ggslimit: "30",
          prop: "imageinfo|coordinates",
          iiprop: "url|mime|extmetadata",
          iiurlwidth: "640",
          iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|DateTimeOriginal|ObjectName",
        });
        const data = await throttle(() =>
          upstreamJson<{ query?: { pages?: CommonsPage[] } }>(url, {
            providerId: wikimediaCommons.id,
          }),
        ).catch((error: unknown) => {
          if (error instanceof UpstreamError && error.status === 429) {
            blockedUntil = Date.now() + COOLDOWN_MS;
          }
          throw error;
        });
        return (data.query?.pages ?? [])
          .map(mapCommonsPage)
          .filter((photo): photo is ProviderPhoto => photo !== null);
      },
      allowedMediaHosts: () => ["upload.wikimedia.org", "thumb.wikimedia.org"],
    };
  },
};
