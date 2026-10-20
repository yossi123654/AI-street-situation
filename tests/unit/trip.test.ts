import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEndpoint } from "@/lib/api";
import { getConfig } from "@/lib/config";
import {
  cumulativeDistances,
  interpolateAlong,
  lineBounds,
  nearestVertex,
  sampleIndexes,
  thinLine,
} from "@/lib/routeGeometry";
import type { Route, TripReport } from "@/lib/types";
import { getProvider } from "@/providers/registry";
import { majorSteps, osrm, stepLabel } from "@/providers/routing/osrm";
import { stepsFromInstructions, tomtomRouting } from "@/providers/routing/tomtom";
import { elementToStop, overpassStops } from "@/providers/stops/overpass";
import { nearestHourIndex, openMeteo } from "@/providers/weather/openMeteo";
import { collapseToSettlement } from "@/services/LocationService";
import { ParkingService } from "@/services/ParkingService";
import { buildTripFacts } from "@/services/SituationSummaryService";
import { TripService, assessTrip, etaOffsetAt, roadAt } from "@/services/TripService";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

const JERUSALEM = { lat: 31.7833, lon: 35.2186 };
const TEL_AVIV = { lat: 32.0853, lon: 34.7818 };

/** A straight 4-point line of roughly 3 × 11.1 km. */
const line: Array<[number, number]> = [
  [31.0, 35.0],
  [31.1, 35.0],
  [31.2, 35.0],
  [31.3, 35.0],
];

describe("route geometry", () => {
  it("accumulates distances and samples evenly", () => {
    const cum = cumulativeDistances(line);
    expect(cum[0]).toBe(0);
    expect(cum[3]).toBeCloseTo(33_358, -2);
    expect(sampleIndexes(cum, { everyM: 10_000, max: 10 })).toEqual([0, 1, 2, 3]);
    expect(sampleIndexes(cum, { everyM: 1000, max: 2 })).toEqual([0, 3]);
    expect(sampleIndexes([0], { everyM: 1000, max: 5 })).toEqual([0]);
  });

  it("interpolates values along the line", () => {
    const cum = cumulativeDistances(line);
    const values = [0, 600, 1200, 1800];
    expect(interpolateAlong(cum, values, 0)).toBe(0);
    expect(interpolateAlong(cum, values, cum[3]!)).toBe(1800);
    expect(interpolateAlong(cum, values, cum[1]! / 2)).toBeCloseTo(300, 0);
  });

  it("finds the nearest vertex, bounds and thins long lines", () => {
    expect(nearestVertex(line, { lat: 31.19, lon: 35.01 }).index).toBe(2);
    expect(nearestVertex(line, { lat: 40, lon: 40 }).index).toBe(-1);
    const [s, w, n, e] = lineBounds(line, 1000);
    expect(s).toBeLessThan(31);
    expect(n).toBeGreaterThan(31.3);
    expect(w).toBeLessThan(35);
    expect(e).toBeGreaterThan(35);
    const long = Array.from({ length: 500 }, (_, i) => [31 + i / 1000, 35] as [number, number]);
    const thin = thinLine(long, 80);
    expect(thin.length).toBeLessThanOrEqual(81);
    expect(thin[thin.length - 1]).toEqual(long[499]);
  });
});

