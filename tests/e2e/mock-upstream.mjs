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

function tripSummaryText(facts, he) {
  const r = facts.route;
  const parts = [];
  if (r.distanceKm) {
    parts.push(
      he
        ? `הנסיעה מ${facts.from.split(",")[0]} ל${facts.to.split(",")[0]} היא ${r.distanceKm} ק״מ וצפויה לקחת כ-${r.travelTimeMinutes} דקות${r.includesLiveTraffic ? ", כולל התנועה הנוכחית" : r.includesPredictedTraffic ? ", לפי התנועה הצפויה בשעת היציאה" : " בדרך פנויה, בלי נתוני תנועה בזמן אמת"}.`
        : `The trip from ${facts.from.split(",")[0]} to ${facts.to.split(",")[0]} is ${r.distanceKm} km and should take about ${r.travelTimeMinutes} minutes${r.includesLiveTraffic ? ", including current traffic" : r.includesPredictedTraffic ? ", with the traffic expected at departure time" : " in free-flowing traffic, with no live traffic data"}.`,
    );
  }
  const t = facts.trafficOnTheWay;
  if (t.slowSections?.length)
    parts.push(
      he
        ? `יש ${t.slowSections.length} קטעים איטיים בדרך, בעיקר פקק בק״מ ${t.slowSections[0].atKm}.`
        : `There are ${t.slowSections.length} slow sections, mainly a jam at km ${t.slowSections[0].atKm}.`,
    );
  const w = facts.weatherAlongTheWay;
  if (Array.isArray(w) && w.length)
    parts.push(
      he
        ? `מזג האוויר בהיר לאורך הדרך, ${Math.round(w[0].temperatureC)} מעלות ביציאה ו-${Math.round(w[w.length - 1].temperatureC)} ביעד.`
        : `The weather is clear along the way, ${Math.round(w[0].temperatureC)}° at departure and ${Math.round(w[w.length - 1].temperatureC)}° at the destination.`,
    );
  const pk = facts.parkingAtDestination;
  if (pk.facilitiesFound)
    parts.push(
      he
        ? `ביעד יש ${pk.facilitiesFound} חניונים בקרבת מקום (אין נתוני תפוסה).`
        : `There are ${pk.facilitiesFound} parking facilities near the destination (no occupancy data).`,
    );
  return parts.join(" ");
}

