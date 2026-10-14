import { TtlCache } from "@/lib/cache";
import { cameraImageFreshness } from "@/lib/freshness";
import type { Camera, Freshness } from "@/lib/types";
import type { CameraImageService } from "@/services/CameraImageService";

export interface CameraStatus {
  cameraId: string;
  /** null when we cannot check (link-only cameras are never fetched). */
  available: boolean | null;
  checkedAt: string;
  imageTime?: string;
  freshness: Freshness;
  message?: string;
}

/**
 * Reports whether a camera currently serves an image and how old it is.
 * Link-only cameras are not fetched at all (their terms are unknown or do
 * not allow it), so their availability is reported as unknown.
 */
export class CameraAvailabilityService {
  private readonly cache = new TtlCache<CameraStatus>(500);

  constructor(private readonly images: CameraImageService) {}

  async status(camera: Camera): Promise<CameraStatus> {
    const ttl = Math.min(camera.refreshSeconds, 300) * 1000;
    return this.cache.getOrSet(camera.id, ttl, async () => {
      const checkedAt = new Date().toISOString();
      const fetchable =
        camera.mediaType === "image" &&
        camera.mediaUrl &&
        (camera.permissions.embedAllowed === true || camera.permissions.aiAnalysisAllowed === true);
      if (!fetchable) {
        return {
          cameraId: camera.id,
          available: camera.available ?? null,
          checkedAt,
          freshness: "unknown",
        };
      }
      try {
        const image = await this.images.getImage(camera);
        return {
          cameraId: camera.id,
          available: true,
          checkedAt,
          ...(image.imageTime ? { imageTime: image.imageTime } : {}),
          freshness: cameraImageFreshness(image.imageTime, camera.refreshSeconds),
        };
      } catch (error) {
        return {
          cameraId: camera.id,
          available: false,
          checkedAt,
          freshness: "unknown",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }
}