describe("OSRM provider", () => {
  it("labels and merges steps by road number", () => {
    expect(stepLabel({ ref: "1", name: "כביש ירושלים תל אביב" })).toBe("1 · כביש ירושלים תל אביב");
    expect(stepLabel({ ref: "1;2", name: "" })).toBe("1");
    expect(stepLabel({ name: "Jaffa" })).toBe("Jaffa");
    const steps = majorSteps(
      [
        { name: "Local", distance: 300, duration: 60 },
        { ref: "443", name: "A", distance: 2000, duration: 100 },
        { ref: "443", name: "B", distance: 3000, duration: 150 },
        { ref: "1", name: "C", distance: 500, duration: 30 },
        { ref: "20", name: "Ayalon", distance: 4000, duration: 200 },
      ],
      1500,
    );
    expect(steps).toEqual([
      { name: "443 · A", distanceAlongM: 300, distanceM: 5000, durationS: 250 },
      { name: "20 · Ayalon", distanceAlongM: 5800, distanceM: 4000, durationS: 200 },
    ]);
  });

  it("calls the route endpoint and maps the response", async () => {
    restore = withEnv({ OSRM_URL: "https://osrm.example.org/routed-car" });
    mockFetch((url) => {
      expect(url.pathname).toBe(
        "/routed-car/route/v1/driving/35.218600,31.783300;34.781800,32.085300",
      );
      expect(url.searchParams.get("geometries")).toBe("geojson");
      return jsonResponse({
        code: "Ok",
        routes: [
          {
            distance: 66_100,
            duration: 3540,
            geometry: {
              type: "LineString",
              coordinates: [
                [35.2186, 31.7833],
                [35.0, 31.9],
                [34.7818, 32.0853],
              ],
            },
            legs: [
              {
                steps: [
                  {
                    ref: "1",
                    name: "Hwy",
                    distance: 60_000,
                    duration: 3000,
                    maneuver: { type: "depart" },
                  },
                ],
                annotation: { duration: [1800, 1740] },
              },
            ],
          },
        ],
      });
    });
    const route = await osrm.create(getConfig()).route(JERUSALEM, TEL_AVIV, "car", "he");
    expect(route).toMatchObject({
      distanceM: 66_100,
      durationS: 3540,
      trafficAware: false,
      roads: ["1 · Hwy"],
    });
    expect(route.geometry[0]).toEqual([31.7833, 35.2186]);
    expect(route.cumulativeDurationS).toEqual([0, 1800, 3540]);
  });

  it("surfaces OSRM error codes", async () => {
    restore = withEnv({ OSRM_URL: "https://osrm.example.org/routed-car" });
    mockFetch(() => jsonResponse({ code: "NoRoute", message: "Impossible route." }));
    await expect(osrm.create(getConfig()).route(JERUSALEM, TEL_AVIV, "car", "en")).rejects.toThrow(
      /NoRoute/,
    );
  });
});

describe("TomTom routing provider", () => {
  it("maps traffic sections, delay and progress", async () => {
    restore = withEnv({ TOMTOM_API_KEY: "k", TOMTOM_URL: "https://tt.example.org" });
    mockFetch((url) => {
      expect(url.pathname).toBe(
        "/routing/1/calculateRoute/31.783300,35.218600:32.085300,34.781800/json",
      );
      expect(url.searchParams.get("traffic")).toBe("true");
      expect(url.searchParams.get("sectionType")).toBe("traffic");
      return jsonResponse({
        routes: [
          {
            summary: {
              lengthInMeters: 66_000,
              travelTimeInSeconds: 4200,
              trafficDelayInSeconds: 600,
              noTrafficTravelTimeInSeconds: 3600,
              departureTime: "2026-10-20T08:00:00+03:00",
            },
            legs: [
              {
                points: [
                  { latitude: 31.78, longitude: 35.21 },
                  { latitude: 31.9, longitude: 35.0 },
                  { latitude: 32.0, longitude: 34.85 },
                  { latitude: 32.08, longitude: 34.78 },
                ],
              },
            ],
            sections: [
              {
                sectionType: "TRAFFIC",
                startPointIndex: 1,
                endPointIndex: 2,
                simpleCategory: "JAM",
                effectiveSpeedInKmh: 25,
                delayInSeconds: 540,
                magnitudeOfDelay: 3,
              },
            ],
            guidance: {
              instructions: [
                {
                  routeOffsetInMeters: 0,
                  travelTimeInSeconds: 0,
                  street: "Begin",
                  roadNumbers: ["1"],
                },
                {
                  routeOffsetInMeters: 50_000,
                  travelTimeInSeconds: 3000,
                  street: "Ayalon",
                  roadNumbers: ["20"],
                },
              ],
            },
            progress: [
              { pointIndex: 0, travelTimeInSeconds: 0, distanceInMeters: 0 },
              { pointIndex: 3, travelTimeInSeconds: 4200, distanceInMeters: 66_000 },
            ],
          },
        ],
      });
    });
    const route = await tomtomRouting.create(getConfig()).route(JERUSALEM, TEL_AVIV, "car", "en");
    expect(route).toMatchObject({
      distanceM: 66_000,
      durationS: 4200,
      trafficAware: true,
      trafficDelayS: 600,
      noTrafficDurationS: 3600,
    });
    expect(route.trafficSections).toHaveLength(1);
    expect(route.trafficSections![0]).toMatchObject({
      category: "jam",
      severity: "major",
      effectiveSpeedKmh: 25,
      delayS: 540,
      startIndex: 1,
      endIndex: 2,
    });
    expect(route.trafficSections![0]!.lengthM).toBeGreaterThan(10_000);
    expect(route.steps.map((s) => s.name)).toEqual(["1 · Begin", "20 · Ayalon"]);
    expect(route.cumulativeDurationS).toHaveLength(4);
    expect(route.cumulativeDurationS![3]).toBe(4200);
  });

  it("merges instructions on the same road number", () => {
    const steps = stepsFromInstructions(
      [
        { routeOffsetInMeters: 0, travelTimeInSeconds: 0, street: "A", roadNumbers: ["443"] },
        { routeOffsetInMeters: 2000, travelTimeInSeconds: 100, street: "B", roadNumbers: ["443"] },
        { routeOffsetInMeters: 9000, travelTimeInSeconds: 400, street: "C" },
      ],
      10_000,
      500,
    );
    expect(steps).toEqual([
      { name: "443 · A", distanceAlongM: 0, distanceM: 9000, durationS: 400 },
    ]);
  });
});

