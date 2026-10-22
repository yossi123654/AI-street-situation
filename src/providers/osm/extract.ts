import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { OverpassElement } from "@/providers/overpass/client";

/** [south, west, north, east] */
export type Box = [number, number, number, number];

type Row = [type: string, id: number, lat: number, lon: number, tags: Record<string, string>];

interface ExtractFile {
  region: string;
  name: string;
  bbox: Box;
  /** Outer rings ([lat, lon]) of the area the extract is complete for, when narrower than the bbox. */
  polygons?: Array<Array<[number, number]>>;
  osmBase: string | null;
  generatedAt: string;
  elements: Row[];
}

/** Grid cells of 0.01° (~1 km): small enough that a parking query reads a few cells. */
const CELL_DEG = 0.01;
const TYPES: Record<string, OverpassElement["type"]> = { n: "node", w: "way", r: "relation" };

/** Ray casting: is the point inside the ring? */
export function insideRing(lat: number, lon: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i]!;
    const [latJ, lonJ] = ring[j]!;
    if (latI > lat !== latJ > lat && lon < ((lonJ - lonI) * (lat - latI)) / (latJ - latI) + lonI) {
      inside = !inside;
    }
  }
  return inside;
}

const cellKey = (lat: number, lon: number) =>
  `${Math.floor(lat / CELL_DEG)}:${Math.floor(lon / CELL_DEG)}`;

/**
 * A prebuilt OpenStreetMap extract of parking and roadside stops for one
 * region (see scripts/build-osm-extract.mjs), held in memory with a grid
 * index. Answers the same questions as the Overpass providers, without a
 * network call.
 */
export class OsmExtract {
  private readonly grid = new Map<string, OverpassElement[]>();

  constructor(
    readonly region: string,
    readonly name: string,
    readonly bbox: Box,
    /** When the OSM data was last updated, from Overpass (ISO), if known. */
    readonly osmBase: string | undefined,
    elements: OverpassElement[],
    /** Area outline(s) when the extract follows a border rather than its bbox. */
    readonly polygons: Array<Array<[number, number]>> = [],
  ) {
    for (const element of elements) {
      const key = cellKey(element.lat!, element.lon!);
      const cell = this.grid.get(key);
      if (cell) cell.push(element);
      else this.grid.set(key, [element]);
    }
  }

  static fromFile(data: ExtractFile): OsmExtract {
    const elements: OverpassElement[] = [];
    for (const row of data.elements) {
      const [t, id, lat, lon, tags] = row;
      const type = TYPES[t];
      if (!type || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      elements.push({ type, id, lat, lon, tags });
    }
    const polygons = Array.isArray(data.polygons) ? data.polygons : [];
    return new OsmExtract(
      data.region,
      data.name,
      data.bbox,
      data.osmBase ?? undefined,
      elements,
      polygons,
    );
  }

  /**
   * True when the whole box lies inside the extract's area: its bbox and, when
   * the extract follows a border, its outline (all four corners inside).
   */
  covers(box: Box): boolean {
    const [s, w, n, e] = this.bbox;
    if (box[0] < s || box[1] < w || box[2] > n || box[3] > e) return false;
    if (this.polygons.length === 0) return true;
    const corners: Array<[number, number]> = [
      [box[0], box[1]],
      [box[0], box[3]],
      [box[2], box[1]],
      [box[2], box[3]],
    ];
    return corners.every(([lat, lon]) => this.polygons.some((ring) => insideRing(lat, lon, ring)));
  }

  /** Elements whose position falls inside the box. */
  within(box: Box): OverpassElement[] {
    const out: OverpassElement[] = [];
    const [s, w, n, e] = box;
    for (let y = Math.floor(s / CELL_DEG); y <= Math.floor(n / CELL_DEG); y++) {
      for (let x = Math.floor(w / CELL_DEG); x <= Math.floor(e / CELL_DEG); x++) {
        for (const element of this.grid.get(`${y}:${x}`) ?? []) {
          const lat = element.lat!;
          const lon = element.lon!;
          if (lat >= s && lat <= n && lon >= w && lon <= e) out.push(element);
        }
      }
    }
    return out;
  }
}

function isExtractFile(value: unknown): value is ExtractFile {
  const v = value as ExtractFile;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.region === "string" &&
    Array.isArray(v.bbox) &&
    v.bbox.length === 4 &&
    v.bbox.every(Number.isFinite) &&
    Array.isArray(v.elements)
  );
}

/** Loads every data/osm/*.json.gz extract. Unreadable files are skipped with a warning. */
export async function loadExtracts(dir: string): Promise<OsmExtract[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith(".json.gz")).sort();
  } catch {
    return [];
  }
  const extracts: OsmExtract[] = [];
  for (const name of names) {
    try {
      const data: unknown = JSON.parse(
        gunzipSync(await readFile(path.join(dir, name))).toString("utf8"),
      );
      if (!isExtractFile(data)) throw new Error("not an extract file");
      const extract = OsmExtract.fromFile(data);
      extracts.push(extract);
      console.info(
        `[osm] loaded extract "${extract.name}" (${data.elements.length} elements, OSM data as of ${extract.osmBase ?? "unknown"})`,
      );
    } catch (error) {
      console.warn(`[osm] skipping extract ${name}:`, error);
    }
  }
  return extracts;
}

/** Loads the extracts once per directory and process. */
const loaded = new Map<string, Promise<OsmExtract[]>>();
export function extractsIn(dir: string): Promise<OsmExtract[]> {
  let promise = loaded.get(dir);
  if (!promise) {
    promise = loadExtracts(dir);
    loaded.set(dir, promise);
  }
  return promise;
}

/** Test helper. */
export function resetExtractsForTests(): void {
  loaded.clear();
}
