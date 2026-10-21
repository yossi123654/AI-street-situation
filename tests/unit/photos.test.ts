import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import type { StreetPhoto } from "@/lib/types";
import { licenseName, mapPanoramaxItem, panoramax } from "@/providers/photos/panoramax";
import {
  mapCommonsPage,
  parseCommonsDate,
  stripHtml,
  wikimediaCommons,
} from "@/providers/photos/wikimediaCommons";
import { PhotoService, thinPhotos } from "@/services/PhotoService";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

const POINT = { lat: 31.7833, lon: 35.2186 };
const PNX_ID = "93a6d34d-14b4-4be3-bc92-1ae93b51260e";

const panoramaxItem = (id: string, lat: number, lon: number) => ({
  id,
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    datetime: "2025-12-14T11:50:46+00:00",
    license: "CC-BY-SA-4.0",
    "view:azimuth": 146.4,
    "geovisio:producer": "urimsch",
    "pers:interior_orientation": { field_of_view: 76 },
  },
  assets: {
    thumb: { href: `https://pnx.example.org/derivates/${id}/thumb.jpg` },
    sd: { href: `https://pnx.example.org/derivates/${id}/sd.jpg` },
  },
  links: [{ rel: "license", href: "https://creativecommons.org/licenses/by-sa/4.0/" }],
});

