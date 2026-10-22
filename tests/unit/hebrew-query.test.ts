import { afterEach, describe, expect, it, vi } from "vitest";
import {
  citiesIn,
  inNamedCity,
  isHebrewQuery,
  normalizeHebrewQuery,
  queryVariants,
  withoutHouseNumber,
} from "@/lib/hebrewQuery";
import { LocationService } from "@/services/LocationService";
import { jsonResponse, mockFetch, withEnv } from "./helpers";

let restore: (() => void) | undefined;

describe("Hebrew address queries", () => {
  it.each([
    ["רחוב יפו 23 ירושלים", "יפו 23 ירושלים"],
    ["רח' הרצל 10 תל אביב", "הרצל 10 תל אביב"],
    ["רח׳ הרצל 10, ת״א", "הרצל 10, תל אביב"],
    ["שד' רוטשילד 1 ת\"א", "שדרות רוטשילד 1 תל אביב"],
    ["דיזנגוף 50 ת״א-יפו", "דיזנגוף 50 תל אביב"],
    ["בן יהודה 5 י-ם", "בן יהודה 5 ירושלים"],
    ["ז׳בוטינסקי 7 ר״ג", "ז'בוטינסקי 7 רמת גן"],
    ["רחוב הנביאים,ירושלים", "הנביאים, ירושלים"],
    ["סמ' הגפן 3 פ\"ת", "סמטת הגפן 3 פתח תקווה"],
    ["קניון עזריאלי", "קניון עזריאלי"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeHebrewQuery(input)).toBe(expected);
  });

  it("leaves words that only contain the prefixes alone", () => {
    expect(normalizeHebrewQuery("רחובות")).toBe("רחובות");
    expect(normalizeHebrewQuery("שדרות")).toBe("שדרות");
    expect(normalizeHebrewQuery("רחביה, ירושלים")).toBe("רחביה, ירושלים");
  });

  it("does not touch non-Hebrew queries", () => {
    expect(isHebrewQuery("Jaffa Street 23, Jerusalem")).toBe(false);
    expect(normalizeHebrewQuery("Rehov Herzl 10")).toBe("Rehov Herzl 10");
    expect(queryVariants("Trafalgar Square")).toEqual(["Trafalgar Square"]);
  });

  it("drops the house number for a fallback query", () => {
    expect(withoutHouseNumber("הרצל 10 תל אביב")).toBe("הרצל תל אביב");
    expect(withoutHouseNumber("הרצל 10א, תל אביב")).toBe("הרצל, תל אביב");
    expect(withoutHouseNumber("קניון עזריאלי")).toBeNull();
    // Numbers inside names stay ("כ"ט בנובמבר" has none, but "1" alone would be a number).
    expect(withoutHouseNumber("תל אביב")).toBeNull();
  });

  it("lists variants best first, without duplicates", () => {
    expect(queryVariants("רחוב יפו 23 ירושלים")).toEqual([
      "יפו 23 ירושלים",
      "רחוב יפו 23 ירושלים",
      "יפו ירושלים",
    ]);
    expect(queryVariants("קניון עזריאלי")).toEqual(["קניון עזריאלי"]);
  });
});

describe("city check", () => {
  it("finds the cities a query names", () => {
    expect(citiesIn("הרצל 10 תל אביב")).toEqual(["תל אביב"]);
    expect(citiesIn("הנביאים, ירושלים")).toEqual(["ירושלים"]);
    expect(citiesIn("שדרות רוטשילד 1 תל אביב")).toEqual(["תל אביב"]);
    expect(citiesIn("הרצל 5 שדרות")).toEqual(["שדרות"]);
    expect(citiesIn("קניון עזריאלי")).toEqual([]);
  });

  it("drops results in other towns, and ignores dashes and maqaf in names", () => {
    const places = [
      {
        label: "סמטת הגפן",
        fullLabel: "סמטת הגפן, מועצה אזורית דרום השרון, נפת פתח תקווה, מחוז המרכז, ישראל",
      },
      { label: "דיזנגוף 50", fullLabel: "50, דיזנגוף, תל־אביב–יפו, ישראל" },
    ];
    expect(inNamedCity(places, "סמטת הגפן פתח תקווה")).toEqual([]);
    expect(inNamedCity(places, "דיזנגוף 50 תל אביב")).toEqual([places[1]]);
    expect(inNamedCity(places, "קניון עזריאלי")).toEqual(places);
  });
});

describe("LocationService with Hebrew queries", () => {
  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.unstubAllGlobals();
  });

  const result = (name: string) => ({
    place_id: 1,
    osm_type: "way",
    osm_id: 1,
    lat: "32.07",
    lon: "34.78",
    name,
    display_name: `${name}, תל אביב-יפו, ישראל`,
    type: "residential",
    address: { road: name, city: "תל אביב-יפו", country: "ישראל" },
  });

  it("searches the rewritten query first and falls back to the street alone", async () => {
    restore = withEnv({ NOMINATIM_URL: "https://geo.example.org" });
    const queries: string[] = [];
    mockFetch((url) => {
      const q = url.searchParams.get("q")!;
      queries.push(q);
      return jsonResponse(q === "הרצל תל אביב" ? [result("הרצל")] : []);
    });
    const places = await new LocationService().search("רח' הרצל 999 ת\"א", "he");
    expect(queries).toEqual(["הרצל 999 תל אביב", "רח' הרצל 999 ת\"א", "הרצל תל אביב"]);
    expect(places).toHaveLength(1);
  });

  it("only applies the city check to Hebrew results", async () => {
    restore = withEnv({ NOMINATIM_URL: "https://geo.example.org" });
    mockFetch(() =>
      jsonResponse([
        {
          ...result("Herzl"),
          display_name: "Herzl, Tel Aviv-Yafo, Israel",
          address: { road: "Herzl", city: "Tel Aviv-Yafo", country: "Israel" },
        },
      ]),
    );
    const places = await new LocationService().search("הרצל 10 תל אביב", "en");
    expect(places).toHaveLength(1);
  });

  it("stops at the first query that finds something", async () => {
    restore = withEnv({ NOMINATIM_URL: "https://geo.example.org" });
    const fetch = mockFetch(() => jsonResponse([result("דיזנגוף")]));
    await new LocationService().search("דיזנגוף 50 ת״א", "he");
    expect(fetch).toHaveBeenCalledOnce();
    expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get("q")).toBe(
      "דיזנגוף 50 תל אביב",
    );
  });
});
