import { buildUrl, UpstreamError, upstreamJson } from "@/lib/http";
import { sourceFrom } from "@/providers/source";
import { congestionFromSpeeds, levelFromSpeedRatio } from "@/providers/traffic/level";
import type { ProviderDefinition } from "@/providers/types";

interface FlowSegmentResponse {
  flowSegmentData?: {
    frc?: string;
    currentSpeed?: number;
    freeFlowSpeed?: number;
    confidence?: number;
    roadClosure?: boolean;
  };
}

export const tomtomTraffic: ProviderDefinition<"traffic"> = {
  id: "tomtom",
  kind: "traffic",
  name: "TomTom Traffic Flow",
  homepage: "https://developer.tomtom.com/traffic-api/documentation",
  attribution: "Traffic © TomTom",
  requiredEnv: ["TOMTOM_API_KEY"],
  isEnabled: (config) => Boolean(config.TOMTOM_API_KEY),
  create(config) {
    return {
      async flow(point) {
        // Flow Segment Data returns the road segment closest to the point.
        const url = buildUrl(
          config.TOMTOM_URL,
          "traffic/services/4/flowSegmentData/absolute/10/json",
          { point: `${point.lat},${point.lon}`, unit: "KMPH", key: config.TOMTOM_API_KEY },
        );
        let data: FlowSegmentResponse;
        try {
          data = await upstreamJson<FlowSegmentResponse>(url, { providerId: tomtomTraffic.id });
        } catch (error) {
          // HTTP 400 "Point too far from nearest existing segment": no road with
          // flow data near the point, including whole countries TomTom does not
          // cover (e.g. Israel). That is "no data here", not a failure.
          if (error instanceof UpstreamError && error.status === 400) return [];
          throw error;
        }
        const s = data.flowSegmentData;
        if (!s) return [];
        const current = typeof s.currentSpeed === "number" ? s.currentSpeed : null;
        const free = typeof s.freeFlowSpeed === "number" ? s.freeFlowSpeed : null;
        return [
          {
            currentSpeedKmh: current,
            freeFlowSpeedKmh: free,
            congestion: s.roadClosure ? 1 : congestionFromSpeeds(current, free),
            level: s.roadClosure ? "closed" : levelFromSpeedRatio(current, free),
            ...(typeof s.confidence === "number" ? { confidence: s.confidence } : {}),
            // TomTom flow is real-time; the response has no timestamp.
            source: sourceFrom(tomtomTraffic, new Date().toISOString()),
          },
        ];
      },
    };
  },
};
