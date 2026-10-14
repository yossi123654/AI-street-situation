import type { Freshness } from "@/lib/types";

/**
 * Staleness thresholds per data type, in minutes.
 * `live`: the data may be described as current.
 * `stale`: the data must not be presented as current.
 */
export const FRESHNESS_THRESHOLDS = {
  weather: { liveMinutes: 30, staleMinutes: 120 },
  traffic: { liveMinutes: 5, staleMinutes: 20 },
  incidents: { liveMinutes: 10, staleMinutes: 60 },
} as const;

export type FreshnessKind = keyof typeof FRESHNESS_THRESHOLDS;

export function classifyAge(
  observedAt: string | undefined,
  thresholds: { liveMinutes: number; staleMinutes: number },
  now: number = Date.now(),
): Freshness {
  if (!observedAt) return "unknown";
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return "unknown";
  const ageMinutes = (now - t) / 60_000;
  if (ageMinutes <= thresholds.liveMinutes) return "live";
  if (ageMinutes <= thresholds.staleMinutes) return "recent";
  return "stale";
}

export function freshnessOf(kind: FreshnessKind, observedAt: string | undefined, now?: number) {
  return classifyAge(observedAt, FRESHNESS_THRESHOLDS[kind], now);
}

/** Camera images: live within 3 refresh intervals (min 5 min), stale after 30 min or 10 intervals. */
export function cameraImageFreshness(
  imageTime: string | undefined,
  refreshSeconds: number,
  now?: number,
): Freshness {
  const liveMinutes = Math.max(5, (refreshSeconds * 3) / 60);
  const staleMinutes = Math.max(30, (refreshSeconds * 10) / 60, liveMinutes);
  return classifyAge(imageTime, { liveMinutes, staleMinutes }, now);
}

/** Combines multiple freshness values into the worst one. */
export function worstFreshness(values: Freshness[]): Freshness {
  const order: Freshness[] = ["stale", "unknown", "recent", "live"];
  for (const level of order) if (values.includes(level)) return level;
  return "unknown";
}
