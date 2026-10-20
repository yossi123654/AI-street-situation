import type { AppConfig } from "@/lib/config";
import { upstreamJson } from "@/lib/http";
import { createThrottle } from "@/lib/throttle";

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements?: OverpassElement[];
  osm3s?: { timestamp_osm_base?: string };
}

const PUBLIC_HOSTS = new Set([
  "overpass-api.de",
  "maps.mail.ru",
  "overpass.private.coffee",
  "overpass.kumi.systems",
]);

// Public instances are shared and often overloaded: one request at a time from this server.
const publicThrottle = createThrottle(1000);

/** After an error, leave an instance alone for 30 s (as the Overpass usage policy asks). */
const COOLDOWN_MS = 30_000;
const cooldownUntil = new Map<string, number>();

/** Test helper. */
export function resetOverpassCooldowns(): void {
  cooldownUntil.clear();
}

/**
 * Runs an Overpass QL query against the configured endpoints in order,
 * skipping instances that failed recently. Shared by the parking and
 * rest-stop providers.
 */
export function createOverpassClient(config: AppConfig, providerId: string) {
  const endpoints = config.OVERPASS_URLS;
  const timeoutMs = Math.max(config.UPSTREAM_TIMEOUT_MS, 20_000);
  return async function query(ql: string): Promise<OverpassResponse> {
    const body = new URLSearchParams({ data: ql }).toString();
    const now = Date.now();
    const available = endpoints.filter((url) => (cooldownUntil.get(url) ?? 0) <= now);
    // If every instance is cooling down, still try the first one rather than failing outright.
    const candidates = available.length > 0 ? available : endpoints.slice(0, 1);
    let lastError: unknown;
    for (const url of candidates) {
      const request = () =>
        upstreamJson<OverpassResponse>(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          providerId,
          timeoutMs,
        });
      try {
        return await (PUBLIC_HOSTS.has(new URL(url).hostname)
          ? publicThrottle(request)
          : request());
      } catch (error) {
        lastError = error;
        cooldownUntil.set(url, Date.now() + COOLDOWN_MS);
        console.warn(
          `[${providerId}] ${new URL(url).hostname} failed, trying the next Overpass instance`,
        );
      }
    }
    throw lastError;
  };
}
