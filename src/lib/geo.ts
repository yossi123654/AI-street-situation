import type { LatLon } from "@/lib/types";

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (Haversine formula). */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bounding box around a point: [minLat, minLon, maxLat, maxLon]. */
export function boundingBox(center: LatLon, radiusM: number): [number, number, number, number] {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = dLat / Math.max(Math.cos(toRad(center.lat)), 1e-6);
  return [center.lat - dLat, center.lon - dLon, center.lat + dLat, center.lon + dLon];
}

export function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** Parses "31.78, 35.21" style input. */
export function parseLatLon(input: string): LatLon | null {
  const match = input.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return isValidLatLon(lat, lon) ? { lat, lon } : null;
}

/** Rounds coordinates for cache keys (~11 m precision at 4 decimals). */
export function roundCoord(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}
