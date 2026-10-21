import { youtubeEmbedUrl } from "@/lib/cameraSchema";
import { boundingBox, haversineMeters } from "@/lib/geo";
import type { Camera, CameraView, LatLon } from "@/lib/types";
import { getProviders } from "@/providers/registry";
import type { CameraProvider, ProviderDefinition } from "@/providers/types";

type Box = [number, number, number, number];
type ActiveProvider = { def: ProviderDefinition<"cameras">; instance: CameraProvider };
type ProviderErrors = Array<{ providerId: string; message: string }>;

/** Converts a camera to its browser-facing form, applying permission rules. */
export function toCameraView(camera: Camera, distanceM: number): CameraView {
  const { mediaUrl, ...rest } = camera;
  const embedUrl =
    camera.mediaType === "youtube" && mediaUrl ? youtubeEmbedUrl(mediaUrl) : undefined;
  const embeddable =
    camera.permissions.embedAllowed === true &&
    camera.mediaType !== "link" &&
    Boolean(mediaUrl) &&
    (camera.mediaType !== "youtube" || Boolean(embedUrl));
  const analyzable =
    camera.permissions.aiAnalysisAllowed === true &&
    camera.mediaType === "image" &&
    Boolean(mediaUrl);
  return {
    ...rest,
    distanceM: Math.round(distanceM),
    display: embeddable ? "embed" : "link",
    analyzable,
    ...(embeddable && camera.mediaType === "video" && mediaUrl ? { videoUrl: mediaUrl } : {}),
    ...(embeddable && embedUrl ? { embedUrl } : {}),
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/** Providers that may have cameras inside `area` (all of them when no area is given). */
function providersFor(area?: Box): ActiveProvider[] {
  const providers = getProviders("cameras");
  if (!area) return providers;
  return providers.filter(
    (p) => !p.instance.coverage || p.instance.coverage.some((box) => overlaps(box, area)),
  );
}

/**
 * Aggregates cameras from every enabled camera provider (the community JSON
 * registry, TfL JamCams, open government feeds, ...). Providers declare the
 * area they cover, so a search only calls the feeds that can answer it.
 * Lookups are in-memory Haversine scans, which is plenty for a few thousand
 * cameras.
 */
export class CameraRegistry {
  private async collect(
    providers: ActiveProvider[],
  ): Promise<{ cameras: Camera[]; errors: ProviderErrors }> {
    const results = await Promise.allSettled(providers.map((p) => p.instance.list()));
    const cameras: Camera[] = [];
    const errors: ProviderErrors = [];
    results.forEach((result, index) => {
      const providerId = providers[index]!.def.id;
      if (result.status === "fulfilled") cameras.push(...result.value);
      else {
        console.warn(`[cameras] provider ${providerId} failed:`, result.reason);
        errors.push({ providerId, message: String(result.reason?.message ?? result.reason) });
      }
    });
    return { cameras, errors };
  }

  /** Every camera from providers covering `area` (or from all providers). */
  listAll(area?: Box): Promise<{ cameras: Camera[]; errors: ProviderErrors }> {
    return this.collect(providersFor(area));
  }

  async findNear(
    point: LatLon,
    radiusM: number,
    limit = 20,
  ): Promise<{ cameras: CameraView[]; errors: ProviderErrors }> {
    const { cameras, errors } = await this.listAll(boundingBox(point, radiusM));
    const near = cameras
      .map((camera) => ({ camera, distance: haversineMeters(point, camera) }))
      .filter(({ distance }) => distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map(({ camera, distance }) => toCameraView(camera, distance));
    return { cameras: near, errors };
  }

  async getById(id: string): Promise<Camera | undefined> {
    // Only ask providers whose ids can match, so a TfL lookup never loads Finland's list.
    const providers = getProviders("cameras").filter(
      (p) => !p.instance.idPrefix || id.startsWith(p.instance.idPrefix),
    );
    const { cameras } = await this.collect(providers);
    return cameras.find((camera) => camera.id === id);
  }

  /** Hostnames a provider's media may be served from (besides the exact registry URL). */
  allowedMediaHosts(providerId: string): string[] | undefined {
    const provider = getProviders("cameras").find((p) => p.def.id === providerId);
    return provider?.instance.allowedMediaHosts?.();
  }
}
