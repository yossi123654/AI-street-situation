import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import { areaForTimeZone } from "@/lib/timezoneAreas";
import type { Camera } from "@/lib/types";
import { openMeteo, withOffset } from "@/providers/weather/openMeteo";
import { AreaService, roundToArea } from "@/services/AreaService";
import type { CameraRegistry } from "@/services/CameraRegistry";
import { toCameraView } from "@/services/CameraRegistry";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

describe("approximate area from the time zone", () => {
  it("maps known zones to a city and region, and unknown ones to null", () => {
    expect(areaForTimeZone("Asia/Jerusalem")).toMatchObject({
      city: { he: "תל אביב", en: "Tel Aviv" },
      region: { en: "Israel" },
    });
    expect(areaForTimeZone("Europe/Helsinki")?.city.en).toBe("Helsinki");
    expect(areaForTimeZone("Etc/UTC")).toBeNull();
    expect(areaForTimeZone(undefined)).toBeNull();
  });
});

describe("open-meteo today", () => {
  it("adds the place's UTC offset to local times", () => {
    expect(withOffset("2026-10-22T17:59", 10800)).toBe("2026-10-22T17:59:00+03:00");
    expect(withOffset("2026-10-22T07:05", -16200)).toBe("2026-10-22T07:05:00-04:30");
    expect(withOffset("garbage", 0)).toBeUndefined();
  });

  it("maps the daily forecast", async () => {
    restore = withEnv({ OPEN_METEO_URL: "https://meteo.example.org" });
    mockFetch((url) => {
      expect(url.searchParams.get("timezone")).toBe("auto");
      expect(url.searchParams.get("daily")).toContain("uv_index_max");
      return jsonResponse({
        utc_offset_seconds: 10800,
        daily: {
          time: ["2026-10-22"],
          temperature_2m_max: [27.1],
          temperature_2m_min: [16.2],
          precipitation_probability_max: [0],
          uv_index_max: [5.5],
          sunrise: ["2026-10-22T06:47"],
          sunset: ["2026-10-22T17:59"],
        },
      });
    });
    const today = await openMeteo.create(getConfig()).today!({ lat: 31.77, lon: 35.21 });
    expect(today).toMatchObject({
      date: "2026-10-22",
      temperatureMaxC: 27.1,
      temperatureMinC: 16.2,
      precipitationProbabilityPct: 0,
      uvIndexMax: 5.5,
      sunset: "2026-10-22T17:59:00+03:00",
    });
    expect(today.source.observedAt).toBeUndefined();
  });
});

describe("AreaService", () => {
  const camera = (id: string, display: "embed" | "link", distanceM: number) =>
    toCameraView(
      {
        id,
        name: id,
        country: "il",
        city: "test",
        lat: 31.78,
        lon: 35.22,
        cameraType: "traffic",
        mediaType: display === "embed" ? "image" : "link",
        sourceUrl: "https://example.org",
        ...(display === "embed" ? { mediaUrl: "https://example.org/a.jpg" } : {}),
        operator: { name: "Op" },
        license: { name: "x", termsUrl: "https://example.org" },
        permissions: {
          embedAllowed: display === "embed",
          aiAnalysisAllowed: false,
          commercialUseAllowed: "unknown",
        },
        refreshSeconds: 60,
        verification: { lastVerified: "2026-10-22", verifiedBy: "t" },
        providerId: "community",
      } as Camera,
      distanceM,
    );

  it("rounds to ~1 km, counts cameras within 50 km and previews embeddable ones first", async () => {
    restore = withEnv({ OPEN_METEO_URL: "https://meteo.example.org" });
    mockFetch((url) =>
      url.searchParams.has("daily")
        ? jsonResponse({
            utc_offset_seconds: 0,
            daily: { time: ["2026-10-22"], temperature_2m_max: [20], temperature_2m_min: [10] },
          })
        : jsonResponse({ current: { time: "2026-10-22T08:00", temperature_2m: 18, is_day: 1 } }),
    );
    const findNear = vi.fn(async () => ({
      cameras: [
        camera("link-1", "link", 100),
        camera("img-1", "embed", 900),
        camera("img-2", "embed", 2000),
      ],
      errors: [],
    }));
    const service = new AreaService({ findNear } as unknown as CameraRegistry);
    const summary = await service.summary({ lat: 31.78345, lon: 35.21861 });
    expect(summary.point).toEqual({ lat: 31.78, lon: 35.22 });
    expect(findNear).toHaveBeenCalledWith({ lat: 31.78, lon: 35.22 }, 50_000, 5000);
    expect(summary.cameras).toMatchObject({ count: 3, embeddableCount: 2 });
    expect(summary.cameras.preview.map((c) => c.id)).toEqual(["img-1", "img-2", "link-1"]);
    expect(summary.weather.status).toBe("ok");
    expect(summary.today.status).toBe("ok");
    expect(roundToArea({ lat: -33.86882, lon: 151.20929 })).toEqual({ lat: -33.87, lon: 151.21 });
  });
});
