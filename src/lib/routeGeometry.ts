import { haversineMeters } from "@/lib/geo";
import type { LatLon } from "@/lib/types";

export type LatLonTuple = [number, number];

/** Cumulative distance (metres) at each point of a polyline; first entry is 0. */
export function cumulativeDistances(line: LatLonTuple[]): number[] {
  const out = new Array<number>(line.length);
  let total = 0;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) {
      const [aLat, aLon] = line[i - 1]!;
      const [bLat, bLon] = line[i]!;
      total += haversineMeters({ lat: aLat, lon: aLon }, { lat: bLat, lon: bLon });
    }
    out[i] = total;
  }
  return out;
}

/**
 * Picks evenly spaced points along a route for sampling (weather, traffic).
 * Always includes the first and last point. Returns geometry indexes.
 */
export function sampleIndexes(
  cumulative: number[],
  options: { everyM: number; max: number },
): number[] {
  const n = cumulative.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  const total = cumulative[n - 1]!;
  const stepM = Math.max(options.everyM, total / Math.max(1, options.max - 1));
  const indexes = [0];
  let nextTarget = stepM;
  for (let i = 1; i < n - 1; i++) {
    if (cumulative[i]! >= nextTarget) {
      indexes.push(i);
      nextTarget += stepM;
    }
  }
  if (indexes[indexes.length - 1] !== n - 1) indexes.push(n - 1);
  return indexes;
}

/** Interpolates a value defined at geometry points (e.g. cumulative duration) linearly by distance. */
export function interpolateAlong(
  cumulative: number[],
  values: number[],
  distanceM: number,
): number {
  const n = cumulative.length;
  if (n === 0 || values.length !== n) return 0;
  if (distanceM <= 0) return values[0]!;
  if (distanceM >= cumulative[n - 1]!) return values[n - 1]!;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= distanceM) lo = mid;
    else hi = mid;
  }
  const span = cumulative[hi]! - cumulative[lo]!;
  const t = span > 0 ? (distanceM - cumulative[lo]!) / span : 0;
  return values[lo]! + t * (values[hi]! - values[lo]!);
}

/**
 * Nearest route vertex to a point: its index and the straight-line distance.
 * Vertex-based (not segment-based) is accurate enough for stops and incidents
 * on a route whose geometry has a point every few tens of metres.
 */
export function nearestVertex(
  line: LatLonTuple[],
  point: LatLon,
): { index: number; distanceM: number } {
  let best = { index: -1, distanceM: Infinity };
  // Coarse pre-filter in degrees to avoid a Haversine per vertex on long routes.
  const maxDeg = 0.2;
  for (let i = 0; i < line.length; i++) {
    const [lat, lon] = line[i]!;
    if (Math.abs(lat - point.lat) > maxDeg || Math.abs(lon - point.lon) > maxDeg) continue;
    const d = haversineMeters({ lat, lon }, point);
    if (d < best.distanceM) best = { index: i, distanceM: d };
  }
  return best;
}

/** Bounding box [minLat, minLon, maxLat, maxLon] of a polyline, padded by `padM` metres. */
export function lineBounds(line: LatLonTuple[], padM = 0): [number, number, number, number] {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of line) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const dLat = (padM / 6_371_008.8) * (180 / Math.PI);
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const dLon = dLat / Math.max(Math.cos(midLat), 1e-6);
  return [minLat - dLat, minLon - dLon, maxLat + dLat, maxLon + dLon];
}

/**
 * Reduces a polyline to at most `max` points by keeping every k-th vertex
 * (plus the last). Good enough for corridor queries; not a shape-preserving
 * simplification.
 */
export function thinLine(line: LatLonTuple[], max: number): LatLonTuple[] {
  if (line.length <= max) return line;
  const step = Math.ceil(line.length / (max - 1));
  const out: LatLonTuple[] = [];
  for (let i = 0; i < line.length; i += step) out.push(line[i]!);
  if (out[out.length - 1] !== line[line.length - 1]) out.push(line[line.length - 1]!);
  return out;
}

/**
 * Closest point on a polyline (segments, not just vertices) to `point`, with
 * its distance from the line and its distance along it. Uses a local
 * equirectangular projection per segment, which is accurate to well under a
 * metre at the corridor widths used here (a few hundred metres). Needed where
 * the geometry can be sparse, e.g. long straight highways with vertices
 * kilometres apart.
 */
export function nearestOnLine(
  line: LatLonTuple[],
  cumulative: number[],
  point: LatLon,
  maxDistanceM = Infinity,
): { distanceM: number; distanceAlongM: number } | null {
  const mPerDegLat = 111_320;
  const mPerDegLon = mPerDegLat * Math.cos((point.lat * Math.PI) / 180);
  const padDeg = Number.isFinite(maxDistanceM) ? maxDistanceM / mPerDegLat + 0.01 : Infinity;
  let best: { distanceM: number; distanceAlongM: number } | null = null;
  if (line.length === 0) return null;
  // A single-point line is treated as one zero-length segment.
  for (let i = 0; i < Math.max(1, line.length - 1); i++) {
    const [aLat, aLon] = line[i]!;
    const [bLat, bLon] = line[Math.min(i + 1, line.length - 1)]!;
    // Skip segments whose bounding box is clearly too far away.
    if (
      point.lat < Math.min(aLat, bLat) - padDeg ||
      point.lat > Math.max(aLat, bLat) + padDeg ||
      point.lon < Math.min(aLon, bLon) - padDeg * 2 ||
      point.lon > Math.max(aLon, bLon) + padDeg * 2
    )
      continue;
    const ax = (aLon - point.lon) * mPerDegLon;
    const ay = (aLat - point.lat) * mPerDegLat;
    const bx = (bLon - point.lon) * mPerDegLon;
    const by = (bLat - point.lat) * mPerDegLat;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSq)) : 0;
    const distanceM = Math.hypot(ax + t * dx, ay + t * dy);
    if (distanceM <= maxDistanceM && (!best || distanceM < best.distanceM)) {
      const start = cumulative[i]!;
      const end = cumulative[Math.min(i + 1, line.length - 1)]!;
      best = { distanceM, distanceAlongM: start + t * (end - start) };
    }
  }
  return best;
}
