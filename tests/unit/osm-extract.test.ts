import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import {
  OsmExtract,
  insideRing,
  loadExtracts,
  resetExtractsForTests,
} from "@/providers/osm/extract";
import { osmExtractParking, osmExtractStops } from "@/providers/osm/providers";
import { getProvider } from "@/providers/registry";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  resetExtractsForTests();
  vi.unstubAllGlobals();
});

const JAFFA = { lat: 31.7833, lon: 35.2186 };

const extractFile = {
  region: "test",
  name: "Test region",
  bbox: [31.0, 34.5, 32.5, 35.5],
  osmBase: "2026-10-22T06:00:00Z",
  generatedAt: "2026-10-22T07:00:00Z",
  license: "ODbL 1.0",
  attribution: "© OpenStreetMap contributors",
  elements: [
    [
      "w",
      1,
      31.7835,
      35.2188,
      { amenity: "parking", name: "Near lot", fee: "yes", capacity: "120" },
    ],
    ["n", 2, 31.784, 35.2195, { amenity: "parking", access: "private" }],
    ["w", 3, 31.8, 35.3, { amenity: "parking", name: "Far lot" }],
    // Stops along a line from (31.2, 35.0) to (31.4, 35.0).
    ["n", 10, 31.25, 35.001, { amenity: "fuel", name: "Fuel on the way", toilets: "yes" }],
    ["w", 11, 31.35, 35.0005, { highway: "rest_area", name: "Rest area" }],
    ["n", 12, 31.3, 35.05, { amenity: "fuel", name: "Too far off the road" }],
  ],
};

async function writeExtract(file: object = extractFile): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "osm-extract-"));
  await writeFile(path.join(dir, "test.json.gz"), gzipSync(JSON.stringify(file)));
  await writeFile(path.join(dir, "broken.json.gz"), Buffer.from("not gzip"));
  return dir;
}

describe("OsmExtract", () => {
  it("loads gzipped extracts, skips broken files and indexes elements on a grid", async () => {
    const dir = await writeExtract();
    const [extract, ...rest] = await loadExtracts(dir);
    expect(rest).toHaveLength(0);
    expect(extract!.osmBase).toBe("2026-10-22T06:00:00Z");
    expect(extract!.covers([31.7, 35.1, 31.9, 35.3])).toBe(true);
    expect(extract!.covers([31.7, 35.1, 31.9, 35.9])).toBe(false);
    const near = extract!.within([31.78, 35.215, 31.79, 35.225]).map((e) => e.id);
    expect(near.sort()).toEqual([1, 2]);
    expect(await loadExtracts(path.join(dir, "missing"))).toEqual([]);
  });

  it("follows the area outline when the extract has one", () => {
    // A triangle: the bbox corner (1, 1) is outside it.
    const ring: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 0],
    ];
    expect(insideRing(0.2, 0.2, ring)).toBe(true);
    expect(insideRing(0.9, 0.9, ring)).toBe(false);
    const extract = new OsmExtract("t", "t", [0, 0, 1, 1], undefined, [], [ring]);
    expect(extract.covers([0.1, 0.1, 0.2, 0.2])).toBe(true);
    expect(extract.covers([0.8, 0.8, 0.9, 0.9])).toBe(false);
  });

  it("covers Jerusalem but not Amman in the shipped Israel extract", async () => {
    const [israel] = await loadExtracts("data/osm");
    expect(israel?.region).toBe("il");
    const around = (lat: number, lon: number): [number, number, number, number] => [
      lat - 0.005,
      lon - 0.005,
      lat + 0.005,
      lon + 0.005,
    ];
    expect(israel!.covers(around(31.7833, 35.2186))).toBe(true); // Jerusalem
    expect(israel!.covers(around(32.0853, 34.7818))).toBe(true); // Tel Aviv
    expect(israel!.covers(around(29.5577, 34.9519))).toBe(true); // Eilat
    expect(israel!.covers(around(31.9539, 35.9106))).toBe(false); // Amman
    expect(israel!.covers(around(30.0444, 31.2357))).toBe(false); // Cairo
    expect(israel!.within(around(31.7833, 35.2186)).length).toBeGreaterThan(5);
  });

  it("finds elements across grid cell boundaries", () => {
    const extract = new OsmExtract("t", "t", [0, 0, 1, 1], undefined, [
      { type: "node", id: 1, lat: 0.0099, lon: 0.0099, tags: {} },
      { type: "node", id: 2, lat: 0.0101, lon: 0.0101, tags: {} },
    ]);
    expect(extract.within([0.009, 0.009, 0.011, 0.011]).map((e) => e.id)).toEqual([1, 2]);
  });
});

describe("extract providers", () => {
  it("answers parking inside the extract without any network call", async () => {
    const dir = await writeExtract();
    restore = withEnv({ OSM_EXTRACT_DIR: dir });
    const fetch = mockFetch(() => {
      throw new Error("no network expected");
    });
    const parking = await osmExtractParking.create(getConfig()).parking(JAFFA, 500);
    expect(parking.map((p) => p.name)).toEqual(["Near lot"]);
    expect(parking[0]).toMatchObject({ fee: "yes", capacity: 120 });
    expect(parking[0]!.source.observedAt).toBe("2026-10-22T06:00:00Z");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back to Overpass outside the extract", async () => {
    const dir = await writeExtract();
    restore = withEnv({
      OSM_EXTRACT_DIR: dir,
      OVERPASS_URLS: "https://overpass.example.org/api/interpreter",
    });
    const fetch = mockFetch(() =>
      jsonResponse({
        elements: [
          {
            type: "way",
            id: 9,
            center: { lat: 51.5075, lon: -0.1278 },
            tags: { amenity: "parking" },
          },
        ],
      }),
    );
    const london = await osmExtractParking
      .create(getConfig())
      .parking({ lat: 51.5074, lon: -0.1278 }, 500);
    expect(london).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("finds stops along a route inside the extract, in route order", async () => {
    const dir = await writeExtract();
    restore = withEnv({ OSM_EXTRACT_DIR: dir });
    mockFetch(() => {
      throw new Error("no network expected");
    });
    const line: Array<[number, number]> = [
      [31.2, 35.0],
      [31.4, 35.0],
    ];
    const stops = await osmExtractStops.create(getConfig()).stopsAlong(line, 400);
    expect(stops.map((s) => s.name)).toEqual(["Fuel on the way", "Rest area"]);
    expect(stops[0]!.facilities).toContain("toilets");
  });

  it("is the default parking and stops provider, and can be switched off", () => {
    restore = withEnv({});
    expect(getProvider("parking")?.def.id).toBe("osm-extract");
    expect(getProvider("stops")?.def.id).toBe("osm-extract-stops");
    restore();
    restore = withEnv({ OSM_EXTRACT_ENABLED: "false" });
    expect(getProvider("parking")?.def.id).toBe("overpass");
    expect(getProvider("stops")?.def.id).toBe("overpass-stops");
  });
});
