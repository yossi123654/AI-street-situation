import { TtlCache } from "@/lib/cache";
import { notFound } from "@/lib/errors";
import { haversineMeters, roundCoord } from "@/lib/geo";
import { fetchSafeImage, type FetchedImage } from "@/lib/mediaFetch";
import type { LatLon, Section, SourceInfo, StreetPhoto } from "@/lib/types";
import { getProviders } from "@/providers/registry";
import type { ProviderPhoto } from "@/providers/types";

const MAX_RESULTS = 16;
/** Street-level imagery is shot every few metres; keep one picture per spot. */
const MIN_SPACING_M = 12;
const RESULTS_TTL_MS = 6 * 60 * 60_000;
/** How long a photo id handed to a browser can be opened through the proxy. */
const KNOWN_TTL_MS = 24 * 60 * 60_000;
const IMAGE_TTL_MS = 30 * 60_000;

export type PhotoSize = "thumb" | "large";

/** Nearest first, skipping street-level shots taken within a few metres of a closer one. */
export function thinPhotos(photos: StreetPhoto[], max = MAX_RESULTS): StreetPhoto[] {
  const kept: StreetPhoto[] = [];
  for (const photo of [...photos].sort((a, b) => a.distanceM - b.distanceM)) {
    if (kept.length >= max) break;
    const crowded =
      photo.kind === "street" &&
      kept.some((k) => k.kind === "street" && haversineMeters(k, photo) < MIN_SPACING_M);
    if (!crowded) kept.push(photo);
  }
  return kept;
}

/**
 * Published photos near a point (street-level imagery and geotagged photos).
 * The browser only ever gets photo metadata and ids; image bytes are fetched
 * by the server from URLs the providers returned, through the same SSRF-safe
 * fetcher as camera images, and kept in memory only.
 */
export class PhotoService {
  private readonly results = new TtlCache<ProviderPhoto[]>(500);
  private readonly known = new TtlCache<ProviderPhoto>(5000);
  private readonly images = new TtlCache<FetchedImage>(60);

  isConfigured(): boolean {
    return getProviders("photos").length > 0;
  }

  async find(point: LatLon, radiusM: number): Promise<Section<StreetPhoto[]>> {
    const providers = getProviders("photos");
    if (providers.length === 0) return { status: "unavailable", reason: "not_configured" };
    const settled = await Promise.allSettled(
      providers.map(({ def, instance }) =>
        this.results.getOrSet(
          `${def.id}:${roundCoord(point.lat)},${roundCoord(point.lon)}:${radiusM}`,
          RESULTS_TTL_MS,
          () => instance.near(point, radiusM),
        ),
      ),
    );
    const all: StreetPhoto[] = [];
    const sources: SourceInfo[] = [];
    const errors: string[] = [];
    settled.forEach((result, index) => {
      const { def } = providers[index]!;
      if (result.status === "rejected") {
        console.warn(`[photos] ${def.id} failed:`, result.reason);
        errors.push(String(result.reason?.message ?? result.reason));
        return;
      }
      let used = false;
      for (const photo of result.value) {
        const distanceM = haversineMeters(point, photo);
        if (distanceM > radiusM) continue;
        this.known.set(photo.id, photo, KNOWN_TTL_MS);
        const { thumbUrl, largeUrl, ...rest } = photo;
        void thumbUrl;
        void largeUrl;
        all.push({ ...rest, distanceM: Math.round(distanceM) });
        used = true;
      }
      if (used) {
        sources.push({
          providerId: def.id,
          name: def.name,
          attribution: def.attribution,
          url: def.homepage,
          fetchedAt: new Date().toISOString(),
        });
      }
    });
    if (errors.length === providers.length) {
      return { status: "unavailable", reason: "error", message: errors.join("; ") };
    }
    // Photos show what a place looked like when they were taken: never "live".
    return { status: "ok", data: thinPhotos(all), freshness: "unknown", sources };
  }

  /** Image bytes for a photo previously returned by find(). */
  async getImage(id: string, size: PhotoSize): Promise<FetchedImage> {
    const photo = this.known.get(id);
    if (!photo) throw notFound("photo not found; search the area again");
    const provider = getProviders("photos").find((p) => p.def.id === photo.providerId);
    if (!provider) throw notFound("photo provider is not enabled");
    return this.images.getOrSet(`${id}:${size}`, IMAGE_TTL_MS, () =>
      fetchSafeImage(size === "large" ? photo.largeUrl : photo.thumbUrl, {
        providerId: photo.providerId,
        allowedHosts: provider.instance.allowedMediaHosts?.(),
        label: "photo",
      }),
    );
  }
}
