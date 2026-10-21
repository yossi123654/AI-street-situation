import { createHash } from "node:crypto";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { upstreamFetch } from "@/lib/http";
import { assertSafeMediaUrl } from "@/lib/urlSafety";

export interface FetchedImage {
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
 * Fetches an image from a URL that came from a provider (never from the
 * client), with the SSRF checks in assertSafeMediaUrl applied to the URL and
 * every redirect, a content-type allowlist and a size limit.
 */
export async function fetchSafeImage(
  rawUrl: string,
  options: {
    providerId: string;
    /** Hostnames (or host/path prefixes) the media may come from. */
    allowedHosts?: string[];
    /** Used in error messages, e.g. "camera" or "photo". */
    label: string;
  },
): Promise<FetchedImage> {
  const config = getConfig();
  const { providerId, allowedHosts, label } = options;
  const original = assertSafeMediaUrl(rawUrl, {
    allowInsecure: config.DEV_ALLOW_INSECURE_MEDIA,
    allowedHosts,
  });
  let url = original;
  let response: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    response = await upstreamFetch(url.toString(), {
      providerId,
      redirect: "manual",
      headers: { Accept: "image/*" },
    }).catch((error) => {
      throw new AppError("upstream_error", `${label} source unavailable: ${error.message}`, 502);
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location || hop === MAX_REDIRECTS) {
      throw new AppError("upstream_error", `${label} source redirected too many times`, 502);
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
      `${label} returned unsupported content type "${mimeType}"`,
      502,
    );
  }
  const data = await readLimited(response!, MAX_BYTES).catch((error: Error) => {
    throw new AppError("upstream_error", error.message, 502);
  });
  if (data.length === 0)
    throw new AppError("upstream_error", `${label} returned an empty image`, 502);
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
