import { haversineMeters } from "@/lib/geo";
import type { Camera, CameraView, LatLon } from "@/lib/types";
import { getProviders } from "@/providers/registry";

/** Converts a camera to its browser-facing form, applying permission rules. */
export function toCameraView(camera: Camera, distanceM: number): CameraView {
  const { mediaUrl, ...rest } = camera;
  const embeddable =
    camera.permissions.embedAllowed === true && camera.mediaType !== "link" && Boolean(mediaUrl);
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
  };
}

/**
 * Aggregates cameras from every enabled camera provider (the community JSON
 * registry, TfL JamCams, ...). Lookups are in-memory Haversine scans, which is
 * plenty for the MVP's data volume.
 */
export class CameraRegistry {
  async listAll(): Promise<{
    cameras: Camera[];
    errors: Array<{ providerId: string; message: string }>;
  }> {
    const providers = getProviders("cameras");
    const results = await Promise.allSettled(providers.map((p) => p.instance.list()));
    const cameras: Camera[] = [];
    const errors: Array<{ providerId: string; message: string }> = [];
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

  async findNear(
    point: LatLon,
    radiusM: number,
    limit = 20,
  ): Promise<{ cameras: CameraView[]; errors: Array<{ providerId: string; message: string }> }> {
    const { cameras, errors } = await this.listAll();
    const near = cameras
      .map((camera) => ({ camera, distance: haversineMeters(point, camera) }))
      .filter(({ distance }) => distance <= radiusM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map(({ camera, distance }) => toCameraView(camera, distance));
    return { cameras: near, errors };
  }

  async getById(id: string): Promise<Camera | undefined> {
    const { cameras } = await this.listAll();
    return cameras.find((camera) => camera.id === id);
  }

  /** Hostnames a provider's media may be served from (besides the exact registry URL). */
  allowedMediaHosts(providerId: string): string[] | undefined {
    const provider = getProviders("cameras").find((p) => p.def.id === providerId);
    return provider?.instance.allowedMediaHosts?.();
  }
}
