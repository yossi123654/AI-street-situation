import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import { tflJamCams } from "@/providers/cameras/tflJamCam";
import { google } from "@/providers/geocoding/google";
import { nominatim } from "@/providers/geocoding/nominatim";
import { photon } from "@/providers/geocoding/photon";
import { hereIncidents } from "@/providers/incidents/here";
import { tomtomIncidents } from "@/providers/incidents/tomtom";
import { getProvider, getProviderStatuses } from "@/providers/registry";
import { hereTraffic } from "@/providers/traffic/here";
import { levelFromJamFactor, levelFromSpeedRatio } from "@/providers/traffic/level";
import { tomtomTraffic } from "@/providers/traffic/tomtom";
import { anthropic } from "@/providers/vision/anthropic";
import { ollama } from "@/providers/vision/ollama";
import { openMeteo } from "@/providers/weather/openMeteo";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

const point = { lat: 31.7833, lon: 35.2186 };

describe("nominatim", () => {
  it("maps search results and sends an identifying User-Agent", async () => {
    restore = withEnv({
      NOMINATIM_URL: "https://geo.example.org",
      APP_USER_AGENT: "TestAgent/1.0",
    });
    const fetch = mockFetch((url) => {
      expect(url.pathname).toBe("/search");
      expect(url.searchParams.get("q")).toBe("Jaffa Street");
      expect(url.searchParams.get("accept-language")).toBe("en");
      return jsonResponse([
        {
          place_id: 1,
          osm_type: "way",
          osm_id: 42,
          lat: "31.78",
          lon: "35.21",
          display_name: "Jaffa Street, Jerusalem",
          addresstype: "road",
          boundingbox: ["31.77", "31.79", "35.20", "35.22"],
        },
      ]);
    });
    const places = await nominatim.create(getConfig()).search("Jaffa Street", "en");
    expect(places).toEqual([
      expect.objectContaining({
        id: "nominatim:way42",
        label: "Jaffa Street, Jerusalem",
        lat: 31.78,
        lon: 35.21,
        kind: "road",
        bbox: [31.77, 35.2, 31.79, 35.22],
      }),
    ]);
    const headers = new Headers(fetch.mock.calls[0]![1]?.headers);
    expect(headers.get("User-Agent")).toBe("TestAgent/1.0");
  });

  it("returns null when reverse geocoding finds nothing", async () => {
    restore = withEnv({ NOMINATIM_URL: "https://geo.example.org" });
    mockFetch(() => jsonResponse({ error: "Unable to geocode" }));
    expect(await nominatim.create(getConfig()).reverse(point, "he")).toBeNull();
  });
});

describe("photon", () => {
  it("builds labels and falls back to local names for Hebrew", async () => {
    restore = withEnv({ GEOCODING_PROVIDER: "photon", PHOTON_URL: "https://photon.example.org" });
    mockFetch((url) => {
      expect(url.searchParams.get("lang")).toBe("default");
      return jsonResponse({
        features: [
          {
            geometry: { coordinates: [35.21, 31.78] },
            properties: {
              osm_type: "W",
              osm_id: 7,
              name: "Jaffa Street",
              city: "Jerusalem",
              country: "Israel",
            },
          },
        ],
      });
    });
    const [place] = await photon.create(getConfig()).search("יפו", "he");
    expect(place).toMatchObject({
      label: "Jaffa Street, Jerusalem, Israel",
      lat: 31.78,
      lon: 35.21,
    });
  });
});

describe("google geocoding", () => {
  it("is only enabled when selected and keyed", () => {
    expect(
      google.isEnabled({
        ...getConfig(),
        GEOCODING_PROVIDER: "google",
        GOOGLE_MAPS_API_KEY: undefined,
      }),
    ).toBe(false);
    expect(
      google.isEnabled({ ...getConfig(), GEOCODING_PROVIDER: "google", GOOGLE_MAPS_API_KEY: "k" }),
    ).toBe(true);
  });

  it("treats ZERO_RESULTS as an empty list and other statuses as errors", async () => {
    restore = withEnv({ GEOCODING_PROVIDER: "google", GOOGLE_MAPS_API_KEY: "k" });
    mockFetch(() => jsonResponse({ status: "ZERO_RESULTS", results: [] }));
    expect(await google.create(getConfig()).search("nowhere", "en")).toEqual([]);
    mockFetch(() => jsonResponse({ status: "REQUEST_DENIED", results: [] }));
    await expect(google.create(getConfig()).search("x", "en")).rejects.toThrow(/REQUEST_DENIED/);
  });
});

