import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/messages/en.json";
import he from "@/i18n/messages/he.json";
import { translate } from "@/i18n/config";
import { parseConfig } from "@/lib/config";
import type { Camera, SituationReport, Section } from "@/lib/types";
import { CameraImageService } from "@/services/CameraImageService";
import { CameraRegistry } from "@/services/CameraRegistry";
import { assessReport } from "@/services/SituationService";
import { buildSummaryFacts } from "@/services/SituationSummaryService";
import { parseVisionResponse } from "@/services/VisionAnalyzer";
import { mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

describe("parseVisionResponse", () => {
  it("extracts JSON wrapped in prose", () => {
    const parsed = parseVisionResponse(
      'Here you go: {"traffic":{"level":"heavy","description":"Dense"},"weather":"Rain","visibility":"poor","notes":"","uncertainty":"medium"} done',
    );
    expect(parsed).toMatchObject({
      traffic: { level: "heavy" },
      visibility: "poor",
      uncertainty: "medium",
    });
  });

  it("coerces invalid enum values to safe defaults", () => {
    const parsed = parseVisionResponse(
      '{"traffic":{"level":"gridlock"},"visibility":"great","uncertainty":"none"}',
    );
    expect(parsed).toMatchObject({
      traffic: { level: "unknown" },
      visibility: "unknown",
      uncertainty: "high",
    });
  });

  it("falls back to high uncertainty for non-JSON output", () => {
    const parsed = parseVisionResponse("I cannot see anything.");
    expect(parsed.uncertainty).toBe("high");
    expect(parsed.notes).toBe("I cannot see anything.");
  });
});

const source = { providerId: "p", name: "P", attribution: "", fetchedAt: "2026-10-14T10:00:00Z" };
const unavailable = { status: "unavailable", reason: "not_configured" } as const;
function ok<T>(data: T, freshness: "live" | "stale" = "live"): Section<T> {
  return { status: "ok", data, freshness, sources: [source] };
}

describe("assessReport", () => {
  it("reports low confidence and missing data with only weather", () => {
    const result = assessReport({
      weather: ok({} as never),
      traffic: unavailable,
      incidents: unavailable,
      cameras: ok([]),
    });
    expect(result.confidence).toBe("low");
    expect(result.missing).toEqual(["traffic", "incidents", "cameras"]);
  });

  it("flags stale data", () => {
    const result = assessReport({
      weather: ok({} as never, "stale"),
      traffic: ok([]),
      incidents: ok([]),
      cameras: ok([{}] as never),
    });
    expect(result.missing).toEqual(["weather_stale"]);
    expect(result.confidence).toBe("medium");
  });

  it("reports high confidence when all core data is present and fresh", () => {
    expect(
      assessReport({
        weather: ok({} as never),
        traffic: ok([]),
        incidents: ok([]),
        cameras: ok([]),
      }).confidence,
    ).toBe("high");
  });
});

describe("buildSummaryFacts", () => {
  it("separates external data from camera observations and lists gaps", () => {
    const report = {
      location: { lat: 1, lon: 2, label: "Somewhere" },
      generatedAt: "",
      weather: unavailable,
      traffic: unavailable,
      incidents: ok([]),
      cameras: ok([]),
      missing: ["weather", "traffic", "cameras"],
      confidence: "low",
    } as SituationReport;
    const facts = buildSummaryFacts(report, []);
    expect(facts.location).toBe("Somewhere");
    expect(facts.externalData.weather).toEqual({ missing: "not_configured" });
    expect(facts.externalData.incidents).toMatchObject({ count: 0 });
    expect(facts.observedInCameraImages).toMatchObject({ missing: expect.any(String) });
    expect(facts.missingOrStale).toEqual(["weather", "traffic", "cameras"]);
  });
});

describe("CameraImageService", () => {
  const camera: Camera = {
    id: "il-test-1",
    name: "Test",
    country: "il",
    city: "test",
    lat: 0,
    lon: 0,
    cameraType: "traffic",
    mediaType: "image",
    sourceUrl: "https://example.org",
    mediaUrl: "https://images.example.org/cam.jpg",
    operator: { name: "Op" },
    license: { name: "L", termsUrl: "https://example.org/terms" },
    permissions: { embedAllowed: true, aiAnalysisAllowed: true, commercialUseAllowed: false },
    refreshSeconds: 60,
    verification: { lastVerified: "2026-10-01", verifiedBy: "t" },
    providerId: "community",
  };

  it("fetches allowed images and reports their time", async () => {
    restore = withEnv({});
    mockFetch(
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "Content-Type": "image/jpeg",
            "Last-Modified": "Wed, 14 Oct 2026 10:00:00 GMT",
          },
        }),
    );
    const image = await new CameraImageService(new CameraRegistry()).getImage(camera);
    expect(image.mimeType).toBe("image/jpeg");
    expect(image.data.length).toBe(3);
    expect(image.imageTime).toBe("2026-10-14T10:00:00.000Z");
    expect(image.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses cameras without permission, non-image content and unsafe redirects", async () => {
    restore = withEnv({});
    const service = new CameraImageService(new CameraRegistry());
    await expect(
      service.getImage({
        ...camera,
        id: "il-x",
        permissions: {
          embedAllowed: "unknown",
          aiAnalysisAllowed: false,
          commercialUseAllowed: false,
        },
      }),
    ).rejects.toThrow(/do not allow/);

    mockFetch(() => new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }));
    await expect(service.getImage({ ...camera, id: "il-svg" })).rejects.toThrow(
      /unsupported content type/,
    );

    mockFetch(
      () =>
        new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest" } }),
    );
    await expect(service.getImage({ ...camera, id: "il-redirect" })).rejects.toThrow();
  });
});

describe("i18n", () => {
  const keys = (obj: object, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
    );

  it("has the same keys in every language", () => {
    expect(keys(he).sort()).toEqual(keys(en).sort());
  });

  it("uses the same placeholders in every language", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const key of keys(en)) {
      const enValue = translate(en, key as never);
      const heValue = translate(he, key as never);
      expect(placeholders(heValue), key).toBe(placeholders(enValue));
    }
  });

  it("interpolates variables", () => {
    expect(translate(en, "units.km", { value: 3 })).toBe("3 km");
  });

  it("documents every configuration key in .env.example", () => {
    const example = readFileSync(".env.example", "utf8");
    const config = readFileSync("src/lib/config.ts", "utf8");
    const declared = [...config.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]);
    for (const key of declared) expect(example, key).toContain(`${key}=`);
  });

  it("ships an .env.example that is itself a valid configuration", () => {
    const env = Object.fromEntries(
      readFileSync(".env.example", "utf8")
        .split("\n")
        .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    const config = parseConfig(env);
    expect(config.TOMTOM_API_KEY).toBeUndefined();
    expect(config.MAP_ATTRIBUTION).toContain("OpenStreetMap");
  });
});
