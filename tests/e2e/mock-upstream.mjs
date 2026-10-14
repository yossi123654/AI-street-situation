// A tiny fake of the upstream services (Nominatim, Open-Meteo, TomTom, Ollama,
// camera images, map tiles) so end-to-end tests run offline and deterministically.
// All responses mimic the shape of the real APIs; values are made up.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));
const cameraJpg = fixture("camera.jpg");
const tilePng = fixture("tile.png");

const JAFFA = { lat: 31.7833, lon: 35.2186 };

const places = {
  jaffa: {
    he: "רחוב יפו, מרכז העיר, ירושלים, ישראל",
    en: "Jaffa Street, City Centre, Jerusalem, Israel",
    ...JAFFA,
  },
  azrieli1: {
    he: "צומת עזריאלי, תל אביב-יפו, ישראל",
    en: "Azrieli Junction, Tel Aviv-Yafo, Israel",
    lat: 32.0743,
    lon: 34.7918,
  },
  azrieli2: {
    he: "מרכז עזריאלי, דרך מנחם בגין, תל אביב-יפו",
    en: "Azrieli Center, Menachem Begin Road, Tel Aviv-Yafo",
    lat: 32.0744,
    lon: 34.7925,
  },
};

function nominatimResult(place, lang, id) {
  return {
    place_id: id,
    osm_type: "way",
    osm_id: id,
    lat: String(place.lat),
    lon: String(place.lon),
    display_name: place[lang] ?? place.en,
    addresstype: "road",
    boundingbox: [
      String(place.lat - 0.002),
      String(place.lat + 0.002),
      String(place.lon - 0.003),
      String(place.lon + 0.003),
    ],
  };
}

function send(res, status, body, type = "application/json") {
  // Real tile/style hosts send CORS headers; the browser needs them for the vector map.
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function vectorStyle() {
  const streets = [];
  for (let i = -12; i <= 12; i++) {
    const major = i % 4 === 0;
    streets.push({
      type: "Feature",
      properties: { major },
      geometry: {
        type: "LineString",
        coordinates: [
          [35.17, 31.7833 + i * 0.0025],
          [35.27, 31.7833 + i * 0.0025],
        ],
      },
    });
    streets.push({
      type: "Feature",
      properties: { major },
      geometry: {
        type: "LineString",
        coordinates: [
          [35.2186 + i * 0.003, 31.74],
          [35.2186 + i * 0.003, 31.83],
        ],
      },
    });
  }
  const blocks = [];
  for (let x = -6; x < 6; x++) {
    for (let y = -6; y < 6; y++) {
      if ((x * 7 + y * 3) % 5 !== 0) continue;
      const lon = 35.2186 + x * 0.003 + 0.0005;
      const lat = 31.7833 + y * 0.0025 + 0.0004;
      blocks.push({
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [lon, lat],
              [lon + 0.002, lat],
              [lon + 0.002, lat + 0.0017],
              [lon, lat + 0.0017],
              [lon, lat],
            ],
          ],
        },
      });
    }
  }
  return {
    version: 8,
    name: "Test fixture style",
    sources: {
      streets: { type: "geojson", data: { type: "FeatureCollection", features: streets } },
      parks: { type: "geojson", data: { type: "FeatureCollection", features: blocks } },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f2efe9" } },
      { id: "parks", type: "fill", source: "parks", paint: { "fill-color": "#d8e8c8" } },
      {
        id: "streets-casing",
        type: "line",
        source: "streets",
        paint: { "line-color": "#d6d0c4", "line-width": ["case", ["get", "major"], 9, 5] },
      },
      {
        id: "streets",
        type: "line",
        source: "streets",
        paint: {
          "line-color": ["case", ["get", "major"], "#fcd6a4", "#ffffff"],
          "line-width": ["case", ["get", "major"], 7, 3.5],
        },
      },
    ],
  };
}