const commonsPage = {
  pageid: 18719232,
  title: "File:Jerusalem Chancellor avenue sign.jpg",
  coordinates: [{ lat: 31.7834, lon: 35.2187 }],
  imageinfo: [
    {
      thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/x.jpg/640px-x.jpg",
      descriptionurl:
        "https://commons.wikimedia.org/wiki/File:Jerusalem_Chancellor_avenue_sign.jpg",
      mime: "image/jpeg",
      extmetadata: {
        LicenseShortName: { value: "CC BY-SA 4.0" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Djampa">Djampa</a>' },
        DateTimeOriginal: { value: "2010-10-09 12:41:00" },
      },
    },
  ],
};

describe("panoramax", () => {
  it("maps STAC items to street-level photos", () => {
    const photo = mapPanoramaxItem(
      panoramaxItem(PNX_ID, 31.7778, 35.2151),
      "https://api.panoramax.xyz",
    );
    expect(photo).toMatchObject({
      id: `panoramax-${PNX_ID}`,
      kind: "street",
      headingDeg: 146,
      author: "urimsch",
      license: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
      thumbUrl: `https://pnx.example.org/derivates/${PNX_ID}/thumb.jpg`,
      largeUrl: `https://pnx.example.org/derivates/${PNX_ID}/sd.jpg`,
    });
    expect(photo!.pageUrl).toContain(`pic=${PNX_ID}`);
    expect(photo!.panorama).toBeUndefined();
    expect(mapPanoramaxItem({ ...panoramaxItem("not-a-uuid", 31, 35) }, "x")).toBeNull();
    expect(licenseName("CC-BY-4.0")).toBe("CC BY 4.0");
    expect(licenseName("etalab-2.0")).toBe("etalab-2.0");
  });

  it("searches a bounding box around the point", async () => {
    restore = withEnv({ PANORAMAX_URL: "https://pnx-api.example.org" });
    mockFetch((url) => {
      expect(url.pathname).toBe("/api/search");
      const [w, s, e, n] = url.searchParams.get("bbox")!.split(",").map(Number);
      expect(w).toBeLessThan(POINT.lon);
      expect(e).toBeGreaterThan(POINT.lon);
      expect(s).toBeLessThan(POINT.lat);
      expect(n).toBeGreaterThan(POINT.lat);
      return jsonResponse({ features: [panoramaxItem(PNX_ID, 31.7834, 35.2187)] });
    });
    const photos = await panoramax.create(getConfig()).near(POINT, 300);
    expect(photos).toHaveLength(1);
  });
});

describe("wikimedia commons", () => {
  it("maps geosearch results with per-photo licence and author", () => {
    const photo = mapCommonsPage(commonsPage);
    expect(photo).toMatchObject({
      id: "commons-18719232",
      kind: "photo",
      title: "Jerusalem Chancellor avenue sign",
      author: "Djampa",
      license: { name: "CC BY-SA 4.0" },
      capturedAt: "2010-10-09T12:41:00.000Z",
    });
    expect(mapCommonsPage({ ...commonsPage, coordinates: [] })).toBeNull();
    expect(
      mapCommonsPage({
        ...commonsPage,
        imageinfo: [{ ...commonsPage.imageinfo[0]!, mime: "video/webm" }],
      }),
    ).toBeNull();
    expect(stripHtml("<b>A</b> &amp; B")).toBe("A & B");
    expect(parseCommonsDate("circa 1900")).toBeUndefined();
  });

  it("backs off after HTTP 429", async () => {
    restore = withEnv({ WIKIMEDIA_COMMONS_URL: "https://commons.example.org" });
    const fetch = mockFetch(() => new Response("slow down", { status: 429 }));
    const instance = wikimediaCommons.create(getConfig());
    await expect(instance.near(POINT, 300)).rejects.toThrow(/429/);
    await expect(instance.near(POINT, 300)).rejects.toThrow(/rate limiting/);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("PhotoService", () => {
  const photo = (id: string, lat: number, kind: StreetPhoto["kind"] = "street") =>
    ({
      id,
      providerId: "panoramax",
      kind,
      lat,
      lon: 35.2186,
      distanceM: Math.round((lat - POINT.lat) * 111_000),
      license: { name: "CC BY-SA 4.0" },
      pageUrl: "https://example.org",
    }) as StreetPhoto;

  it("keeps one street-level shot per spot, nearest first", () => {
    const thinned = thinPhotos([
      photo("b", 31.7836),
      photo("a", 31.7834),
      photo("a2", 31.78345), // ~5 m from "a"
      photo("c", 31.7834, "photo"), // a landmark photo at the same spot is kept
    ]);
    expect(thinned.map((p) => p.id)).toEqual(["a", "c", "b"]);
  });

  it("merges providers, hides image URLs and only proxies photos it returned", async () => {
    restore = withEnv({
      PANORAMAX_URL: "https://pnx-api.example.org",
      WIKIMEDIA_COMMONS_URL: "https://commons.example.org",
    });
    mockFetch((url) => {
      if (url.hostname === "pnx-api.example.org") {
        return jsonResponse({
          features: [
            panoramaxItem(PNX_ID, 31.7835, 35.2187),
            // Outside the radius: dropped.
            panoramaxItem("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", 31.8, 35.2187),
          ],
        });
      }
      if (url.hostname === "commons.example.org") {
        return jsonResponse({ query: { pages: [commonsPage] } });
      }
      if (url.hostname === "pnx.example.org") {
        expect(url.pathname).toBe(`/derivates/${PNX_ID}/sd.jpg`);
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      throw new Error(`unexpected ${url.href}`);
    });
    const service = new PhotoService();
    const section = await service.find(POINT, 300);
    expect(section.status).toBe("ok");
    if (section.status !== "ok") return;
    expect(section.data.map((p) => p.id).sort()).toEqual([
      "commons-18719232",
      `panoramax-${PNX_ID}`,
    ]);
    expect(JSON.stringify(section.data)).not.toContain("thumb.jpg");
    expect(section.sources.map((s) => s.providerId).sort()).toEqual([
      "panoramax",
      "wikimedia-commons",
    ]);

    const image = await service.getImage(`panoramax-${PNX_ID}`, "large");
    expect(image.mimeType).toBe("image/jpeg");
    await expect(service.getImage("panoramax-unknown", "thumb")).rejects.toThrow(/not found/);
  });

  it("refuses photo URLs outside the provider's hosts", async () => {
    restore = withEnv({
      PANORAMAX_ENABLED: "false",
      WIKIMEDIA_COMMONS_URL: "https://commons.example.org",
    });
    mockFetch(() =>
      jsonResponse({
        query: {
          pages: [
            {
              ...commonsPage,
              imageinfo: [
                { ...commonsPage.imageinfo[0]!, thumburl: "https://evil.example.org/x.jpg" },
              ],
            },
          ],
        },
      }),
    );
    const service = new PhotoService();
    const section = await service.find(POINT, 300);
    expect(section.status).toBe("ok");
    await expect(service.getImage("commons-18719232", "thumb")).rejects.toThrow(/not allowlisted/);
  });

  it("reports an error only when every provider fails", async () => {
    restore = withEnv({
      PANORAMAX_URL: "https://pnx-api.example.org",
      WIKIMEDIA_COMMONS_URL: "https://commons.example.org",
    });
    mockFetch(() => new Response("down", { status: 503 }));
    const section = await new PhotoService().find(POINT, 300);
    expect(section).toMatchObject({ status: "unavailable", reason: "error" });
  });
});

describe("photo image rate limiting", () => {
  it("gives image requests their own, larger per-client bucket", async () => {
    const { apiHandler } = await import("@/lib/api");
    const { NextRequest } = await import("next/server");
    const g = globalThis as Record<string, unknown>;
    delete g.__streetLimiter;
    delete g.__streetMediaLimiter;
    delete g.__streetGlobalLimiter;
    restore = withEnv({ RATE_LIMIT_PER_MINUTE: "2" });
    const ok = async () => new Response("ok");
    const api = apiHandler(ok);
    const media = apiHandler(ok, { bucket: "media" });
    const request = () =>
      new NextRequest("http://localhost/api/x", { headers: { "x-forwarded-for": "203.0.113.9" } });
    const statuses = async (handler: typeof api, n: number) => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) out.push((await handler(request(), undefined)).status);
      return out;
    };
    expect(await statuses(api, 3)).toEqual([200, 200, 429]);
    // The API bucket is used up, but images still load (5× the limit).
    expect(await statuses(media, 11)).toEqual([...Array(10).fill(200), 429]);
    delete g.__streetLimiter;
    delete g.__streetMediaLimiter;
    delete g.__streetGlobalLimiter;
  });
});
