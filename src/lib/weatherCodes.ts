/** WMO weather interpretation codes (as used by Open-Meteo) → message key + emoji. */
export type WmoKey =
  | "clear"
  | "mainlyClear"
  | "partlyCloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "freezingDrizzle"
  | "rain"
  | "freezingRain"
  | "snow"
  | "showers"
  | "snowShowers"
  | "thunderstorm"
  | "unknown";

export function describeWeatherCode(
  code: number | null,
  isDay: boolean | null = true,
): {
  key: WmoKey;
  emoji: string;
} {
  const night = isDay === false;
  switch (code) {
    case 0:
      return { key: "clear", emoji: night ? "🌙" : "☀️" };
    case 1:
      return { key: "mainlyClear", emoji: night ? "🌙" : "🌤️" };
    case 2:
      return { key: "partlyCloudy", emoji: "⛅" };
    case 3:
      return { key: "overcast", emoji: "☁️" };
    case 45:
    case 48:
      return { key: "fog", emoji: "🌫️" };
    case 51:
    case 53:
    case 55:
      return { key: "drizzle", emoji: "🌦️" };
    case 56:
    case 57:
      return { key: "freezingDrizzle", emoji: "🌧️" };
    case 61:
    case 63:
    case 65:
      return { key: "rain", emoji: "🌧️" };
    case 66:
    case 67:
      return { key: "freezingRain", emoji: "🌧️" };
    case 71:
    case 73:
    case 75:
    case 77:
      return { key: "snow", emoji: "🌨️" };
    case 80:
    case 81:
    case 82:
      return { key: "showers", emoji: "🌦️" };
    case 85:
    case 86:
      return { key: "snowShowers", emoji: "🌨️" };
    case 95:
    case 96:
    case 99:
      return { key: "thunderstorm", emoji: "⛈️" };
    default:
      return { key: "unknown", emoji: "🌡️" };
  }
}
