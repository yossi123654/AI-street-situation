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
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

// Builds a summary from the facts JSON in the prompt, like a (very literal) model would.
function summaryText(prompt, he) {
  const facts = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
  const place = facts.location.split(",")[0];
  const { trafficFlow, incidents, weather } = facts.externalData;
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