describe("Open-Meteo forecastAt", () => {
  it("uses current conditions for soon and the hourly slot for later", async () => {
    restore = withEnv({ OPEN_METEO_URL: "https://meteo.example.org" });
    const now = Date.now();
    const hour = (offset: number) =>
      new Date(Math.floor(now / 3_600_000) * 3_600_000 + offset * 3_600_000)
        .toISOString()
        .slice(0, 16);
    const body = (temp: number) => ({
      current: {
        time: hour(0),
        temperature_2m: temp,
        weather_code: 1,
        precipitation: 0,
        wind_speed_10m: 5,
        visibility: 20_000,
        is_day: 1,
      },
      hourly: {
        time: [hour(0), hour(1), hour(2)],
        temperature_2m: [temp, temp + 1, temp + 2],
        weather_code: [1, 2, 3],
        precipitation: [0, 0.5, 1],
        wind_speed_10m: [5, 6, 7],
        visibility: [20_000, 15_000, 10_000],
        is_day: [1, 1, 0],
      },
    });
    mockFetch((url) => {
      expect(url.searchParams.get("latitude")).toBe("31.000,32.000");
      expect(url.searchParams.get("hourly")).toContain("temperature_2m");
      return jsonResponse([body(10), body(20)]);
    });
    const result = await openMeteo.create(getConfig()).forecastAt!([
      { lat: 31, lon: 35, at: new Date(now + 5 * 60_000) },
      { lat: 32, lon: 35, at: new Date(now + 2 * 3_600_000) },
    ]);
    expect(result[0]).toMatchObject({ kind: "current", temperatureC: 10 });
    expect(result[1]!.kind).toBe("forecast");
    expect(result[1]!.temperatureC).toBeGreaterThanOrEqual(21);
    expect(
      nearestHourIndex(["2026-10-20T08:00", "2026-10-20T09:00"], new Date("2026-10-20T08:40:00Z")),
    ).toBe(1);
  });
});

describe("stops", () => {
  const cum = cumulativeDistances(line);
  it("maps fuel stations and rest areas with facilities and distance along the route", () => {
    const stop = elementToStop(
      {
        type: "node",
        id: 1,
        lat: 31.1005,
        lon: 35.001,
        tags: {
          amenity: "fuel",
          brand: "Paz",
          toilets: "yes",
          shop: "convenience",
          opening_hours: "24/7",
        },
      },
      line,
      cum,
    );
    expect(stop).toMatchObject({
      kind: "fuel",
      brand: "Paz",
      openingHours: "24/7",
      facilities: ["toilets", "shop"],
    });
    expect(stop!.distanceAlongM).toBeCloseTo(cum[1]!, -2);
    expect(stop!.detourM).toBeLessThan(200);
    expect(
      elementToStop(
        { type: "way", id: 2, center: { lat: 31.2, lon: 35 }, tags: { highway: "rest_area" } },
        line,
        cum,
      )?.kind,
    ).toBe("rest_area");
    expect(
      elementToStop(
        { type: "node", id: 3, lat: 31.2, lon: 35, tags: { amenity: "fuel", access: "private" } },
        line,
        cum,
      ),
    ).toBeNull();
    expect(
      elementToStop(
        { type: "node", id: 4, lat: 31.2, lon: 35, tags: { amenity: "cafe" } },
        line,
        cum,
      ),
    ).toBeNull();
  });

  it("queries a thinned corridor", async () => {
    restore = withEnv({ OVERPASS_URLS: "https://overpass.example.org/api/interpreter" });
    mockFetch(async (_url, init) => {
      const ql = new URLSearchParams(String(init?.body)).get("data")!;
      expect(ql).toContain('["amenity"="fuel"](around:400,');
      expect(ql).toContain("rest_area|services");
      return jsonResponse({
        elements: [
          { type: "node", id: 9, lat: 31.1, lon: 35, tags: { amenity: "charging_station" } },
        ],
      });
    });
    const stops = await overpassStops.create(getConfig()).stopsAlong(line, 400);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.kind).toBe("charging");
  });
});

