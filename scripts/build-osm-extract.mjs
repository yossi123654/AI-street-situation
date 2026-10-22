// Builds a compact OpenStreetMap extract of parking and roadside stops for a
// region, so the app can answer parking and "stops along the route" queries
// from memory instead of calling a public Overpass server for every search.
//
// Usage:
//   npm run osm:extract -- il --pbf=israel.osm.pbf --poly=israel.poly
//       from a downloaded OSM extract (Geofabrik, openstreetmap.fr), using
//       the `osmium` command-line tool. Fast and kind to public servers; the
//       weekly GitHub Actions workflow uses this.
//   npm run osm:extract -- il
//       from the Overpass API, in tiles (no downloads, but slow, and public
//       Overpass servers are often overloaded).
//   npm run osm:extract -- xx --bbox=s,w,n,e --name="My region"
//
// The output, data/osm/<region>.json.gz, contains OpenStreetMap data and is
// licensed under the ODbL (see data/osm/README.md). Behind an HTTP proxy, run
// with NODE_USE_ENV_PROXY=1.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ENDPOINTS = (
  process.env.OVERPASS_URLS ??
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.private.coffee/api/interpreter,https://overpass-api.de/api/interpreter"
)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);
const USER_AGENT =
  process.env.APP_USER_AGENT ??
  "AI-Street-Situation-extract/0.1 (+https://github.com/yossi123654/ai-street-situation)";
const TILE_DEG = Number(process.env.OSM_EXTRACT_TILE_DEG ?? 0.25);

/** Only the tags the app reads (src/providers/parking, src/providers/stops). */
const KEEP_TAGS = new Set([
  "amenity",
  "parking",
  "access",
  "fee",
  "name",
  "name:he",
  "name:en",
  "capacity",
  "capacity:disabled",
  "opening_hours",
  "operator",
  "maxstay",
  "park_ride",
  "highway",
  "brand",
  "motorcar",
  "toilets",
  "shop",
  "car_wash",
  "compressed_air",
  "fuel:electricity",
]);

function parseArgs(argv) {
  const args = {
    region: undefined,
    bbox: undefined,
    name: undefined,
    pbf: undefined,
    poly: undefined,
  };
  for (const arg of argv) {
    if (arg.startsWith("--bbox=")) args.bbox = arg.slice(7).split(",").map(Number);
    else if (arg.startsWith("--name=")) args.name = arg.slice(7);
    else if (arg.startsWith("--pbf=")) args.pbf = arg.slice(6);
    else if (arg.startsWith("--poly=")) args.poly = arg.slice(7);
    else if (!arg.startsWith("--")) args.region = arg;
  }
  return args;
}

const WANTED = (tags) =>
  ["parking", "fuel", "charging_station"].includes(tags.amenity) ||
  ["rest_area", "services"].includes(tags.highway);

const keepTags = (tags) =>
  Object.fromEntries(Object.entries(tags ?? {}).filter(([k]) => KEEP_TAGS.has(k)));

/** [type initial, id, lat, lon, tags]: compact, and stable for diffs. */
const row = (type, id, lat, lon, tags) => [
  type,
  id,
  Math.round(lat * 1e6) / 1e6,
  Math.round(lon * 1e6) / 1e6,
  keepTags(tags),
];

/** Centre of a GeoJSON geometry's bounding box (what Overpass calls "center"). */
function center(geometry) {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  const visit = (coords) => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    } else coords.forEach(visit);
  };
  visit(geometry.coordinates);
  return Number.isFinite(minLat) ? [(minLat + maxLat) / 2, (minLon + maxLon) / 2] : null;
}

