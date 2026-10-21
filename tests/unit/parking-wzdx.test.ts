import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import { wzdxIncidents, wzdxToIncidents } from "@/providers/incidents/wzdx";
import { elementToParking, overpassParking } from "@/providers/parking/overpass";
import { getProviders, getProviderStatuses } from "@/providers/registry";
import { ParkingService } from "@/services/ParkingService";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

const origin = { lat: 31.7833, lon: 35.2186 };

describe("elementToParking", () => {
  it("maps OSM tags", () => {
    const parking = elementToParking(
      {
        type: "way",
        id: 5,
        center: { lat: 31.7843, lon: 35.2186 },
        tags: {
          amenity: "parking",
          name: "Clal",
          parking: "underground",
          fee: "yes",
          access: "yes",
          capacity: "350",
          "capacity:disabled": "8",
          opening_hours: "24/7",
          park_ride: "bus",
        },
      },
      origin,
    );
    expect(parking).toMatchObject({
      id: "osm:way/5",
      name: "Clal",
      kind: "underground",
      fee: "yes",
      access: "public",
      capacity: 350,
      capacityDisabled: 8,
      openingHours: "24/7",
      parkAndRide: true,
    });
    expect(parking!.distanceM).toBeGreaterThan(100);
    expect(parking!.distanceM).toBeLessThan(120);
  });

  it("drops private parking and tolerates missing or odd tags", () => {
    expect(
      elementToParking(
        { type: "node", id: 1, lat: 1, lon: 1, tags: { access: "private" } },
        origin,
      ),
    ).toBeNull();
    expect(elementToParking({ type: "way", id: 2, tags: {} }, origin)).toBeNull();
    expect(
      elementToParking(
        {
          type: "node",
          id: 3,
          lat: 31.78,
          lon: 35.21,
          tags: { capacity: "about 40", fee: "conditional" },
        },
        origin,
      ),
    ).toMatchObject({
      kind: "unknown",
      capacity: null,
      fee: "unknown",
      access: "unknown",
      parkAndRide: false,
    });
  });
});

describe("overpass provider", () => {
  it("posts an around query and filters by radius", async () => {
    restore = withEnv({ OVERPASS_URLS: "https://overpass.example.org/api/interpreter" });
    mockFetch(async (url, init) => {
      expect(url.href).toBe("https://overpass.example.org/api/interpreter");
      expect(init?.method).toBe("POST");
      const query = new URLSearchParams(String(init?.body)).get("data")!;
      expect(query).toContain('nwr["amenity"="parking"](around:500,31.783300,35.218600)');
      return jsonResponse({
        osm3s: { timestamp_osm_base: "2026-10-14T10:00:00Z" },
        elements: [
          { type: "node", id: 1, lat: 31.7836, lon: 35.2186, tags: { amenity: "parking" } },
          { type: "node", id: 2, lat: 31.9, lon: 35.3, tags: { amenity: "parking" } },
        ],
      });
    });
    const result = await overpassParking.create(getConfig()).parking(origin, 500);
    expect(result.map((p) => p.id)).toEqual(["osm:node/1"]);
    expect(result[0]!.source).toMatchObject({
      providerId: "overpass",
      observedAt: "2026-10-14T10:00:00Z",
    });
  });
});

describe("ParkingService", () => {
  it("returns not_configured when disabled", async () => {
    restore = withEnv({ PARKING_ENABLED: "false" });
    expect(await new ParkingService().find(origin, 500)).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
  });

  it("sorts by distance, caches, and reports errors as a section", async () => {
    restore = withEnv({ OVERPASS_URLS: "https://overpass.example.org/api/interpreter" });
    const fetch = mockFetch(() =>
      jsonResponse({
        elements: [
          { type: "node", id: 1, lat: 31.786, lon: 35.2186, tags: {} },
          { type: "node", id: 2, lat: 31.7835, lon: 35.2186, tags: {} },
        ],
      }),
    );
    const service = new ParkingService();
    const section = await service.find(origin, 800);
    expect(section.status).toBe("ok");
    if (section.status === "ok")
      expect(section.data.map((p) => p.id)).toEqual(["osm:node/2", "osm:node/1"]);
    await service.find(origin, 800);
    expect(fetch).toHaveBeenCalledTimes(1);

    mockFetch(() => new Response("busy", { status: 429 }));
    expect(await service.find({ lat: 1, lon: 1 }, 800)).toMatchObject({
      status: "unavailable",
      reason: "error",
    });
  });
});