describe("TripService helpers", () => {
  const route: Route = {
    geometry: line,
    distanceM: 33_000,
    durationS: 1800,
    trafficAware: false,
    roads: ["1 · Hwy"],
    steps: [{ name: "1 · Hwy", distanceAlongM: 5000, distanceM: 20_000, durationS: 1000 }],
    source: { providerId: "osrm", name: "OSRM", attribution: "", fetchedAt: "" },
  };
  it("looks up the road at a distance and the ETA offset", () => {
    expect(roadAt(route, 10_000)).toBe("1 · Hwy");
    expect(roadAt(route, 1000)).toBeUndefined();
    const cum = cumulativeDistances(line);
    expect(etaOffsetAt(route, cum, 16_500)).toBeCloseTo(900, 0);
    const timed = { ...route, cumulativeDurationS: [0, 100, 200, 1800] };
    expect(etaOffsetAt(timed, cum, cum[1]!)).toBe(100);
  });

  it("assesses missing data and confidence", () => {
    const ok = { status: "ok", data: [], freshness: "live", sources: [] } as unknown as never;
    const off = { status: "unavailable", reason: "not_configured" } as unknown as never;
    expect(
      assessTrip({
        route: off,
        weatherAlong: ok,
        trafficAlong: ok,
        incidents: ok,
        stops: ok,
        destinationParking: ok,
      }),
    ).toEqual({ missing: ["route"], confidence: "low" });
    expect(
      assessTrip({
        route: ok,
        weatherAlong: ok,
        trafficAlong: off,
        incidents: off,
        stops: off,
        destinationParking: ok,
      }),
    ).toEqual({ missing: ["traffic", "incidents", "stops"], confidence: "medium" });
    expect(
      assessTrip({
        route: ok,
        weatherAlong: ok,
        trafficAlong: ok,
        incidents: ok,
        stops: ok,
        destinationParking: ok,
      }).confidence,
    ).toBe("high");
  });
});

describe("TripService.plan", () => {
  it("plans a trip with OSRM and Open-Meteo and rejects trivial or too-long trips", async () => {
    restore = withEnv({
      OSRM_URL: "https://osrm.example.org/routed-car",
      OPEN_METEO_URL: "https://meteo.example.org",
      PARKING_ENABLED: "false",
      TRIP_MAX_DISTANCE_KM: "100",
    });
    mockFetch((url) => {
      if (url.hostname === "osrm.example.org") {
        return jsonResponse({
          code: "Ok",
          routes: [
            {
              distance: 33_000,
              duration: 1800,
              geometry: { type: "LineString", coordinates: line.map(([lat, lon]) => [lon, lat]) },
              legs: [{ steps: [{ ref: "1", name: "Hwy", distance: 33_000, duration: 1800 }] }],
            },
          ],
        });
      }
      if (url.hostname === "meteo.example.org") {
        const n = url.searchParams.get("latitude")!.split(",").length;
        const t = new Date().toISOString().slice(0, 16);
        return jsonResponse(
          Array.from({ length: n }, () => ({
            current: { time: t, temperature_2m: 20, weather_code: 0, is_day: 1 },
            hourly: { time: [t], temperature_2m: [20], weather_code: [0], is_day: [1] },
          })),
        );
      }
      throw new Error(`unexpected ${url.href}`);
    });
    const service = new TripService(new ParkingService());
    const report = await service.plan(
      { lat: 31, lon: 35, label: "A" },
      { lat: 31.3, lon: 35, label: "B" },
      "en",
    );
    expect(report.route.status).toBe("ok");
    expect(report.weatherAlong.status).toBe("ok");
    if (report.weatherAlong.status === "ok") {
      expect(report.weatherAlong.data.length).toBeGreaterThanOrEqual(2);
      expect(report.weatherAlong.data[0]!.temperatureC).toBe(20);
      expect(report.weatherAlong.data.at(-1)!.distanceAlongM).toBeGreaterThan(30_000);
    }
    expect(report.trafficAlong).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(report.destinationParking).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(report.missing).toContain("traffic");

    await expect(
      service.plan({ lat: 31, lon: 35 }, { lat: 31.0001, lon: 35 }, "en"),
    ).rejects.toThrow(/same place/);
    await expect(service.plan({ lat: 31, lon: 35 }, { lat: 33, lon: 35 }, "en")).rejects.toThrow(
      /longer than/,
    );
    expect(getProvider("routing")?.def.id).toBe("osrm");
  });

  it("prefers TomTom routing when keyed, unless ROUTING_PROVIDER says otherwise", () => {
    restore = withEnv({ TOMTOM_API_KEY: "k" });
    expect(getProvider("routing")?.def.id).toBe("tomtom");
    restore();
    restore = withEnv({ TOMTOM_API_KEY: "k", ROUTING_PROVIDER: "osrm" });
    expect(getProvider("routing")?.def.id).toBe("osrm");
  });
});

