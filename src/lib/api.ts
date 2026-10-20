import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { AppError, badRequest } from "@/lib/errors";
import { isValidLatLon } from "@/lib/geo";
import { UpstreamError } from "@/lib/http";
import { RateLimiter } from "@/lib/rateLimit";
import { ThrottleBusyError } from "@/lib/throttle";
import type { ApiError, LatLon, Locale } from "@/lib/types";

const globalForLimiter = globalThis as unknown as {
  __streetLimiter?: RateLimiter;
  __streetGlobalLimiter?: RateLimiter;
};

function limiter(): RateLimiter {
  globalForLimiter.__streetLimiter ??= new RateLimiter(getConfig().RATE_LIMIT_PER_MINUTE);
  return globalForLimiter.__streetLimiter;
}

function globalLimiter(): RateLimiter {
  globalForLimiter.__streetGlobalLimiter ??= new RateLimiter(
    getConfig().GLOBAL_RATE_LIMIT_PER_MINUTE,
  );
  return globalForLimiter.__streetGlobalLimiter;
}

/**
 * Identifies the client for rate limiting.
 *
 * Next.js sets X-Forwarded-For to the socket address only when the request
 * has none, and passes a client-supplied value through unchanged. So:
 * - TRUST_PROXY=true (behind a reverse proxy that sets X-Real-IP or appends
 *   to X-Forwarded-For): use X-Real-IP, else the LAST X-Forwarded-For entry,
 *   which is the one the proxy added. The first entry is client-controlled.
 * - TRUST_PROXY=false: use X-Forwarded-For as Next.js provides it. Honest
 *   clients get a per-IP bucket; a client that forges the header can dodge
 *   its own bucket, which is why there is also a global limit.
 */
export function clientKey(headers: Headers, trustProxy: boolean): string {
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (trustProxy) {
    const real = headers.get("x-real-ip")?.trim();
    const last = forwarded?.[forwarded.length - 1];
    if (real || last) return `ip:${real || last}`;
  }
  const first = forwarded?.[0];
  return first ? `ip:${first}` : `ua:${headers.get("user-agent") ?? "unknown"}`;
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status, headers });
}

type Handler<C> = (request: NextRequest, context: C) => Promise<Response>;

/** Wraps a route handler with rate limiting and uniform error responses. */
export function apiHandler<C = unknown>(
  handler: Handler<C>,
  options: { cost?: number } = {},
): Handler<C> {
  return async (request, context) => {
    const cost = options.cost ?? 1;
    const key = clientKey(request.headers, getConfig().TRUST_PROXY);
    let result = limiter().check(key);
    for (let i = 1; i < cost && result.allowed; i++) result = limiter().check(key);
    if (result.allowed) {
      for (let i = 0; i < cost && result.allowed; i++) result = globalLimiter().check("all");
    }
    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      return errorResponse("rate_limited", "Too many requests, please slow down.", 429, {
        "Retry-After": String(retryAfter),
      });
    }
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof AppError) return errorResponse(error.code, error.message, error.status);
      if (error instanceof ThrottleBusyError) {
        return errorResponse("busy", "The service is busy, please try again in a moment.", 503, {
          "Retry-After": "5",
        });
      }
      if (error instanceof UpstreamError) {
        console.warn(`[api] upstream error: ${error.message}`);
        return errorResponse("upstream_error", "An upstream data source is unavailable.", 502);
      }
      console.error("[api] unexpected error", error);
      return errorResponse("internal_error", "Unexpected server error.", 500);
    }
  };
}

export function parseLocale(value: string | null): Locale {
  return value === "en" ? "en" : "he";
}

export function parsePoint(params: URLSearchParams): LatLon {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (params.get("lat") === null || params.get("lon") === null || !isValidLatLon(lat, lon)) {
    throw badRequest("lat and lon must be valid coordinates");
  }
  return { lat, lon };
}

export function parseLabel(value: string | null): string | undefined {
  const label = value?.trim();
  return label ? label.slice(0, 200) : undefined;
}

export function json<T>(data: T, init?: { maxAge?: number; status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": init?.maxAge ? `private, max-age=${init.maxAge}` : "no-store",
    },
  });
}

/** Camera ids are generated or validated as kebab-case; anything else is rejected early. */
export function parseCameraId(id: string): string {
  if (!/^[a-z]{2}-[a-z0-9-]{1,100}$/.test(id)) throw badRequest("invalid camera id");
  return id;
}

/** Parses "lat,lon" query values (with an optional `<name>Label`) for trip endpoints. */
export function parseEndpoint(params: URLSearchParams, name: string): LatLon & { label?: string } {
  const raw = params.get(name);
  const match = raw?.trim().match(/^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) throw badRequest(`${name} must be "lat,lon"`);
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!isValidLatLon(lat, lon)) throw badRequest(`${name} must be valid coordinates`);
  const label = parseLabel(params.get(`${name}Label`));
  return { lat, lon, ...(label ? { label } : {}) };
}