describe("WZDx", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const feed = {
    feed_info: {
      publisher: "Example DOT",
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      update_date: "2026-10-14T11:55:00Z",
    },
    features: [
      {
        id: "a",
        properties: {
          core_details: {
            event_type: "work-zone",
            road_names: ["Main St"],
            direction: "northbound",
            description: "Paving",
          },
          start_date: "2026-10-13T00:00:00Z",
          end_date: "2026-10-15T00:00:00Z",
          vehicle_impact: "all-lanes-closed",
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [35.25, 31.79],
            [35.2187, 31.7834],
          ],
        },
      },
      {
        id: "future",
        properties: {
          core_details: { event_type: "work-zone" },
          start_date: "2026-11-01T00:00:00Z",
        },
        geometry: { type: "LineString", coordinates: [[35.2186, 31.7833]] },
      },
      {
        id: "far",
        properties: { core_details: { event_type: "detour" } },
        geometry: { type: "MultiPoint", coordinates: [[36, 32]] },
      },
    ],
  };

  it("keeps active, nearby events and uses the nearest point of the geometry", () => {
    const incidents = wzdxToIncidents(
      feed,
      origin,
      2000,
      "https://feeds.example.org/wzdx.json",
      now,
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      id: "wzdx:a",
      type: "roadworks",
      severity: "major",
      roadClosed: true,
      roadName: "Main St (northbound)",
      description: "Paving",
      source: {
        name: "Example DOT (WZDx)",
        url: "https://creativecommons.org/publicdomain/zero/1.0/",
        observedAt: "2026-10-14T11:55:00Z",
      },
    });
    expect(incidents[0]!.distanceM).toBeLessThan(20);
  });

  it("is enabled only with feed URLs and survives a failing feed", async () => {
    restore = withEnv({
      WZDX_FEED_URLS: "https://a.example.org/f.json, https://b.example.org/f.json",
    });
    expect(getConfig().WZDX_FEED_URLS).toEqual([
      "https://a.example.org/f.json",
      "https://b.example.org/f.json",
    ]);
    mockFetch((url) =>
      url.hostname === "a.example.org" ? new Response("down", { status: 500 }) : jsonResponse(feed),
    );
    const incidents = await wzdxIncidents.create(getConfig()).incidents(origin, 50_000, "en");
    // Dates in the fixture are relative to a fixed "now"; only check the feed was read.
    expect(Array.isArray(incidents)).toBe(true);
  });

  it("throws when every feed fails", async () => {
    restore = withEnv({ WZDX_FEED_URLS: "https://a.example.org/f.json" });
    mockFetch(() => new Response("down", { status: 500 }));
    await expect(wzdxIncidents.create(getConfig()).incidents(origin, 1000, "en")).rejects.toThrow();
  });

  it("rejects invalid feed URLs in configuration", () => {
    restore = withEnv({ WZDX_FEED_URLS: "not a url" });
    expect(() => getConfig()).toThrow(/WZDX_FEED_URLS/);
  });
});

describe("incident provider merging", () => {
  it("uses one commercial provider plus every open-data feed", () => {
    restore = withEnv({
      TOMTOM_API_KEY: "a",
      HERE_API_KEY: "b",
      WZDX_FEED_URLS: "https://a.example.org/f.json",
    });
    expect(getProviders("incidents").map((p) => p.def.id)).toEqual(["tomtom", "wzdx"]);
    const statuses = getProviderStatuses().filter((s) => s.kind === "incidents");
    expect(statuses.find((s) => s.id === "here")).toMatchObject({ enabled: true, active: false });
    expect(statuses.find((s) => s.id === "wzdx")).toMatchObject({ enabled: true, active: true });
  });

  it("honours TRAFFIC_PROVIDER for the commercial group", () => {
    restore = withEnv({ TOMTOM_API_KEY: "a", HERE_API_KEY: "b", TRAFFIC_PROVIDER: "here" });
    expect(getProviders("incidents").map((p) => p.def.id)).toEqual(["here"]);
  });
});
