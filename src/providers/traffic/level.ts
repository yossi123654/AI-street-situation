import type { TrafficLevel } from "@/lib/types";

/** Maps a current/free-flow speed ratio to a traffic level. */
export function levelFromSpeedRatio(current: number | null, freeFlow: number | null): TrafficLevel {
  if (current === null || freeFlow === null || freeFlow <= 0) return "unknown";
  const ratio = current / freeFlow;
  if (ratio >= 0.8) return "free";
  if (ratio >= 0.55) return "moderate";
  if (ratio >= 0.3) return "heavy";
  return "severe";
}

/** Congestion 0..1 from speeds. */
export function congestionFromSpeeds(
  current: number | null,
  freeFlow: number | null,
): number | null {
  if (current === null || freeFlow === null || freeFlow <= 0) return null;
  return Math.min(1, Math.max(0, 1 - current / freeFlow));
}

/** HERE jam factor (0..10) to traffic level. */
export function levelFromJamFactor(jamFactor: number | null): TrafficLevel {
  if (jamFactor === null) return "unknown";
  if (jamFactor >= 10) return "closed";
  if (jamFactor >= 8) return "severe";
  if (jamFactor >= 5) return "heavy";
  if (jamFactor >= 2.5) return "moderate";
  return "free";
}