// Builds a summary from the facts JSON in the prompt, like a (very literal) model would.
function summaryText(prompt, he) {
  const facts = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
  const place = facts.location.split(",")[0];
  const { trafficFlow, incidents, weather, parking } = facts.externalData;
  const parts = [];
  if (trafficFlow.roads) {
    const r = trafficFlow.roads[0];
    parts.push(
      he
        ? `ב${place} התנועה כבדה: לפי TomTom המהירות הנוכחית כ-${r.currentSpeedKmh} קמ״ש לעומת ${r.freeFlowSpeedKmh} בדרך כלל.`
        : `Traffic at ${place} is heavy: TomTom reports about ${r.currentSpeedKmh} km/h against a usual ${r.freeFlowSpeedKmh} km/h.`,
    );
  } else
    parts.push(he ? `אין נתוני תנועה עבור ${place}.` : `There is no traffic data for ${place}.`);
  if (incidents.count)
    parts.push(
      he
        ? `דווחו ${incidents.count} אירועים בקרבת מקום, בהם עבודות תשתית עם נתיב סגור.`
        : `${incidents.count} incidents are reported nearby, including infrastructure works with a lane closed.`,
    );
  if (weather.temperatureC !== undefined)
    parts.push(
      he
        ? `מזג האוויר בהיר ונעים, ${Math.round(weather.temperatureC)} מעלות.`
        : `The weather is clear and mild at ${Math.round(weather.temperatureC)} °C.`,
    );
  if (parking.facilitiesFound)
    parts.push(
      he
        ? `יש ${parking.facilitiesFound} חניונים בטווח ${parking.searchRadiusM} מ׳, הקרוב במרחק ${parking.nearestDistanceM} מ׳ (אין נתוני תפוסה).`
        : `There are ${parking.facilitiesFound} parking facilities within ${parking.searchRadiusM} m, the nearest ${parking.nearestDistanceM} m away (no occupancy data).`,
    );
  if (Array.isArray(facts.observedInCameraImages))
    parts.push(
      he
        ? "בתמונת המצלמה הסמוכה נראית תנועה בינונית בשני הנתיבים, ללא פקק עומד."
        : "The nearby camera image shows moderate traffic in both lanes, with no standstill.",
    );
  else
    parts.push(
      he ? "אין תמונת מצלמה מורשית בקרבת מקום." : "No permitted camera image is available nearby.",
    );
  return parts.join(" ");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  const q = url.searchParams;

  if (p === "/health") return send(res, 200, { ok: true });

  // --- Nominatim ---
  if (p === "/nominatim/search") {
    const text = (q.get("q") ?? "").toLowerCase();
    const lang = q.get("accept-language") === "en" ? "en" : "he";
    if (text.includes("יפו") || text.includes("jaffa"))
      return send(res, 200, [nominatimResult(places.jaffa, lang, 1001)]);
    if (text.includes("עזריאלי") || text.includes("azrieli"))
      return send(res, 200, [
        nominatimResult(places.azrieli1, lang, 2001),
        nominatimResult(places.azrieli2, lang, 2002),
      ]);
    return send(res, 200, []);
  }
  if (p === "/nominatim/reverse") {
    const lang = q.get("accept-language") === "en" ? "en" : "he";
    return send(
      res,
      200,
      nominatimResult(
        { ...places.jaffa, lat: Number(q.get("lat")), lon: Number(q.get("lon")) },
        lang,
        3001,
      ),
    );
  }

  // --- Open-Meteo ---
  if (p === "/open-meteo/v1/forecast") {
    const now = new Date(Math.floor(Date.now() / 900_000) * 900_000);
    return send(res, 200, {
      latitude: Number(q.get("latitude")),
      longitude: Number(q.get("longitude")),
      current: {
        time: now.toISOString().slice(0, 16),
        interval: 900,
        temperature_2m: 23.4,
        relative_humidity_2m: 58,
        apparent_temperature: 24.1,
        precipitation: 0,
        weather_code: 1,
        cloud_cover: 18,
        wind_speed_10m: 11.2,
        wind_direction_10m: 290,
        visibility: 24000,
        is_day: 1,
      },
    });
  }

  // --- TomTom ---
  if (p.startsWith("/tomtom/traffic/services/4/flowSegmentData/")) {
    return send(res, 200, {
      flowSegmentData: {
        frc: "FRC3",
        currentSpeed: 17,
        freeFlowSpeed: 38,
        confidence: 0.92,
        roadClosure: false,
      },
    });
  }
  if (p === "/tomtom/traffic/services/5/incidentDetails") {
    const he = q.get("language")?.startsWith("he");
    return send(res, 200, {
      incidents: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [35.2152, 31.7829],
              [35.2141, 31.7825],
            ],
          },
          properties: {
            id: "fixture-1",
            iconCategory: 9,
            magnitudeOfDelay: 2,
            events: [
              {
                description: he
                  ? "עבודות תשתית, נתיב אחד סגור"
                  : "Infrastructure works, one lane closed",
                code: 701,
              },
            ],
            startTime: new Date(Date.now() - 3 * 3600_000).toISOString(),
            endTime: new Date(Date.now() + 5 * 3600_000).toISOString(),
            from: he ? "רחוב המלך ג'ורג'" : "King George St",
            to: he ? "רחוב שטראוס" : "Strauss St",
          },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [35.2251, 31.7852] },
          properties: {
            id: "fixture-2",
            iconCategory: 6,
            magnitudeOfDelay: 1,
            events: [{ description: he ? "תנועה איטית" : "Slow traffic", code: 101 }],
            from: he ? "שער שכם" : "Damascus Gate",
          },
        },
      ],
    });
  }

  // --- Ollama ---
  if (p === "/ollama/api/chat" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const system = body.messages?.[0]?.content ?? "";
    const he = system.includes("Hebrew");
    const hasImage = Boolean(body.messages?.[1]?.images?.length);
    const content = hasImage
      ? JSON.stringify({
          traffic: {
            level: "moderate",
            description: he
              ? "כמה כלי רכב נעים בשני הנתיבים, ללא פקק עומד."
              : "Several vehicles moving in both lanes, no standstill.",
          },
          weather: he ? "שמיים בהירים, יבש." : "Clear sky, dry.",
          visibility: "good",
          notes: he ? "התמונה ברורה." : "The image is clear.",
          uncertainty: "low",
        })
      : summaryText(body.messages?.[1]?.content ?? "", he);
    return send(res, 200, {
      model: body.model,
      message: { role: "assistant", content },
      done: true,
    });
  }

  // --- Overpass (parking) ---
  if (p === "/overpass/api/interpreter" && req.method === "POST") {
    const query = new URLSearchParams(await readBody(req)).get("data") ?? "";
    const around = query.match(/around:(\d+),([-\d.]+),([-\d.]+)/);
    const [lat, lon] = around ? [Number(around[2]), Number(around[3])] : [JAFFA.lat, JAFFA.lon];
    const at = (dLat, dLon) => ({ lat: lat + dLat, lon: lon + dLon });
    return send(res, 200, {
      osm3s: { timestamp_osm_base: new Date(Date.now() - 120_000).toISOString() },
      elements: [
        {
          type: "way",
          id: 101,
          center: at(0.0012, -0.0009),
          tags: {
            amenity: "parking",
            name: "חניון כלל",
            parking: "underground",
            fee: "yes",
            access: "yes",
            capacity: "350",
            "capacity:disabled": "8",
            opening_hours: "24/7",
            operator: "אחוזת בית",
          },
        },
        {
          type: "way",
          id: 102,
          center: at(-0.0021, 0.0016),
          tags: {
            amenity: "parking",
            name: "חניון הדווידקה",
            parking: "surface",
            fee: "no",
            capacity: "60",
          },
        },
        {
          type: "way",
          id: 103,
          center: at(0.0035, 0.0028),
          tags: {
            amenity: "parking",
            name: "חניון ממילא",
            parking: "multi-storey",
            fee: "yes",
            access: "yes",
            capacity: "1600",
            opening_hours: "Su-Th 06:00-02:00; Fr 06:00-15:00",
          },
        },
        {
          type: "node",
          id: 104,
          ...at(-0.0008, -0.0031),
          tags: { amenity: "parking", parking: "street_side", fee: "yes" },
        },
        {
          type: "way",
          id: 105,
          center: at(0.0004, 0.0022),
          tags: { amenity: "parking", name: "חניון לקוחות בלבד", access: "customers", fee: "no" },
        },
        {
          type: "way",
          id: 106,
          center: at(0.0002, 0.0002),
          tags: { amenity: "parking", name: "Private", access: "private" },
        },
        {
          type: "way",
          id: 107,
          center: at(0.05, 0.05),
          tags: { amenity: "parking", name: "Too far" },
        },
      ],
    });
  }

  // --- WZDx road-work feed ---
  if (p === "/wzdx/feed.json") {
    const day = 86_400_000;
    return send(res, 200, {
      feed_info: {
        publisher: "Example Road Authority",
        version: "4.2",
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        update_date: new Date(Date.now() - 60_000).toISOString(),
        data_sources: [{ data_source_id: "1", organization_name: "Example Road Authority" }],
      },
      type: "FeatureCollection",
      features: [
        {
          id: "wz-active",
          type: "Feature",
          properties: {
            core_details: {
              event_type: "work-zone",
              data_source_id: "1",
              road_names: ["Jaffa Rd"],
              direction: "eastbound",
              description: "Light rail track maintenance",
            },
            start_date: new Date(Date.now() - day).toISOString(),
            end_date: new Date(Date.now() + day).toISOString(),
            vehicle_impact: "some-lanes-closed",
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [35.2195, 31.7838],
              [35.2215, 31.7845],
            ],
          },
        },
        {
          id: "wz-expired",
          type: "Feature",
          properties: {
            core_details: {
              event_type: "work-zone",
              data_source_id: "1",
              road_names: ["Old Rd"],
              direction: "unknown",
            },
            start_date: new Date(Date.now() - 10 * day).toISOString(),
            end_date: new Date(Date.now() - day).toISOString(),
            vehicle_impact: "all-lanes-closed",
          },
          geometry: {
            type: "LineString",
            coordinates: [
              [35.2186, 31.7833],
              [35.219, 31.7835],
            ],
          },
        },
      ],
    });
  }

  // --- Vector map style (MapLibre) with a synthetic street grid ---
  if (p === "/style.json") return send(res, 200, vectorStyle());

  // --- Camera images and map tiles ---
  if (p === "/images/jaffa-center.jpg") {
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Last-Modified": new Date(Date.now() - 60_000).toUTCString(),
      "Cache-Control": "no-store",
    });
    return res.end(cameraJpg);
  }
  if (p === "/images/broken.jpg") return send(res, 503, "unavailable", "text/plain");
  if (p.startsWith("/tiles/")) {
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=3600" });
    return res.end(tilePng);
  }
  if (p.startsWith("/pages/"))
    return send(res, 200, "<html><body>Camera page (fixture)</body></html>", "text/html");

  send(res, 404, { error: "not mocked", path: p });
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`mock upstream listening on http://127.0.0.1:${PORT}`),
);
