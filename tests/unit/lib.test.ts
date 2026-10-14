import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/cache";
import { parseConfig } from "@/lib/config";
import { cameraImageFreshness, classifyAge, worstFreshness } from "@/lib/freshness";
import { boundingBox, haversineMeters, parseLatLon } from "@/lib/geo";
import { RateLimiter } from "@/lib/rateLimit";
import { assertSafeMediaUrl } from "@/lib/urlSafety";

describe("TtlCache", () => {
  it("expires entries after their TTL", () => {
    let now = 0;
    const cache = new TtlCache<string>(10, () => now);
    cache.set("a", "1", 100);
    expect(cache.get("a")).toBe("1");
    now = 101;
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts the least recently used entry", () => {
    const cache = new TtlCache<number>(2);
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.get("a");
    cache.set("c", 3, 1000);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("de-duplicates concurrent computations and does not cache failures", async () => {
    const cache = new TtlCache<number>();
    const compute = vi.fn(async () => 42);
    const [a, b] = await Promise.all([
      cache.getOrSet("k", 1000, compute),
      cache.getOrSet("k", 1000, compute),
    ]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);

    const failing = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(cache.getOrSet("x", 1000, failing)).rejects.toThrow("boom");
    await expect(cache.getOrSet("x", 1000, async () => 1)).resolves.toBe(1);
  });
});

describe("geo", () => {
  it("computes Haversine distances", () => {
    // One degree of latitude on the mean Earth radius is ~111.195 km.
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -1);
    // Jerusalem (Jaffa Gate) to Tel Aviv (Azrieli): about 53 km.
    const d = haversineMeters({ lat: 31.7767, lon: 35.2275 }, { lat: 32.0743, lon: 34.7918 });
    expect(d).toBeGreaterThan(52_000);
    expect(d).toBeLessThan(54_000);
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  });

  it("builds a bounding box containing the radius", () => {
    const center = { lat: 31.78, lon: 35.22 };
    const [minLat, minLon, maxLat, maxLon] = boundingBox(center, 1000);
    expect(haversineMeters(center, { lat: maxLat, lon: center.lon })).toBeCloseTo(1000, -1);
    expect(haversineMeters(center, { lat: center.lat, lon: maxLon })).toBeCloseTo(1000, -1);
    expect(minLat).toBeLessThan(center.lat);
    expect(minLon).toBeLessThan(center.lon);
  });

  it("parses coordinates typed by the user", () => {
    expect(parseLatLon("31.7833, 35.2186")).toEqual({ lat: 31.7833, lon: 35.2186 });
    expect(parseLatLon("-33.9 151.2")).toEqual({ lat: -33.9, lon: 151.2 });
    expect(parseLatLon("95, 10")).toBeNull();
    expect(parseLatLon("Jaffa Street 12")).toBeNull();
  });
});

describe("freshness", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const t = { liveMinutes: 5, staleMinutes: 20 };
  it("classifies ages", () => {
    expect(classifyAge("2026-10-14T11:58:00Z", t, now)).toBe("live");
    expect(classifyAge("2026-10-14T11:50:00Z", t, now)).toBe("recent");
    expect(classifyAge("2026-10-14T11:00:00Z", t, now)).toBe("stale");
    expect(classifyAge(undefined, t, now)).toBe("unknown");
    expect(classifyAge("not a date", t, now)).toBe("unknown");
  });

  it("scales camera thresholds with the refresh interval", () => {
    expect(cameraImageFreshness("2026-10-14T11:57:00Z", 60, now)).toBe("live");
    expect(cameraImageFreshness("2026-10-14T11:40:00Z", 60, now)).toBe("recent");
    expect(cameraImageFreshness("2026-10-14T10:00:00Z", 60, now)).toBe("stale");
  });

  it("picks the worst freshness", () => {
    expect(worstFreshness(["live", "recent"])).toBe("recent");
    expect(worstFreshness(["live", "stale", "unknown"])).toBe("stale");
    expect(worstFreshness([])).toBe("unknown");
  });
});