describe("trip facts and parsing", () => {
  it("builds facts that say whether the ETA includes traffic", () => {
    const report = {
      from: { lat: 1, lon: 2, label: "A" },
      to: { lat: 3, lon: 4, label: "B" },
      mode: "car",
      generatedAt: "",
      departureTime: "2026-10-20T08:00:00Z",
      route: {
        status: "ok",
        freshness: "unknown",
        sources: [],
        data: {
          distanceM: 66_100,
          durationS: 3540,
          trafficAware: false,
          roads: ["1"],
          steps: [],
          geometry: [],
          source: { providerId: "osrm", name: "OSRM", attribution: "", fetchedAt: "" },
        },
      },
      weatherAlong: { status: "unavailable", reason: "error" },
      trafficAlong: { status: "unavailable", reason: "not_configured" },
      incidents: { status: "unavailable", reason: "not_configured" },
      stops: {
        status: "ok",
        freshness: "unknown",
        sources: [],
        data: [
          {
            id: "s",
            kind: "fuel",
            lat: 0,
            lon: 0,
            distanceAlongM: 12_000,
            detourM: 10,
            facilities: ["toilets"],
          },
        ],
      },
      destinationParking: { status: "unavailable", reason: "error" },
      missing: ["weather", "traffic", "incidents", "parking"],
      confidence: "low",
    } as unknown as TripReport;
    const facts = buildTripFacts(report);
    expect(facts.route).toMatchObject({
      distanceKm: 66.1,
      travelTimeMinutes: 59,
      includesLiveTraffic: false,
    });
    expect(facts.placesToStop).toMatchObject({ count: 1 });
    expect(facts.weatherAlongTheWay).toEqual({ missing: "error" });
  });

  it("parses lat,lon endpoints and rejects bad input", () => {
    const params = new URLSearchParams({ from: "31.78,35.21", fromLabel: "Jerusalem" });
    expect(parseEndpoint(params, "from")).toEqual({ lat: 31.78, lon: 35.21, label: "Jerusalem" });
    expect(() => parseEndpoint(new URLSearchParams({ to: "x" }), "to")).toThrow(/lat,lon/);
    expect(() => parseEndpoint(new URLSearchParams({ to: "95,10" }), "to")).toThrow(/valid/);
  });

  it("collapses a city and places inside it to the city", () => {
    const city = {
      id: "c",
      label: "Jerusalem",
      lat: 31.78,
      lon: 35.22,
      kind: "city",
      bbox: [31.7, 35.1, 31.9, 35.3] as [number, number, number, number],
      source: { providerId: "x", name: "", attribution: "", fetchedAt: "" },
    };
    const { bbox: _cityBox, ...withoutBox } = city;
    void _cityBox;
    const inside = {
      ...withoutBox,
      id: "n",
      label: "Geula, Jerusalem",
      kind: "suburb",
      lat: 31.79,
      lon: 35.21,
    };
    const far = {
      ...withoutBox,
      id: "f",
      label: "Jerusalem, Ohio",
      kind: "village",
      lat: 40,
      lon: -82,
    };
    expect(collapseToSettlement([city, inside])).toEqual([city]);
    expect(collapseToSettlement([city, far])).toHaveLength(2);
    expect(collapseToSettlement([inside, city])).toHaveLength(2);
  });
});
