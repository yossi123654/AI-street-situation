import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "@/lib/config";
import { digitrafficCameras, digitrafficStationName } from "@/providers/cameras/digitraffic";
import { hongKongCameras, parseHongKongCameras } from "@/providers/cameras/hongKong";
import { singaporeCameras } from "@/providers/cameras/singapore";
import { CameraRegistry } from "@/services/CameraRegistry";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
  vi.unstubAllGlobals();
});

const digitrafficStations = {
  type: "FeatureCollection",
  features: [
    {
      id: "C01503",
      geometry: { coordinates: [23.99616, 60.05374, 0] },
      properties: {
        id: "C01503",
        name: "kt51_Inkoo",
        collectionStatus: "GATHERING",
        presets: [
          { id: "C0150301", inCollection: true },
          { id: "C0150309", inCollection: true },
          { id: "C0150302", inCollection: false },
        ],
      },
    },
    {
      id: "C09999",
      geometry: { coordinates: [25, 61, 0] },
      properties: {
        id: "C09999",
        name: "vt4_Removed",
        collectionStatus: "REMOVED_TEMPORARILY",
        presets: [{ id: "C0999901" }],
      },
    },
  ],
};

const singaporeImages = {
  items: [
    {
      cameras: [
        {
          camera_id: "2701",
          image: "https://images.data.gov.sg/api/traffic-images/2026/10/a.jpg",
          location: { latitude: 1.447, longitude: 103.771 },
        },
        { camera_id: "bad/id", image: "https://images.data.gov.sg/x.jpg", location: {} },
      ],
    },
  ],
};

const hongKongXml = `<?xml version="1.0" encoding="UTF-8"?>
<image-list>
  <image>
    <key>H429F</key>
    <region>Hong Kong Island</region>
    <district>Southern</district>
    <description>Aberdeen Praya Road near Fish Market &amp; Pier [H429F]</description>
    <latitude>22.24845</latitude>
    <longitude>114.1505</longitude>
    <url>https://tdcctv.data.one.gov.hk/H429F.JPG</url>
  </image>
  <image><key>BAD KEY</key><latitude>22.3</latitude><longitude>114.1</longitude><url>https://tdcctv.data.one.gov.hk/x.JPG</url></image>
</image-list>`;

describe("digitraffic weather cameras", () => {
  it("names stations readably", () => {
    expect(digitrafficStationName("vt1_Espoo_Kehä_III")).toBe("Road 1 · Espoo Kehä III");
    expect(digitrafficStationName("kt51_Inkoo")).toBe("Road 51 · Inkoo");
    expect(digitrafficStationName("Helsinki_Port")).toBe("Helsinki Port");
  });

  it("maps active presets to CC BY cameras and identifies itself", async () => {
    restore = withEnv({ DIGITRAFFIC_URL: "https://dt.example.org" });
    mockFetch((url, init) => {
      expect(url.href).toBe("https://dt.example.org/api/weathercam/v1/stations");
      expect(new Headers(init?.headers).get("Digitraffic-User")).toBe("ai-street-situation");
      return jsonResponse(digitrafficStations);
    });
    const instance = digitrafficCameras.create(getConfig());
    const cameras = await instance.list();
    expect(cameras.map((c) => c.id)).toEqual([
      "fi-digitraffic-c0150301",
      "fi-digitraffic-c0150309",
    ]);
    expect(cameras[0]).toMatchObject({
      name: "Road 51 · Inkoo",
      description: "Camera view: direction 1",
      lat: 60.05374,
      lon: 23.99616,
      mediaUrl: "https://weathercam.digitraffic.fi/C0150301.jpg",
      license: { attribution: "Source: Fintraffic / digitraffic.fi, license CC 4.0 BY" },
      permissions: { embedAllowed: true, aiAnalysisAllowed: true, commercialUseAllowed: true },
    });
    expect(cameras[1]!.description).toBe("Camera view: road surface");
    expect(instance.allowedMediaHosts?.()).toEqual(["weathercam.digitraffic.fi"]);
  });
});

describe("singapore traffic cameras", () => {
  it("maps cameras with the licence's dated attribution", async () => {
    restore = withEnv({ SG_TRAFFIC_IMAGES_URL: "https://sg.example.org" });
    mockFetch((url) => {
      expect(url.pathname).toBe("/v1/transport/traffic-images");
      return jsonResponse(singaporeImages);
    });
    const cameras = await singaporeCameras.create(getConfig()).list();
    expect(cameras).toHaveLength(1);
    expect(cameras[0]).toMatchObject({
      id: "sg-lta-2701",
      mediaUrl: "https://images.data.gov.sg/api/traffic-images/2026/10/a.jpg",
      license: { name: "Singapore Open Data Licence v1.0" },
    });
    expect(cameras[0]!.license.attribution).toMatch(
      /^Contains information from Traffic Images accessed on \d{4}-\d{2}-\d{2} from LTA/,
    );
  });
});

describe("hong kong traffic snapshots", () => {
  it("parses the camera list XML", () => {
    const cameras = parseHongKongCameras(hongKongXml, "hk-td-snapshots");
    expect(cameras).toHaveLength(1);
    expect(cameras[0]).toMatchObject({
      id: "hk-td-h429f",
      name: "Aberdeen Praya Road near Fish Market & Pier",
      description: "Southern, Hong Kong Island",
      mediaUrl: "https://tdcctv.data.one.gov.hk/H429F.JPG",
    });
  });

  it("is opt-in because of the indemnity clause", () => {
    restore = withEnv({});
    expect(hongKongCameras.isEnabled(getConfig())).toBe(false);
  });
});

describe("camera registry coverage", () => {
  it("only calls providers whose coverage overlaps the search area", async () => {
    restore = withEnv({
      CAMERA_DATA_DIR: "tests/fixtures/empty-cameras",
      DIGITRAFFIC_URL: "https://dt.example.org",
      SG_TRAFFIC_IMAGES_URL: "https://sg.example.org",
    });
    const fetch = mockFetch((url) =>
      url.hostname === "dt.example.org"
        ? jsonResponse(digitrafficStations)
        : jsonResponse(singaporeImages),
    );
    const registry = new CameraRegistry();

    // Jerusalem: neither Finland nor Singapore is asked.
    const jerusalem = await registry.findNear({ lat: 31.78, lon: 35.21 }, 3000);
    expect(jerusalem.cameras).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();

    // Inkoo, Finland: only Digitraffic is asked.
    const inkoo = await registry.findNear({ lat: 60.05, lon: 24.0 }, 3000);
    expect(inkoo.cameras.map((c) => c.id)).toContain("fi-digitraffic-c0150301");
    expect(fetch.mock.calls.map(([u]) => new URL(String(u)).hostname)).toEqual(["dt.example.org"]);

    // Id lookups go to the provider that owns the prefix.
    fetch.mockClear();
    expect((await registry.getById("sg-lta-2701"))?.name).toBe("LTA traffic camera 2701");
    expect(fetch.mock.calls.map(([u]) => new URL(String(u)).hostname)).toEqual(["sg.example.org"]);
  });
});