describe("config", () => {
  it("applies defaults and treats empty strings as unset", () => {
    const config = parseConfig({
      TOMTOM_API_KEY: "",
      NOMINATIM_URL: "",
      GEOCODING_PROVIDER: " ",
      MAP_TILE_URL: "",
    });
    expect(config.MAP_TILE_URL).toContain("{z}");
    expect(config.TOMTOM_API_KEY).toBeUndefined();
    expect(config.NOMINATIM_URL).toBe("https://nominatim.openstreetmap.org");
    expect(config.WEATHER_ENABLED).toBe(true);
    expect(config.GEOCODING_PROVIDER).toBe("nominatim");
  });

  it("parses booleans, numbers and trims trailing slashes", () => {
    const config = parseConfig({
      WEATHER_ENABLED: "false",
      RATE_LIMIT_PER_MINUTE: "30",
      OLLAMA_URL: "http://ollama:11434",
      OPEN_METEO_URL: "http://meteo.local/",
    });
    expect(config.WEATHER_ENABLED).toBe(false);
    expect(config.RATE_LIMIT_PER_MINUTE).toBe(30);
    expect(config.OLLAMA_URL).toBe("http://ollama:11434");
    expect(config.OPEN_METEO_URL).toBe("http://meteo.local");
  });

  it("rejects invalid values with a readable message", () => {
    expect(() => parseConfig({ GEOCODING_PROVIDER: "bing" })).toThrow(/GEOCODING_PROVIDER/);
    expect(() => parseConfig({ RATE_LIMIT_PER_MINUTE: "lots" })).toThrow(/RATE_LIMIT_PER_MINUTE/);
  });
});

describe("RateLimiter", () => {
  it("limits per key within a window", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
    now = 1001;
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("assertSafeMediaUrl", () => {
  const strict = { allowInsecure: false };
  it("accepts public https URLs", () => {
    expect(assertSafeMediaUrl("https://images.example.org/cam.jpg", strict).hostname).toBe(
      "images.example.org",
    );
  });

  it.each([
    "http://images.example.org/cam.jpg",
    "https://127.0.0.1/cam.jpg",
    "https://10.1.2.3/cam.jpg",
    "https://192.168.1.10/cam.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/cam.jpg",
    "https://[::1]/cam.jpg",
    "https://user:pass@images.example.org/cam.jpg",
    "file:///etc/passwd",
  ])("rejects %s", (url) => {
    expect(() => assertSafeMediaUrl(url, strict)).toThrow();
  });

  it("enforces a host allowlist when given", () => {
    const options = { allowInsecure: false, allowedHosts: ["tfl.gov.uk"] };
    expect(() => assertSafeMediaUrl("https://jamcams.tfl.gov.uk/x.jpg", options)).not.toThrow();
    expect(() => assertSafeMediaUrl("https://evil.example.com/x.jpg", options)).toThrow(
      /allowlisted/,
    );
  });

  it("supports host + path prefix entries for shared hosts like S3", () => {
    const options = {
      allowInsecure: false,
      allowedHosts: ["s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/"],
    };
    const s3 = "https://s3-eu-west-1.amazonaws.com";
    expect(() =>
      assertSafeMediaUrl(`${s3}/jamcams.tfl.gov.uk/00002.00865.jpg`, options),
    ).not.toThrow();
    for (const bad of [
      `${s3}/other-bucket/x.jpg`,
      `${s3}/jamcams.tfl.gov.uk/../other-bucket/x.jpg`,
      `${s3}/jamcams.tfl.gov.uk/%2e%2e/other-bucket/x.jpg`,
      "https://jamcams.tfl.gov.uk.evil.example/x.jpg",
    ]) {
      expect(() => assertSafeMediaUrl(bad, options), bad).toThrow(/allowlisted/);
    }
  });
});

describe("upstreamFetch", () => {
  it("retries GET requests once after a network error, but not HTTP errors or POSTs", async () => {
    const { upstreamFetch } = await import("@/lib/http");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) throw new TypeError("fetch failed");
        return new Response("ok");
      }),
    );
    await expect(upstreamFetch("https://a.example.org/x")).resolves.toBeInstanceOf(Response);
    expect(calls).toBe(2);

    calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return new Response("nope", { status: 503 });
      }),
    );
    await expect(upstreamFetch("https://a.example.org/x")).rejects.toThrow(/HTTP 503/);
    expect(calls).toBe(1);

    calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        throw new TypeError("fetch failed");
      }),
    );
    await expect(upstreamFetch("https://a.example.org/x", { method: "POST" })).rejects.toThrow(
      /network error/,
    );
    expect(calls).toBe(1);
    vi.unstubAllGlobals();
  });
});
