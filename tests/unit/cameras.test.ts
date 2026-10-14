import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cameraEntrySchema } from "@/lib/cameraSchema";
import type { Camera } from "@/lib/types";
import { loadCameraDirectory } from "@/providers/cameras/staticJson";
import { toCameraView } from "@/services/CameraRegistry";

const validEntry = {
  id: "il-jerusalem-example-01",
  name: "Example camera",
  country: "il",
  city: "jerusalem",
  location: { lat: 31.78, lon: 35.21 },
  cameraType: "traffic",
  mediaType: "image",
  sourceUrl: "https://example.org/cameras/1",
  mediaUrl: "https://images.example.org/1.jpg",
  operator: { name: "Example Operator" },
  license: { name: "CC BY 4.0", termsUrl: "https://example.org/terms" },
  permissions: { embedAllowed: true, aiAnalysisAllowed: true, commercialUseAllowed: "unknown" },
  refreshSeconds: 60,
  verification: { lastVerified: "2026-10-01", verifiedBy: "someone" },
};

describe("camera schema", () => {
  const schema = cameraEntrySchema();

  it("accepts a valid entry", () => {
    expect(schema.safeParse(validEntry).success).toBe(true);
  });

  it("requires mediaUrl for image cameras and forbids it for links", () => {
    const noMedia: Record<string, unknown> = { ...validEntry };
    delete noMedia.mediaUrl;
    expect(schema.safeParse(noMedia).success).toBe(false);
    expect(schema.safeParse({ ...validEntry, mediaType: "link" }).success).toBe(false);
  });

  it("rejects non-https and IP media URLs", () => {
    expect(
      schema.safeParse({ ...validEntry, mediaUrl: "http://images.example.org/1.jpg" }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...validEntry, mediaUrl: "https://10.0.0.1/1.jpg" }).success).toBe(
      false,
    );
  });

  it("requires the id to start with the country code", () => {
    expect(schema.safeParse({ ...validEntry, id: "gb-jerusalem-1" }).success).toBe(false);
  });

  it("rejects unknown fields and invalid permissions", () => {
    expect(schema.safeParse({ ...validEntry, extra: 1 }).success).toBe(false);
    expect(
      schema.safeParse({
        ...validEntry,
        permissions: { ...validEntry.permissions, embedAllowed: "maybe" },
      }).success,
    ).toBe(false);
  });

  it("only allows AI analysis for still images", () => {
    expect(
      schema.safeParse({
        ...validEntry,
        mediaType: "video",
        mediaUrl: "https://v.example.org/1.mp4",
      }).success,
    ).toBe(false);
  });
});

describe("loadCameraDirectory", () => {
  it("loads valid files, skips invalid ones and duplicates", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cams-"));
    await mkdir(path.join(dir, "il"));
    await writeFile(
      path.join(dir, "il", "jerusalem.json"),
      JSON.stringify({ cameras: [validEntry, validEntry] }),
    );
    await writeFile(path.join(dir, "il", "broken.json"), "{ not json");
    await writeFile(
      path.join(dir, "il", "invalid.json"),
      JSON.stringify({ cameras: [{ id: "x" }] }),
    );
    const cameras = await loadCameraDirectory(dir);
    expect(cameras).toHaveLength(1);
    expect(cameras[0]).toMatchObject({
      id: validEntry.id,
      lat: 31.78,
      lon: 35.21,
      providerId: "community",
    });
  });

  it("returns an empty list for a missing directory", async () => {
    expect(await loadCameraDirectory("/definitely/not/here")).toEqual([]);
  });
});

describe("toCameraView", () => {
  const camera: Camera = {
    ...(validEntry as unknown as Omit<Camera, "lat" | "lon" | "providerId">),
    lat: 31.78,
    lon: 35.21,
    providerId: "community",
  } as Camera;

  it("embeds and allows analysis only with explicit permission", () => {
    const view = toCameraView(camera, 123.4);
    expect(view.display).toBe("embed");
    expect(view.analyzable).toBe(true);
    expect(view.distanceM).toBe(123);
    expect("mediaUrl" in view).toBe(false);
  });

  it("treats unknown permissions as link-only and not analyzable", () => {
    const view = toCameraView(
      {
        ...camera,
        permissions: {
          embedAllowed: "unknown",
          aiAnalysisAllowed: "unknown",
          commercialUseAllowed: "unknown",
        },
      },
      0,
    );
    expect(view.display).toBe("link");
    expect(view.analyzable).toBe(false);
  });

  it("exposes the video URL only for embeddable videos", () => {
    const video = {
      ...camera,
      mediaType: "video" as const,
      mediaUrl: "https://v.example.org/1.mp4",
    };
    expect(toCameraView(video, 0).videoUrl).toBe("https://v.example.org/1.mp4");
    expect(
      toCameraView({ ...video, permissions: { ...video.permissions, embedAllowed: false } }, 0)
        .videoUrl,
    ).toBeUndefined();
  });
});
