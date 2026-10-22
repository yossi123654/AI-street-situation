/**
 * Israelis type addresses the way they write them on an envelope: "רח' הרצל
 * 10 ת"א", "שד' רוטשילד", "בן יהודה 5 י-ם". OpenStreetMap geocoders know the
 * streets but not these conventions: a "רחוב" prefix makes Nominatim find
 * nothing, and "ת"א" or "ר"ג" match unrelated streets in other cities. This
 * module rewrites such queries into the form the geocoder understands.
 */

const HEBREW = /[֐-׿]/;

/** City abbreviations (with ASCII quotes after normalisation) → full names. */
const CITY_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/ת"א(?:-יפו)?/g, "תל אביב"],
  [/י-ם|י"ם|ירו-ם/g, "ירושלים"],
  [/ב"ש/g, "באר שבע"],
  [/פ"ת/g, "פתח תקווה"],
  [/ר"ג/g, "רמת גן"],
  [/ראשל"צ/g, "ראשון לציון"],
  [/כ"ס/g, "כפר סבא"],
  [/ב"ב/g, "בני ברק"],
  [/נ"צ/g, "נס ציונה"],
  [/ק"ש/g, "קריית שמונה"],
  [/ק"ג/g, "קריית גת"],
  [/ק"א/g, "קריית אתא"],
];

/** Street-type words written before the name. "רחוב" is dropped; abbreviations are expanded. */
const STREET_PREFIXES: Array<[RegExp, string]> = [
  [/(^|[\s,])(?:רחוב|רח'|רח\.|רח)\s+/g, "$1"],
  [/(^|[\s,])(?:שד'|שד\.)\s*/g, "$1שדרות "],
  [/(^|[\s,])(?:סמ'|סמ\.)\s*/g, "$1סמטת "],
  [/(^|[\s,])(?:כ"כ|כיכ')\s*/g, "$1כיכר "],
];

/** True when the query is written (at least partly) in Hebrew. */
export function isHebrewQuery(query: string): boolean {
  return HEBREW.test(query);
}

/** Unifies Hebrew and typographic quote marks: ״ “ ” → ", ׳ ‘ ’ ` → '. */
export function unifyQuotes(text: string): string {
  return text.replace(/[״“”„]/g, '"').replace(/[׳‘’`]/g, "'");
}

/** Rewrites a Hebrew address query into geocoder-friendly form. Other text is returned unchanged. */
export function normalizeHebrewQuery(query: string): string {
  if (!isHebrewQuery(query)) return query;
  let text = unifyQuotes(query);
  for (const [pattern, replacement] of CITY_ABBREVIATIONS)
    text = text.replace(pattern, replacement);
  for (const [pattern, replacement] of STREET_PREFIXES) text = text.replace(pattern, replacement);
  return text
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .trim();
}

/** The query without a house number ("הרצל 10 תל אביב" → "הרצל תל אביב"), or null if it has none. */
export function withoutHouseNumber(query: string): string | null {
  const stripped = query
    .replace(/(^|\s)\d+[א-ת]?(?=\s|,|$)/g, "$1")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  return stripped !== query && stripped.length > 0 ? stripped : null;
}

/**
 * Queries to try, best first: the normalised query, then the original (in
 * case the rewrite hurt), then the normalised query without a house number
 * (a street is better than nothing). Duplicates are removed.
 */
export function queryVariants(query: string): string[] {
  if (!isHebrewQuery(query)) return [query];
  const normalized = normalizeHebrewQuery(query);
  const variants = [normalized, query, withoutHouseNumber(normalized)];
  return [...new Set(variants.filter((v): v is string => Boolean(v)))];
}

/** Israeli cities whose name in a query means "in this city". */
const CITIES = [
  "ירושלים",
  "תל אביב",
  "חיפה",
  "באר שבע",
  "פתח תקווה",
  "רמת גן",
  "ראשון לציון",
  "כפר סבא",
  "בני ברק",
  "נס ציונה",
  "קריית שמונה",
  "קריית גת",
  "קריית אתא",
  "קריית אונו",
  "קריית ביאליק",
  "קריית מוצקין",
  "קריית ים",
  "חולון",
  "בת ים",
  "הרצליה",
  "רעננה",
  "נתניה",
  "אשדוד",
  "אשקלון",
  "רחובות",
  "מודיעין",
  "אילת",
  "נצרת",
  "עכו",
  "טבריה",
  "צפת",
  "הוד השרון",
  "גבעתיים",
  "רמת השרון",
  "ראש העין",
  "לוד",
  "רמלה",
  "בית שמש",
  "יבנה",
  "נהריה",
  "עפולה",
  "דימונה",
  "ערד",
  "חדרה",
  "כרמיאל",
  "אור יהודה",
  "גבעת שמואל",
  "יהוד",
  "אלעד",
  "ביתר עילית",
  "מעלה אדומים",
  "אריאל",
  "שדרות",
  "אופקים",
  "נתיבות",
  "קיסריה",
  "זכרון יעקב",
];

/** Lower-noise text for comparing place names: no maqaf/dashes, quotes or extra spaces. */
function comparable(text: string): string {
  return unifyQuotes(text)
    .replace(/[־–—-]/g, " ")
    .replace(/['"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The cities a (normalised) Hebrew query names, e.g. "הרצל 10 תל אביב" → ["תל אביב"]. */
export function citiesIn(query: string): string[] {
  const text = ` ${comparable(query)} `;
  // "שדרות" is also a street type ("שדרות רוטשילד"): only count it as the last word.
  return CITIES.filter((city) =>
    city === "שדרות"
      ? /\sשדרות\s*$/.test(text)
      : text.includes(` ${city} `) || text.includes(` ${city},`),
  );
}

/**
 * Keeps results that lie in a city the query names. Geocoders match loosely
 * and will happily return a "סמטת הגפן" in another town; when the query says
 * which city, other towns are wrong answers.
 */
export function inNamedCity<T extends { label: string; fullLabel?: string }>(
  places: T[],
  query: string,
): T[] {
  const cities = citiesIn(query);
  if (cities.length === 0) return places;
  // "נפת פתח תקווה" / "מחוז חיפה" name a subdistrict or district, not the city.
  const patterns = cities.map(
    (city) => new RegExp(`(?:^|[\\s,])(?<!(?:נפת|מחוז) )${city}(?=[\\s,]|$)`),
  );
  return places.filter((place) => {
    const text = comparable(`${place.label}, ${place.fullLabel ?? ""}`);
    return patterns.some((pattern) => pattern.test(text));
  });
}
