import { buildUrl, upstreamJson } from "@/lib/http";
import type { TrafficFlow } from "@/lib/types";
import { sourceFrom } from "@/providers/source";
import { levelFromJamFactor } from "@/providers/traffic/level";
import type { ProviderDefinition } from "@/providers/types";

interface HereFlowResponse {
  sourceUpdated?: string;
  results?: Array<{
    location?: { description?: string; length?: number };
    currentFlow?: {
      speed?: number;
      speedUncapped?: number;
      freeFlow?: number;
      jamFactor?: number;
      confidence?: number;
      traversability?: string;
    };
  }>;
}

const msToKmh = (v: number | undefined) => (typeof v === "number" ? Math.round(v * 3.6) : null);

export const hereTraffic: ProviderDefinition<"traffic"> = {
  id: "here",
  kind: "traffic",
  name: "HERE Traffic",
  homepage: "https://www.here.com/docs/bundle/traffic-api-developer-guide-v7/page/README.html",
  attribution: "Traffic © HERE",
  requiredEnv: ["HERE_API_KEY"],
  isEnabled: (config) => Boolean(config.HERE_API_KEY),
  create(config) {
    return {
      async flow(point, radiusM) {
        const url = buildUrl(config.HERE_TRAFFIC_URL, "v7/flow", {
          in: `circle:${point.lat},${point.lon};r=${Math.min(Math.round(radiusM), 2000)}`,
          locationReferencing: "none",
          apiKey: config.HERE_API_KEY,
        });
        const data = await upstreamJson<HereFlowResponse>(url, { providerId: hereTraffic.id });
        const observedAt = data.sourceUpdated ?? new Date().toISOString();
        const flows: TrafficFlow[] = (data.results ?? [])
          .filter((r) => r.currentFlow)
          .map((r) => {
            const f = r.currentFlow!;
            const closed = f.traversability === "closed";
            const jam = typeof f.jamFactor === "number" ? f.jamFactor : null;
            return {
              ...(r.location?.description ? { roadName: r.location.description } : {}),
              currentSpeedKmh: msToKmh(f.speedUncapped ?? f.speed),
              freeFlowSpeedKmh: msToKmh(f.freeFlow),
              congestion: closed ? 1 : jam === null ? null : jam / 10,
              level: closed ? "closed" : levelFromJamFactor(jam),
              ...(typeof f.confidence === "number" ? { confidence: f.confidence } : {}),
              source: sourceFrom(hereTraffic, observedAt),
            };
          });
        // Most congested first, keep the list short.
        return flows.sort((a, b) => (b.congestion ?? 0) - (a.congestion ?? 0)).slice(0, 5);
      },
    };
  },
};
