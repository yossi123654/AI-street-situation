import { createHash } from "node:crypto";
import { TtlCache } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { AppError, forbidden } from "@/lib/errors";
import { upstreamFetch } from "@/lib/http";
import type { Camera } from "@/lib/types";
import { assertSafeMediaUrl } from "@/lib/urlSafety";
import type { CameraRegistry } from "@/services/CameraRegistry";

export interface CameraImage {
  data: Buffer;
  mimeType: string;
  /** SHA-256 of the image bytes, used as a cache key for analysis. */
  hash: string;
  /** Capture/modification time reported by the source, if any. */
  imageTime?: string;
  fetchedAt: string;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 2;

async function readLimited(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("image too large");
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("image too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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

  private async fetchImage(camera: Camera): Promise<CameraImage> {
    const config = getConfig();
    const allowedHosts = this.registry.allowedMediaHosts(camera.providerId);
    const original = assertSafeMediaUrl(camera.mediaUrl!, {
      allowInsecure: config.DEV_ALLOW_INSECURE_MEDIA,
      allowedHosts,
    });
    let url = original;
    let response: Response | undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await upstreamFetch(url.toString(), {
        providerId: camera.providerId,
        redirect: "manual",
        headers: { Accept: "image/*" },
      }).catch((error) => {
        throw new AppError("upstream_error", `camera source unavailable: ${error.message}`, 502);
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location || hop === MAX_REDIRECTS) {
        throw new AppError("upstream_error", "camera source redirected too many times", 502);
      }
      // Redirects must stay on the original host or the provider's allowlist.
      url = assertSafeMediaUrl(new URL(location, url).toString(), {
        allowInsecure: config.DEV_ALLOW_INSECURE_MEDIA,
        allowedHosts,
        expectedHost: original.hostname,
      });
    }
    const mimeType = (response!.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase();
    if (!ALLOWED_TYPES.has(mimeType)) {
      await response!.body?.cancel().catch(() => undefined);
      throw new AppError(
        "upstream_error",
        `camera returned unsupported content type "${mimeType}"`,
        502,
      );
    }
    const data = await readLimited(response!, MAX_BYTES).catch((error: Error) => {
      throw new AppError("upstream_error", error.message, 502);
    });
    if (data.length === 0)
      throw new AppError("upstream_error", "camera returned an empty image", 502);
    const lastModified = response!.headers.get("last-modified");
    const parsed = lastModified ? Date.parse(lastModified) : NaN;
    return {
      data,
      mimeType,
      hash: createHash("sha256").update(data).digest("hex"),
      ...(Number.isNaN(parsed) ? {} : { imageTime: new Date(parsed).toISOString() }),
      fetchedAt: new Date().toISOString(),
    };
  }
}
