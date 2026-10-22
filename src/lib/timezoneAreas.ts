import type { LatLon } from "@/lib/types";

export interface ApproximateArea extends LatLon {
  /** City used as the area's centre. */
  city: { he: string; en: string };
  /** Country or region the time zone covers. */
  region: { he: string; en: string };
}

type Row = [
  lat: number,
  lon: number,
  cityHe: string,
  cityEn: string,
  regionHe: string,
  regionEn: string,
];

/**
 * A representative city per IANA time zone. Used on the home page when the
 * visitor has not shared their location: the browser's time zone gives a
 * rough area without any IP lookup or third-party service, and nothing more
 * precise than a city ever leaves the browser.
 */
const ZONES: Record<string, Row> = {
  "Asia/Jerusalem": [32.0853, 34.7818, "תל אביב", "Tel Aviv", "ישראל", "Israel"],
  "Asia/Tel_Aviv": [32.0853, 34.7818, "תל אביב", "Tel Aviv", "ישראל", "Israel"],
  "Asia/Hebron": [31.5326, 35.0998, "חברון", "Hebron", "הגדה המערבית", "West Bank"],
  "Asia/Gaza": [31.5017, 34.4668, "עזה", "Gaza", "רצועת עזה", "Gaza Strip"],
  "Asia/Amman": [31.9539, 35.9106, "עמאן", "Amman", "ירדן", "Jordan"],
  "Asia/Beirut": [33.8938, 35.5018, "ביירות", "Beirut", "לבנון", "Lebanon"],
  "Africa/Cairo": [30.0444, 31.2357, "קהיר", "Cairo", "מצרים", "Egypt"],
  "Asia/Dubai": [25.2048, 55.2708, "דובאי", "Dubai", "איחוד האמירויות", "United Arab Emirates"],
  "Europe/Istanbul": [41.0082, 28.9784, "איסטנבול", "Istanbul", "טורקיה", "Turkey"],
  "Asia/Nicosia": [35.1856, 33.3823, "ניקוסיה", "Nicosia", "קפריסין", "Cyprus"],
  "Europe/Athens": [37.9838, 23.7275, "אתונה", "Athens", "יוון", "Greece"],
  "Europe/London": [51.5074, -0.1278, "לונדון", "London", "בריטניה", "United Kingdom"],
  "Europe/Dublin": [53.3498, -6.2603, "דבלין", "Dublin", "אירלנד", "Ireland"],
  "Europe/Lisbon": [38.7223, -9.1393, "ליסבון", "Lisbon", "פורטוגל", "Portugal"],
  "Europe/Madrid": [40.4168, -3.7038, "מדריד", "Madrid", "ספרד", "Spain"],
  "Europe/Paris": [48.8566, 2.3522, "פריז", "Paris", "צרפת", "France"],
  "Europe/Brussels": [50.8503, 4.3517, "בריסל", "Brussels", "בלגיה", "Belgium"],
  "Europe/Amsterdam": [52.3676, 4.9041, "אמסטרדם", "Amsterdam", "הולנד", "Netherlands"],
  "Europe/Berlin": [52.52, 13.405, "ברלין", "Berlin", "גרמניה", "Germany"],
  "Europe/Zurich": [47.3769, 8.5417, "ציריך", "Zurich", "שווייץ", "Switzerland"],
  "Europe/Vienna": [48.2082, 16.3738, "וינה", "Vienna", "אוסטריה", "Austria"],
  "Europe/Rome": [41.9028, 12.4964, "רומא", "Rome", "איטליה", "Italy"],
  "Europe/Prague": [50.0755, 14.4378, "פראג", "Prague", "צ׳כיה", "Czechia"],
  "Europe/Warsaw": [52.2297, 21.0122, "ורשה", "Warsaw", "פולין", "Poland"],
  "Europe/Budapest": [47.4979, 19.0402, "בודפשט", "Budapest", "הונגריה", "Hungary"],
  "Europe/Bucharest": [44.4268, 26.1025, "בוקרשט", "Bucharest", "רומניה", "Romania"],
  "Europe/Sofia": [42.6977, 23.3219, "סופיה", "Sofia", "בולגריה", "Bulgaria"],
  "Europe/Copenhagen": [55.6761, 12.5683, "קופנהגן", "Copenhagen", "דנמרק", "Denmark"],
  "Europe/Stockholm": [59.3293, 18.0686, "סטוקהולם", "Stockholm", "שוודיה", "Sweden"],
  "Europe/Oslo": [59.9139, 10.7522, "אוסלו", "Oslo", "נורווגיה", "Norway"],
  "Europe/Helsinki": [60.1699, 24.9384, "הלסינקי", "Helsinki", "פינלנד", "Finland"],
  "Europe/Tallinn": [59.437, 24.7536, "טאלין", "Tallinn", "אסטוניה", "Estonia"],
  "Europe/Riga": [56.9496, 24.1052, "ריגה", "Riga", "לטביה", "Latvia"],
  "Europe/Vilnius": [54.6872, 25.2797, "וילנה", "Vilnius", "ליטא", "Lithuania"],
  "Europe/Kyiv": [50.4501, 30.5234, "קייב", "Kyiv", "אוקראינה", "Ukraine"],
  "Europe/Kiev": [50.4501, 30.5234, "קייב", "Kyiv", "אוקראינה", "Ukraine"],
  "Europe/Moscow": [55.7558, 37.6173, "מוסקבה", "Moscow", "רוסיה", "Russia"],
  "America/New_York": [
    40.7128,
    -74.006,
    "ניו יורק",
    "New York",
    "ארצות הברית (מזרח)",
    "United States (East)",
  ],
  "America/Toronto": [43.6532, -79.3832, "טורונטו", "Toronto", "קנדה", "Canada"],
  "America/Chicago": [
    41.8781,
    -87.6298,
    "שיקגו",
    "Chicago",
    "ארצות הברית (מרכז)",
    "United States (Central)",
  ],
  "America/Denver": [
    39.7392,
    -104.9903,
    "דנוור",
    "Denver",
    "ארצות הברית (הרים)",
    "United States (Mountain)",
  ],
  "America/Phoenix": [33.4484, -112.074, "פיניקס", "Phoenix", "אריזונה", "Arizona"],
  "America/Los_Angeles": [
    34.0522,
    -118.2437,
    "לוס אנג׳לס",
    "Los Angeles",
    "ארצות הברית (מערב)",
    "United States (West)",
  ],
  "America/Vancouver": [49.2827, -123.1207, "ונקובר", "Vancouver", "קנדה (מערב)", "Canada (West)"],
  "America/Mexico_City": [19.4326, -99.1332, "מקסיקו סיטי", "Mexico City", "מקסיקו", "Mexico"],
  "America/Sao_Paulo": [-23.5505, -46.6333, "סאו פאולו", "São Paulo", "ברזיל", "Brazil"],
  "America/Argentina/Buenos_Aires": [
    -34.6037,
    -58.3816,
    "בואנוס איירס",
    "Buenos Aires",
    "ארגנטינה",
    "Argentina",
  ],
  "Asia/Kolkata": [28.6139, 77.209, "ניו דלהי", "New Delhi", "הודו", "India"],
  "Asia/Bangkok": [13.7563, 100.5018, "בנגקוק", "Bangkok", "תאילנד", "Thailand"],
  "Asia/Singapore": [1.3521, 103.8198, "סינגפור", "Singapore", "סינגפור", "Singapore"],
  "Asia/Hong_Kong": [22.3193, 114.1694, "הונג קונג", "Hong Kong", "הונג קונג", "Hong Kong"],
  "Asia/Shanghai": [31.2304, 121.4737, "שנגחאי", "Shanghai", "סין", "China"],
  "Asia/Seoul": [37.5665, 126.978, "סיאול", "Seoul", "קוריאה הדרומית", "South Korea"],
  "Asia/Tokyo": [35.6762, 139.6503, "טוקיו", "Tokyo", "יפן", "Japan"],
  "Australia/Sydney": [-33.8688, 151.2093, "סידני", "Sydney", "אוסטרליה", "Australia"],
  "Australia/Melbourne": [-37.8136, 144.9631, "מלבורן", "Melbourne", "אוסטרליה", "Australia"],
  "Pacific/Auckland": [-36.8485, 174.7633, "אוקלנד", "Auckland", "ניו זילנד", "New Zealand"],
  "Africa/Johannesburg": [
    -26.2041,
    28.0473,
    "יוהנסבורג",
    "Johannesburg",
    "דרום אפריקה",
    "South Africa",
  ],
  "Africa/Nairobi": [-1.2921, 36.8219, "ניירובי", "Nairobi", "קניה", "Kenya"],
  "Africa/Lagos": [6.5244, 3.3792, "לאגוס", "Lagos", "ניגריה", "Nigeria"],
};

/** The area for a time zone such as "Asia/Jerusalem", or null when it is not in the table. */
export function areaForTimeZone(timeZone: string | undefined): ApproximateArea | null {
  const row = timeZone ? ZONES[timeZone] : undefined;
  if (!row) return null;
  const [lat, lon, cityHe, cityEn, regionHe, regionEn] = row;
  return { lat, lon, city: { he: cityHe, en: cityEn }, region: { he: regionHe, en: regionEn } };
}

/** The browser's time zone, or undefined where Intl cannot tell. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
