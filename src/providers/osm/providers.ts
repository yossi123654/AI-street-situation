import path from "node:path";
import type { AppConfig } from "@/lib/config";
import { boundingBox } from "@/lib/geo";
import { cumulativeDistances, lineBounds, nearestOnLine } from "@/lib/routeGeometry";
import type { ParkingFacility, TripStop } from "@/lib/types";
import { extractsIn, type Box, type OsmExtract } from "@/providers/osm/extract";
import { elementToParking, overpassParking } from "@/providers/parking/overpass";
import { sourceFrom } from "@/providers/source";
import { elementToStop, overpassStops } from "@/providers/stops/overpass";
import type { ProviderDefinition } from "@/providers/types";

function extractDir(config: AppConfig): string {
  // Resolved at runtime; the data directory is copied into the Docker image.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), config.OSM_EXTRACT_DIR);
}

async function extractCovering(config: AppConfig, box: Box): Promise<OsmExtract | undefined> {
  return (await extractsIn(extractDir(config))).find((extract) => extract.covers(box));
}

const isStop = (stop: TripStop | null): stop is TripStop => stop !== null;

/**
 * Parking from a prebuilt OpenStreetMap extract when the search area lies
 * inside one (Israel ships with the app), from Overpass everywhere else.
 */
export const osmExtractParking: ProviderDefinition<"parking"> = {
  id: "osm-extract",
  kind: "parking",
  name: "OpenStreetMap (prebuilt extract, Overpass elsewhere)",
  homepage: "https://www.openstreetmap.org/copyright",
  attribution: "© OpenStreetMap contributors (ODbL)",
  requiredEnv: [],
  isEnabled: (config) => config.PARKING_ENABLED && config.OSM_EXTRACT_ENABLED,
  create(config) {
    const fallback = overpassParking.create(config);
    return {
      async parking(point, radiusM) {
        const r = Math.round(Math.min(radiusM, 3000));
        const box = boundingBox(point, r);
        const extract = await extractCovering(config, box);
        if (!extract) return fallback.parking(point, r);
        const source = sourceFrom(osmExtractParking, extract.osmBase);
        return extract
          .within(box)
          .filter((element) => element.tags?.amenity === "parking")
          .map((element) => elementToParking(element, point))
          .filter((p): p is Omit<ParkingFacility, "source"> => p !== null && p.distanceM <= r)
          .map((p) => ({ ...p, source }));
      },
    };
  },
};

/** Stops along a route from the extract when the whole route lies inside it, else Overpass. */
export const osmExtractStops: ProviderDefinition<"stops"> = {
  id: "osm-extract-stops",
  kind: "stops",
  name: "OpenStreetMap stops (prebuilt extract, Overpass elsewhere)",
  homepage: "https://www.openstreetmap.org/copyright",
  attribution: "© OpenStreetMap contributors (ODbL)",
  requiredEnv: [],
  isEnabled: (config) => config.TRIP_STOPS_ENABLED && config.OSM_EXTRACT_ENABLED,
  create(config) {
    const fallback = overpassStops.create(config);
    return {
      async stopsAlong(line, radiusM) {
        if (line.length < 2) return [];
        const r = Math.round(Math.min(radiusM, 1000));
        const box = lineBounds(line, r);
        const extract = await extractCovering(config, box);
        if (!extract) return fallback.stopsAlong(line, r);
        const cumulative = cumulativeDistances(line);
        // Within `r` of the route line, measured to its segments (more exact
        // than the Overpass provider, which can only measure to vertices).
        return extract
          .within(box)
          .map((element) => {
            const near = nearestOnLine(
              line,
              cumulative,
              { lat: element.lat!, lon: element.lon! },
              r,
            );
            const stop = near ? elementToStop(element, line, cumulative) : null;
            return stop && near
              ? {
                  ...stop,
                  distanceAlongM: Math.round(near.distanceAlongM),
                  detourM: Math.round(near.distanceM),
                }
              : null;
          })
          .filter(isStop)
          .sort((a, b) => a.distanceAlongM - b.distanceAlongM);
      },
    };
  },
};
