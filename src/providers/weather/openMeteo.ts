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

interface OpenMeteoResponse {
  current?: { time: string; interval?: number } & Partial<Record<CurrentVar, number | null>>;
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
        const observedAt = /Z|[+-]\d\d:?\d\d$/.test(c.time) ? c.time : `${c.time}:00Z`;
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
    };
  },
};