describe("open-meteo", () => {
  it("normalises current conditions and converts the GMT time to ISO", async () => {
    restore = withEnv({ OPEN_METEO_URL: "https://meteo.example.org" });
    mockFetch((url) => {
      expect(url.pathname).toBe("/v1/forecast");
      expect(url.searchParams.get("timezone")).toBe("GMT");
      return jsonResponse({
        current: {
          time: "2026-10-14T09:45",
          temperature_2m: 21.5,
          relative_humidity_2m: 60,
          apparent_temperature: 22,
          precipitation: 0.2,
          weather_code: 61,
          cloud_cover: 80,
          wind_speed_10m: 14,
          wind_direction_10m: 270,
          visibility: null,
          is_day: 1,
        },
      });
    });
    const weather = await openMeteo.create(getConfig()).current(point);
    expect(weather).toMatchObject({
      temperatureC: 21.5,
      weatherCode: 61,
      visibilityM: null,
      isDay: true,
    });
    expect(weather.source.observedAt).toBe("2026-10-14T09:45:00.000Z");
    expect(weather.source.attribution).toMatch(/Open-Meteo/);
  });

  it("surfaces HTTP errors", async () => {
    restore = withEnv({ OPEN_METEO_URL: "https://meteo.example.org" });
    mockFetch(() => new Response("nope", { status: 500 }));
    await expect(openMeteo.create(getConfig()).current(point)).rejects.toThrow(/HTTP 500/);
  });
});

describe("traffic levels", () => {
  it("maps speed ratios and jam factors", () => {
    expect(levelFromSpeedRatio(38, 40)).toBe("free");
    expect(levelFromSpeedRatio(25, 40)).toBe("moderate");
    expect(levelFromSpeedRatio(15, 40)).toBe("heavy");
    expect(levelFromSpeedRatio(5, 40)).toBe("severe");
    expect(levelFromSpeedRatio(null, 40)).toBe("unknown");
    expect(levelFromJamFactor(1)).toBe("free");
    expect(levelFromJamFactor(6)).toBe("heavy");
    expect(levelFromJamFactor(10)).toBe("closed");
  });
});

describe("tomtom", () => {
  it("reads flow segment data", async () => {
    restore = withEnv({ TOMTOM_API_KEY: "secret", TOMTOM_URL: "https://tt.example.org" });
    mockFetch((url) => {
      expect(url.pathname).toBe("/traffic/services/4/flowSegmentData/absolute/10/json");
      expect(url.searchParams.get("key")).toBe("secret");
      return jsonResponse({
        flowSegmentData: { currentSpeed: 30, freeFlowSpeed: 40, confidence: 0.9 },
      });
    });
    const [flow] = await tomtomTraffic.create(getConfig()).flow(point, 500);
    expect(flow).toMatchObject({
      currentSpeedKmh: 30,
      freeFlowSpeedKmh: 40,
      level: "moderate",
      congestion: 0.25,
    });
  });

  it("maps incident categories, severity and distance", async () => {
    restore = withEnv({ TOMTOM_API_KEY: "secret", TOMTOM_URL: "https://tt.example.org" });
    mockFetch((url) => {
      expect(url.searchParams.get("language")).toBe("he-IL");
      expect(url.searchParams.get("bbox")?.split(",")).toHaveLength(4);
      return jsonResponse({
        incidents: [
          {
            geometry: { type: "Point", coordinates: [35.2186, 31.7833] },
            properties: {
              id: "a",
              iconCategory: 8,
              magnitudeOfDelay: 4,
              events: [{ description: "Road closed" }],
            },
          },
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [35.23, 31.79],
                [35.24, 31.8],
              ],
            },
            properties: { id: "b", iconCategory: 1, magnitudeOfDelay: 3 },
          },
        ],
      });
    });
    const incidents = await tomtomIncidents.create(getConfig()).incidents(point, 2000, "he");
    expect(incidents[0]).toMatchObject({
      id: "tomtom:a",
      type: "closure",
      severity: "major",
      roadClosed: true,
      distanceM: 0,
    });
    expect(incidents[1]).toMatchObject({ type: "accident", severity: "major" });
    expect(incidents[1]!.distanceM).toBeGreaterThan(1000);
  });
});

describe("here", () => {
  it("converts m/s speeds and sorts by congestion", async () => {
    restore = withEnv({ HERE_API_KEY: "k", HERE_TRAFFIC_URL: "https://here.example.org" });
    mockFetch((url) => {
      expect(url.searchParams.get("in")).toMatch(/^circle:31\.7833,35\.2186;r=500$/);
      return jsonResponse({
        sourceUpdated: "2026-10-14T10:00:00Z",
        results: [
          {
            location: { description: "A" },
            currentFlow: { speed: 10, freeFlow: 12, jamFactor: 1 },
          },
          {
            location: { description: "B" },
            currentFlow: { speed: 2, freeFlow: 12, jamFactor: 8.5 },
          },
        ],
      });
    });
    const flows = await hereTraffic.create(getConfig()).flow(point, 500);
    expect(flows.map((f) => f.roadName)).toEqual(["B", "A"]);
    expect(flows[1]).toMatchObject({ currentSpeedKmh: 36, freeFlowSpeedKmh: 43, level: "free" });
    expect(flows[0]!.source.observedAt).toBe("2026-10-14T10:00:00Z");
  });

  it("maps incidents", async () => {
    restore = withEnv({ HERE_API_KEY: "k", HERE_TRAFFIC_URL: "https://here.example.org" });
    mockFetch(() =>
      jsonResponse({
        results: [
          {
            location: {
              description: "Road 1",
              shape: { links: [{ points: [{ lat: 31.7833, lng: 35.2186 }] }] },
            },
            incidentDetails: {
              id: "x",
              type: "construction",
              criticality: "minor",
              roadClosed: false,
              description: { value: "Works" },
            },
          },
        ],
      }),
    );
    const [incident] = await hereIncidents.create(getConfig()).incidents(point, 2000, "en");
    expect(incident).toMatchObject({
      type: "roadworks",
      severity: "moderate",
      description: "Works",
      distanceM: 0,
    });
  });
});