/** Outer rings of an Osmosis .poly file as [[lat, lon], ...] (holes, marked "!", are skipped). */
function parsePoly(text) {
  const rings = [];
  let ring = null;
  let hole = false;
  for (const raw of text.split(/\r?\n/).slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "END") {
      if (ring && !hole && ring.length >= 3) rings.push(ring);
      ring = null;
      continue;
    }
    if (ring === null) {
      hole = line.startsWith("!");
      ring = [];
      continue;
    }
    const [lon, lat] = line.split(/\s+/).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) ring.push([lat, lon]);
  }
  return rings;
}

/** Reads parking and stops from a .osm.pbf file with the osmium tool. */
async function fromPbf(pbf) {
  const dir = await mkdtemp(path.join(tmpdir(), "osm-extract-"));
  try {
    const filtered = path.join(dir, "filtered.osm.pbf");
    const geojson = path.join(dir, "filtered.geojsonseq");
    execFileSync("osmium", [
      "tags-filter",
      pbf,
      "nwr/amenity=parking,fuel,charging_station",
      "nwr/highway=rest_area,services",
      "-o",
      filtered,
    ]);
    execFileSync("osmium", [
      "export",
      filtered,
      "-f",
      "geojsonseq",
      "--add-unique-id=type_id",
      "-x",
      "print_record_separator=false",
      "-o",
      geojson,
    ]);
    let osmBase = null;
    try {
      osmBase =
        execFileSync("osmium", ["fileinfo", "-g", "header.option.timestamp", pbf], {
          encoding: "utf8",
        }).trim() || null;
    } catch {
      // Older files may have no timestamp header.
    }
    const rows = [];
    for (const line of (await readFile(geojson, "utf8")).split("\n")) {
      if (!line.trim()) continue;
      const feature = JSON.parse(line);
      const tags = feature.properties ?? {};
      if (!WANTED(tags)) continue;
      const match = /^([nwar])(\d+)$/.exec(String(feature.id));
      const c = feature.geometry ? center(feature.geometry) : null;
      if (!match || !c) continue;
      // osmium names areas "a": even ids come from ways, odd ones from relations.
      let [, type, id] = match;
      let osmId = Number(id);
      if (type === "a") {
        type = osmId % 2 === 0 ? "w" : "r";
        osmId = Math.floor(osmId / 2);
      }
      rows.push(row(type, osmId, c[0], c[1], tags));
    }
    return { rows, osmBase };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function tiles([south, west, north, east]) {
  const out = [];
  for (let s = south; s < north; s += TILE_DEG) {
    for (let w = west; w < east; w += TILE_DEG) {
      out.push([s, w, Math.min(s + TILE_DEG, north), Math.min(w + TILE_DEG, east)]);
    }
  }
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TooBigError extends Error {}

/**
 * Runs a query, trying each endpoint. Timeouts and gateway errors on a
 * whole tile usually mean "too much data at once": the caller then splits
 * the tile instead of retrying the same query.
 */
async function overpass(ql) {
  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams({ data: ql }).toString(),
        signal: AbortSignal.timeout(120_000),
      });
      if (response.status === 504 || response.status === 502) {
        throw new TooBigError(`${url} responded with HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`${url} responded with HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`\n  ${url}: ${error.message}`);
      await sleep(5_000);
    }
  }
  throw lastError instanceof TooBigError || lastError?.name === "TimeoutError"
    ? new TooBigError(lastError.message)
    : lastError;
}

const MIN_TILE_DEG = 0.0625;

