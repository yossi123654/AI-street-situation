import { getConfig } from "@/lib/config";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly providerId?: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface FetchOptions extends Omit<RequestInit, "signal"> {
  timeoutMs?: number;
  providerId?: string;
  /**
   * Retries after a network error or timeout (never after an HTTP error).
   * Defaults to 1 for GET/HEAD and 0 for other methods.
   */
  retries?: number;
}

/**
 * fetch() with a timeout, an identifying User-Agent and consistent errors.
 * Callers must never pass user-controlled URLs here.
 */
export async function upstreamFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const config = getConfig();
  const { timeoutMs = config.UPSTREAM_TIMEOUT_MS, providerId, headers, retries, ...init } = options;
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("User-Agent")) finalHeaders.set("User-Agent", config.APP_USER_AGENT);
  const method = (init.method ?? "GET").toUpperCase();
  const maxRetries = retries ?? (method === "GET" || method === "HEAD" ? 1 : 0);
  let response: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(url, {
        ...init,
        headers: finalHeaders,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      break;
    } catch (error) {
      if (attempt < maxRetries) continue;
      const reason =
        error instanceof Error && error.name === "TimeoutError" ? "timed out" : "network error";
      throw new UpstreamError(
        `${providerId ?? "upstream"} request ${reason}`,
        undefined,
        providerId,
      );
    }
  }
  if (!response.ok) {
    // Drain the body so the connection can be reused.
    await response.body?.cancel().catch(() => undefined);
    throw new UpstreamError(
      `${providerId ?? "upstream"} responded with HTTP ${response.status}`,
      response.status,
      providerId,
    );
  }
  return response;
}

export async function upstreamJson<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const response = await upstreamFetch(url, { ...options, headers });
  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError(`${options.providerId ?? "upstream"} returned invalid JSON`);
  }
}

/** Builds a URL with query parameters, skipping undefined values. */
export function buildUrl(
  base: string,
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
): string {
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}
