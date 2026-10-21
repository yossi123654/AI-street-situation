import { TtlCache } from "@/lib/cache";
import { forbidden } from "@/lib/errors";
import { fetchSafeImage, type FetchedImage } from "@/lib/mediaFetch";
import type { Camera } from "@/lib/types";
import type { CameraRegistry } from "@/services/CameraRegistry";

export type CameraImage = FetchedImage;

/**
 * Fetches camera images on behalf of the browser and the AI analyzer.
 * Only URLs from the camera registry are ever fetched (SSRF protection), and
 * images are kept in memory for at most one refresh interval — never on disk.
 */
export class CameraImageService {
  private readonly cache = new TtlCache<CameraImage>(100);

  constructor(private readonly registry: CameraRegistry) {}

  async getImage(camera: Camera): Promise<CameraImage> {
    if (camera.permissions.embedAllowed !== true && camera.permissions.aiAnalysisAllowed !== true) {
      throw forbidden("this camera's terms do not allow fetching its media");
    }
    if (camera.mediaType !== "image" || !camera.mediaUrl) {
      throw forbidden("this camera does not provide a still image");
    }
    const ttl = Math.min(camera.refreshSeconds, 300) * 1000;
    return this.cache.getOrSet(camera.id, ttl, () => this.fetchImage(camera));
  }

  private fetchImage(camera: Camera): Promise<CameraImage> {
    return fetchSafeImage(camera.mediaUrl!, {
      providerId: camera.providerId,
      allowedHosts: this.registry.allowedMediaHosts(camera.providerId),
      label: "camera",
    });
  }
}