/** Fetches one tile, splitting it into four when the servers time out on it. */
async function fetchTile([s, w, n, e], depth = 0) {
  const b = `${s},${w},${n},${e}`;
  const ql =
    `[out:json][timeout:90];(` +
    `nwr["amenity"="parking"](${b});` +
    `nwr["amenity"="fuel"](${b});` +
    `nwr["amenity"="charging_station"](${b});` +
    `nwr["highway"~"^(rest_area|services)$"](${b});` +
    `);out center tags qt;`;
  // Public servers often time out under load, whatever the tile size: retry
  // a few times before concluding that the tile itself is too big.
  const attempts = n - s <= MIN_TILE_DEG ? 6 : 2;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return [await overpass(ql)];
    } catch (error) {
      lastError = error;
      if (!(error instanceof TooBigError)) throw error;
      await sleep(20_000 * (attempt + 1));
    }
  }
  if (n - s <= MIN_TILE_DEG) throw lastError;
  const midLat = (s + n) / 2;
  const midLon = (w + e) / 2;
  console.log(`${"  ".repeat(depth + 1)}splitting ${b}`);
  const parts = [];
  for (const box of [
    [s, w, midLat, midLon],
    [s, midLon, midLat, e],
    [midLat, w, n, midLon],
    [midLat, midLon, n, e],
  ]) {
    parts.push(...(await fetchTile(box, depth + 1)));
    await sleep(2_000);
  }
  return parts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.region || !/^[a-z0-9-]+$/.test(args.region)) {
    console.error("Usage: npm run osm:extract -- <region> [--bbox=s,w,n,e --name=...]");
    process.exit(1);
  }
  const regions = JSON.parse(await readFile("data/osm/regions.json", "utf8"));
  const bbox = args.bbox ?? regions[args.region]?.bbox;
  const name = args.name ?? regions[args.region]?.name ?? args.region;
  if (
    !(args.pbf && args.poly) &&
    (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v)))
  ) {
    console.error(
      `No bbox for region "${args.region}". Add it to data/osm/regions.json or pass --bbox.`,
    );
    process.exit(1);
  }

  const byId = new Map();
  let osmBase;
  if (args.pbf) {
    console.log(`reading ${args.pbf} with osmium …`);
    const result = await fromPbf(args.pbf);
    osmBase = result.osmBase ?? undefined;
    for (const r of result.rows) byId.set(`${r[0]}/${r[1]}`, r);
  } else {
    const all = tiles(bbox);
    for (const [i, [s, w, n, e]] of all.entries()) {
      const b = `${s},${w},${n},${e}`;
      process.stdout.write(`tile ${i + 1}/${all.length} (${b}) … `);
      let added = 0;
      for (const data of await fetchTile([s, w, n, e])) {
        osmBase ??= data.osm3s?.timestamp_osm_base;
        for (const el of data.elements ?? []) {
          const lat = el.lat ?? el.center?.lat;
          const lon = el.lon ?? el.center?.lon;
          if (typeof lat !== "number" || typeof lon !== "number") continue;
          const key = `${el.type[0]}/${el.id}`;
          if (byId.has(key)) continue;
          byId.set(key, row(el.type[0], el.id, lat, lon, el.tags));
          added++;
        }
      }
      console.log(`${added} new elements`);
      await sleep(2_000);
    }
  }

  // The area the extract is complete for: the .poly boundary when given
  // (a country's outline), else the bounding box.
  const polygons = args.poly ? parsePoly(await readFile(args.poly, "utf8")) : [];
  if (args.poly && polygons.length === 0) throw new Error(`no polygon found in ${args.poly}`);
  const area = polygons.length
    ? polygons
        .flat()
        .reduce(
          ([s, w, n, e], [lat, lon]) => [
            Math.min(s, lat),
            Math.min(w, lon),
            Math.max(n, lat),
            Math.max(e, lon),
          ],
          [Infinity, Infinity, -Infinity, -Infinity],
        )
    : bbox;

  const elements = [...byId.values()].sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
  const extract = {
    region: args.region,
    name,
    bbox: area,
    ...(polygons.length ? { polygons } : {}),
    osmBase: osmBase ?? null,
    generatedAt: new Date().toISOString(),
    license: "ODbL 1.0",
    attribution: "© OpenStreetMap contributors",
    elements,
  };
  const out = `data/osm/${args.region}.json.gz`;
  await writeFile(out, gzipSync(JSON.stringify(extract), { level: 9 }));
  console.log(`wrote ${out}: ${elements.length} elements (OSM data as of ${osmBase ?? "unknown"})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