describe("tfl jamcams", () => {
  it("maps places to cameras with TfL attribution", async () => {
    restore = withEnv({ TFL_APP_KEY: "k", TFL_API_URL: "https://tfl.example.org" });
    mockFetch((url) => {
      expect(url.pathname).toBe("/Place/Type/JamCam");
      return jsonResponse([
        {
          id: "JamCams_00001.01251",
          commonName: "Trafalgar Sq",
          lat: 51.508,
          lon: -0.128,
          additionalProperties: [
            { key: "available", value: "true" },
            {
              key: "imageUrl",
              value: "https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/00001.01251.jpg",
            },
          ],
        },
        { id: "JamCams_broken", lat: 51.5, lon: -0.1, additionalProperties: [] },
      ]);
    });
    const cameras = await tflJamCams.create(getConfig()).list();
    expect(cameras).toHaveLength(1);
    expect(cameras[0]).toMatchObject({
      id: "gb-tfl-00001-01251",
      available: true,
      license: { attribution: "Powered by TfL Open Data" },
      permissions: { embedAllowed: true, aiAnalysisAllowed: true },
    });
  });
});

describe("ai providers", () => {
  it("calls Ollama's chat API with the image as base64", async () => {
    restore = withEnv({ OLLAMA_URL: "http://ollama.local:11434", OLLAMA_MODEL: "llava" });
    mockFetch(async (url, init) => {
      expect(url.href).toBe("http://ollama.local:11434/api/chat");
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ model: "llava", stream: false, format: "json" });
      expect(body.messages[1].images).toEqual([Buffer.from("img").toString("base64")]);
      return jsonResponse({ message: { content: '{"ok":true}' } });
    });
    const text = await ollama.create(getConfig()).complete({
      system: "s",
      prompt: "p",
      image: { data: Buffer.from("img"), mimeType: "image/jpeg" },
      json: true,
    });
    expect(text).toBe('{"ok":true}');
  });

  it("calls the Anthropic Messages API with the key in a header", async () => {
    restore = withEnv({
      ANTHROPIC_API_KEY: "sk-test",
      ANTHROPIC_URL: "https://anthropic.example.org",
    });
    mockFetch(async (url, init) => {
      expect(url.pathname).toBe("/v1/messages");
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("sk-test");
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content[0]).toMatchObject({
        type: "image",
        source: { type: "base64", media_type: "image/png" },
      });
      return jsonResponse({ content: [{ type: "text", text: "Hello" }] });
    });
    const text = await anthropic.create(getConfig()).complete({
      system: "s",
      prompt: "p",
      image: { data: Buffer.from("img"), mimeType: "image/png" },
    });
    expect(text).toBe("Hello");
  });
});

describe("registry", () => {
  it("enables only keyless providers by default", () => {
    restore = withEnv({});
    const statuses = getProviderStatuses();
    const enabled = statuses.filter((s) => s.enabled).map((s) => `${s.kind}:${s.id}`);
    expect(enabled).toEqual([
      "geocoding:nominatim",
      "weather:open-meteo",
      "cameras:community",
      "cameras:digitraffic-weathercams",
      "cameras:sg-lta-traffic-images",
      "parking:overpass",
      "routing:osrm",
      "stops:overpass-stops",
    ]);
    expect(getProvider("traffic")).toBeUndefined();
    expect(getProvider("ai")).toBeUndefined();
  });

  it("honours explicit provider preferences", () => {
    restore = withEnv({
      TOMTOM_API_KEY: "a",
      HERE_API_KEY: "b",
      TRAFFIC_PROVIDER: "here",
      OLLAMA_URL: "http://o:1",
      ANTHROPIC_API_KEY: "c",
      AI_PROVIDER: "anthropic",
    });
    expect(getProvider("traffic")?.def.id).toBe("here");
    expect(getProvider("incidents")?.def.id).toBe("here");
    expect(getProvider("ai")?.def.id).toBe("anthropic");
  });

  it("never exposes secrets in provider statuses", () => {
    restore = withEnv({ TOMTOM_API_KEY: "super-secret-key" });
    expect(JSON.stringify(getProviderStatuses())).not.toContain("super-secret-key");
  });
});
