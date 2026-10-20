import { buildUrl, upstreamJson } from "@/lib/http";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

const CURRENT_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "wind_speed_10m",
  "wind_direction_10m",
  "visibility",
  "is_day",
] as const;

type CurrentVar = (typeof CURRENT_VARS)[number];

const HOURLY_VARS = [
  "temperature_2m",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "visibility",
  "is_day",
] as const;
type HourlyVar = (typeof HOURLY_VARS)[number];

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  current?: { time: string; interval?: number } & Partial<Record<CurrentVar, number | null>>;
  hourly?: { time: string[] } & Partial<Record<HourlyVar, Array<number | null>>>;
}

/** Open-Meteo returns times like "2026-10-14T09:45" in the requested zone (we ask for GMT). */
const toIso = (time: string) => (/Z|[+-]\d\d:?\d\d$/.test(time) ? time : `${time}:00Z`);

/** Index of the hourly slot closest to `at`, or -1. */
export function nearestHourIndex(times: string[], at: Date): number {
  let best = -1;
  let bestDiff = Infinity;
  const target = at.getTime();
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(Date.parse(toIso(times[i]!)) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const openMeteo: ProviderDefinition<"weather"> = {
  id: "open-meteo",
  kind: "weather",
  name: "Open-Meteo",
  homepage: "https://open-meteo.com/",
  attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
  requiredEnv: [],
  isEnabled: (config) => config.WEATHER_ENABLED,
  create(config) {
    return {
      async current(point) {
        const url = buildUrl(config.OPEN_METEO_URL, "v1/forecast", {
          latitude: point.lat.toFixed(4),
          longitude: point.lon.toFixed(4),
          current: CURRENT_VARS.join(","),
          wind_speed_unit: "kmh",
          timezone: "GMT",
        });
        const data = await upstreamJson<OpenMeteoResponse>(url, { providerId: openMeteo.id });
        const c = data.current;
        if (!c) throw new Error("open-meteo response has no current conditions");
        // With timezone=GMT, times are UTC without an offset, e.g. "2026-10-14T01:45".
        const observedAt = toIso(c.time);
        const isDay = num(c.is_day);
        return {
          temperatureC: num(c.temperature_2m),
          apparentTemperatureC: num(c.apparent_temperature),
          humidityPct: num(c.relative_humidity_2m),
          precipitationMm: num(c.precipitation),
          weatherCode: num(c.weather_code),
          windSpeedKmh: num(c.wind_speed_10m),
          windDirectionDeg: num(c.wind_direction_10m),
          cloudCoverPct: num(c.cloud_cover),
          visibilityM: num(c.visibility),
          isDay: isDay === null ? null : isDay === 1,
          source: sourceFrom(openMeteo, new Date(observedAt).toISOString()),
        };
      },
      async forecastAt(points) {
        if (points.length === 0) return [];
        // One request for all points: Open-Meteo accepts comma-separated coordinate lists.
        const url = buildUrl(config.OPEN_METEO_URL, "v1/forecast", {
          latitude: points.map((p) => p.lat.toFixed(3)).join(","),
          longitude: points.map((p) => p.lon.toFixed(3)).join(","),
          current: CURRENT_VARS.join(","),
          hourly: HOURLY_VARS.join(","),
          // Cover the latest requested time (trips can start up to a week ahead).
          forecast_days: Math.min(
            16,
            Math.max(
              2,
              Math.ceil(
                (Math.max(...points.map((p) => p.at.getTime())) - Date.now()) / 86_400_000,
              ) + 1,
            ),
          ),
          wind_speed_unit: "kmh",
          timezone: "GMT",
        });
        const raw = await upstreamJson<OpenMeteoResponse | OpenMeteoResponse[]>(url, {
          providerId: openMeteo.id,
        });
        const list = Array.isArray(raw) ? raw : [raw];
        if (list.length !== points.length)
          throw new Error("open-meteo returned an unexpected number of locations");
        const now = Date.now();
        return list.map((entry, i) => {
          const at = points[i]!.at;
          const c = entry.current;
          const useCurrent = c && at.getTime() - now < 30 * 60_000;
          if (useCurrent) {
            const isDay = num(c.is_day);
            return {
              temperatureC: num(c.temperature_2m),
              weatherCode: num(c.weather_code),
              precipitationMm: num(c.precipitation),
              windSpeedKmh: num(c.wind_speed_10m),
              visibilityM: num(c.visibility),
              isDay: isDay === null ? null : isDay === 1,
              validAt: new Date(toIso(c.time)).toISOString(),
              kind: "current" as const,
            };
          }
          const h = entry.hourly;
          const index = h ? nearestHourIndex(h.time, at) : -1;
          if (!h || index < 0) throw new Error("open-meteo returned no hourly forecast");
          const pick = (key: HourlyVar) => num(h[key]?.[index]);
          const isDay = pick("is_day");
          return {
            temperatureC: pick("temperature_2m"),
            weatherCode: pick("weather_code"),
            precipitationMm: pick("precipitation"),
            windSpeedKmh: pick("wind_speed_10m"),
            visibilityM: pick("visibility"),
            isDay: isDay === null ? null : isDay === 1,
            validAt: new Date(toIso(h.time[index]!)).toISOString(),
            kind: "forecast" as const,
          };
        });
      },
    };
  },
};