// Builds a summary from the facts JSON in the prompt, like a (very literal) model would.
function summaryText(prompt, he) {
  const facts = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
  if (facts.route) return tripSummaryText(facts, he);
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
    const lats = q.get("latitude").split(",").map(Number);
    const lons = q.get("longitude").split(",").map(Number);
    if (lats.length > 1 || q.has("hourly")) {
      const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
      const times = Array.from({ length: 48 }, (_, i) =>
        new Date(hourStart + i * 3_600_000).toISOString().slice(0, 16),
      );
      // Cooler inland, warmer towards the coast (lower longitude), and warming through the day.
      const entry = (lat, lon) => {
        const base = 23.4 - (lon - 34.78) * 8;
        return {
          latitude: lat,
          longitude: lon,
          current: {
            time: now.toISOString().slice(0, 16),
            temperature_2m: Math.round(base * 10) / 10,
            weather_code: lon > 35 ? 1 : 2,
            precipitation: 0,
            wind_speed_10m: 11,
            visibility: 24_000,
            is_day: 1,
          },
          hourly: {
            time: times,
            temperature_2m: times.map(
              (_, i) => Math.round((base + Math.min(i, 6) * 0.5) * 10) / 10,
            ),
            weather_code: times.map((_, i) => (i < 3 ? 1 : 2)),
            precipitation: times.map(() => 0),
            wind_speed_10m: times.map(() => 11),
            visibility: times.map(() => 24_000),
            is_day: times.map(() => 1),
          },
        };
      };
      return send(
        res,
        200,
        lats.map((lat, i) => entry(lat, lons[i])),
      );
    }
    return send(res, 200, {
      latitude: lats[0],
      longitude: lons[0],
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

  // --- OSRM (FOSSGIS layout: /routed-car/route/v1/driving/lon,lat;lon,lat) ---
  if (p.startsWith("/osrm/routed-car/route/v1/driving/")) {
    const pairs = p
      .split("/")
      .pop()
      .split(";")
      .map((c) => c.split(",").map(Number));
    const [a, b] = pairs;
    const n = 40;
    const coordinates = Array.from({ length: n + 1 }, (_, i) => [
      a[0] + ((b[0] - a[0]) * i) / n,
      a[1] + ((b[1] - a[1]) * i) / n,
    ]);
    const distance = 66_100;
    const duration = 3540;
    return send(res, 200, {
      code: "Ok",
      waypoints: [
        { name: "", location: a },
        { name: "ארלוזורוב", location: b },
      ],
      routes: [
        {
          distance,
          duration,
          weight_name: "routability",
          geometry: { type: "LineString", coordinates },
          legs: [
            {
              distance,
              duration,
              summary: "כביש ירושלים תל אביב, הנתיב המהיר",
              annotation: { duration: Array.from({ length: n }, () => duration / n) },
              steps: [
                {
                  name: "דוד בן-גוריון",
                  ref: "333",
                  distance: 2800,
                  duration: 240,
                  maneuver: { type: "depart" },
                },
                {
                  name: "כביש ירושלים תל אביב",
                  ref: "1",
                  distance: 42_200,
                  duration: 2100,
                  maneuver: { type: "fork" },
                },
                {
                  name: "הנתיב המהיר",
                  ref: "1",
                  distance: 11_700,
                  duration: 600,
                  maneuver: { type: "fork" },
                },
                {
                  name: "איילון צפון",
                  ref: "20",
                  distance: 9400,
                  duration: 600,
                  maneuver: { type: "fork" },
                },
                { name: "ארלוזורוב", distance: 0, duration: 0, maneuver: { type: "arrive" } },
              ],
            },
          ],
        },
      ],
    });
  }

  // --- TomTom Routing (traffic-aware) ---
  if (p.startsWith("/tomtom/routing/1/calculateRoute/")) {
    const [from, to] = p
      .split("/")[5]
      .split(":")
      .map((c) => c.split(",").map(Number));
    const n = 40;
    const points = Array.from({ length: n + 1 }, (_, i) => ({
      latitude: from[0] + ((to[0] - from[0]) * i) / n,
      longitude: from[1] + ((to[1] - from[1]) * i) / n,
    }));
    const he = q.get("language")?.startsWith("he");
    // A future departure gets predicted (lighter) traffic and echoes the departure time.
    const departAt = q.get("departAt");
    if (departAt) {
      const start = Date.parse(departAt);
      return send(res, 200, {
        formatVersion: "0.0.12",
        routes: [
          {
            summary: {
              lengthInMeters: 66_100,
              travelTimeInSeconds: 3900,
              trafficDelayInSeconds: 360,
              trafficLengthInMeters: 4000,
              departureTime: new Date(start).toISOString(),
              arrivalTime: new Date(start + 3_900_000).toISOString(),
              noTrafficTravelTimeInSeconds: 3540,
            },
            legs: [{ summary: {}, points }],
            sections: [
              {
                startPointIndex: 30,
                endPointIndex: 33,
                sectionType: "TRAFFIC",
                simpleCategory: "JAM",
                effectiveSpeedInKmh: 35,
                delayInSeconds: 360,
                magnitudeOfDelay: 2,
              },
            ],
            guidance: {
              instructions: [
                {
                  routeOffsetInMeters: 0,
                  travelTimeInSeconds: 0,
                  street: he ? "כביש ירושלים תל אביב" : "Jerusalem–Tel Aviv Highway",
                  roadNumbers: ["1"],
                },
                {
                  routeOffsetInMeters: 56_700,
                  travelTimeInSeconds: 3300,
                  street: he ? "איילון צפון" : "Ayalon North",
                  roadNumbers: ["20"],
                },
              ],
            },
            progress: [
              { pointIndex: 0, travelTimeInSeconds: 0, distanceInMeters: 0 },
              { pointIndex: n, travelTimeInSeconds: 3900, distanceInMeters: 66_100 },
            ],
          },
        ],
      });
    }
    return send(res, 200, {
      formatVersion: "0.0.12",
      routes: [
        {
          summary: {
            lengthInMeters: 66_100,
            travelTimeInSeconds: 4320,
            trafficDelayInSeconds: 780,
            trafficLengthInMeters: 9000,
            departureTime: new Date().toISOString(),
            arrivalTime: new Date(Date.now() + 4320_000).toISOString(),
            noTrafficTravelTimeInSeconds: 3540,
          },
          legs: [{ summary: {}, points }],
          sections: [
            { startPointIndex: 0, endPointIndex: n, sectionType: "TRAVEL_MODE", travelMode: "car" },
            {
              startPointIndex: 24,
              endPointIndex: 29,
              sectionType: "TRAFFIC",
              simpleCategory: "JAM",
              effectiveSpeedInKmh: 22,
              delayInSeconds: 660,
              magnitudeOfDelay: 3,
            },
            {
              startPointIndex: 36,
              endPointIndex: 38,
              sectionType: "TRAFFIC",
              simpleCategory: "ROAD_WORK",
              effectiveSpeedInKmh: 45,
              delayInSeconds: 120,
              magnitudeOfDelay: 1,
            },
          ],
          guidance: {
            instructions: [
              {
                routeOffsetInMeters: 0,
                travelTimeInSeconds: 0,
                street: he ? "דוד בן-גוריון" : "David Ben Gurion",
                roadNumbers: ["333"],
                instructionType: "LOCATION_DEPARTURE",
              },
              {
                routeOffsetInMeters: 2800,
                travelTimeInSeconds: 240,
                street: he ? "כביש ירושלים תל אביב" : "Jerusalem–Tel Aviv Highway",
                roadNumbers: ["1"],
                instructionType: "TURN",
              },
              {
                routeOffsetInMeters: 56_700,
                travelTimeInSeconds: 3600,
                street: he ? "איילון צפון" : "Ayalon North",
                roadNumbers: ["20"],
                instructionType: "TURN",
              },
              {
                routeOffsetInMeters: 66_100,
                travelTimeInSeconds: 4320,
                street: he ? "ארלוזורוב" : "Arlozorov",
                instructionType: "LOCATION_ARRIVAL",
              },
            ],
          },
          progress: [
            { pointIndex: 0, travelTimeInSeconds: 0, distanceInMeters: 0 },
            { pointIndex: n, travelTimeInSeconds: 4320, distanceInMeters: 66_100 },
          ],
        },
      ],
    });
  }

  // --- Overpass (parking) ---
  if (p === "/overpass/api/interpreter" && req.method === "POST") {
    const query = new URLSearchParams(await readBody(req)).get("data") ?? "";
    if (query.includes('"amenity"="fuel"')) {
      // Stops along a corridor: place them on the straight line between the first and last corridor point.
      const coords = query
        .match(/around:\d+,([-\d.,]+)\)/)[1]
        .split(",")
        .map(Number);
      const [aLat, aLon] = [coords[0], coords[1]];
      const [bLat, bLon] = [coords[coords.length - 2], coords[coords.length - 1]];
      const at = (f, dLat = 0, dLon = 0) => ({
        lat: aLat + (bLat - aLat) * f + dLat,
        lon: aLon + (bLon - aLon) * f + dLon,
      });
      return send(res, 200, {
        osm3s: { timestamp_osm_base: new Date().toISOString() },
        elements: [
          {
            type: "node",
            id: 201,
            ...at(0.18, 0.0008),
            tags: {
              amenity: "fuel",
              brand: "פז",
              name: "פז שער הגיא",
              toilets: "yes",
              shop: "convenience",
              opening_hours: "24/7",
            },
          },
          {
            type: "way",
            id: 202,
            center: at(0.4, -0.001),
            tags: { highway: "rest_area", name: "חניון לטרון", toilets: "yes" },
          },
          {
            type: "node",
            id: 203,
            ...at(0.55, 0.0005),
            tags: { amenity: "charging_station", operator: "EV-Edge", motorcar: "yes" },
          },
          {
            type: "node",
            id: 204,
            ...at(0.7),
            tags: { amenity: "fuel", brand: "דלק", opening_hours: "06:00-23:00" },
          },
          { type: "node", id: 205, ...at(0.5, 0.05), tags: { amenity: "fuel", brand: "Far away" } },
          { type: "node", id: 206, ...at(0.3), tags: { amenity: "fuel", access: "private" } },
        ],
      });
    }
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

  // --- Panoramax (STAC search on the meta-catalog) ---
  if (p === "/panoramax/api/search") {
    const origin = `http://127.0.0.1:${PORT}`;
    const ids = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    return send(res, 200, {
      type: "FeatureCollection",
      features: ids.map((id, i) => ({
        type: "Feature",
        id,
        geometry: {
          type: "Point",
          coordinates: [JAFFA.lon + 0.0004 * (i + 1), JAFFA.lat + 0.0002 * (i + 1)],
        },
        properties: {
          datetime: `2025-0${i + 3}-14T10:00:00+00:00`,
          license: "CC-BY-SA-4.0",
          "view:azimuth": 90 * i,
          "geovisio:producer": `mapper${i + 1}`,
          "pers:interior_orientation": { field_of_view: i === 2 ? 360 : 70 },
        },
        assets: {
          thumb: { href: `${origin}/photos/${id}/thumb.jpg` },
          sd: { href: `${origin}/photos/${id}/sd.jpg` },
        },
        links: [{ rel: "license", href: "https://creativecommons.org/licenses/by-sa/4.0/" }],
      })),
    });
  }

  // --- Wikimedia Commons (geosearch generator with imageinfo) ---
  if (p === "/commons/w/api.php") {
    const origin = `http://127.0.0.1:${PORT}`;
    return send(res, 200, {
      batchcomplete: true,
      query: {
        pages: [
          {
            pageid: 4242,
            title: "File:Jaffa Street test photo.jpg",
            coordinates: [{ lat: JAFFA.lat + 0.0003, lon: JAFFA.lon - 0.0002 }],
            imageinfo: [
              {
                thumburl: `${origin}/photos/commons-4242/640px.jpg`,
                descriptionurl: `${origin}/pages/commons-4242`,
                mime: "image/jpeg",
                extmetadata: {
                  LicenseShortName: { value: "CC BY 4.0" },
                  LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0" },
                  Artist: { value: "<a href='https://example.org'>Test Photographer</a>" },
                  DateTimeOriginal: { value: "2019-05-12 10:00:00" },
                },
              },
            ],
          },
        ],
      },
    });
  }
  if (p.startsWith("/photos/")) {
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
    return res.end(cameraJpg);
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
