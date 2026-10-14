import { TtlCache } from "@/lib/cache";
import { parseLatLon, roundCoord } from "@/lib/geo";
import type { LatLon, Locale, Place } from "@/lib/types";
import { getProvider } from "@/providers/registry";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Turns free text into coordinates and back, through the configured
 * geocoding provider. Results are cached for a day to respect upstream
 * usage policies (Nominatim requires caching).
 */
export class LocationService {
  private readonly searchCache = new TtlCache<Place[]>(2000);
  private readonly reverseCache = new TtlCache<Place | null>(2000);

  private provider() {
    const provider = getProvider("geocoding");
    if (!provider) throw new Error("no geocoding provider configured");
    return provider;
  }

  async search(query: string, locale: Locale): Promise<Place[]> {
    const normalized = query.trim().replace(/\s+/g, " ");
    const coords = parseLatLon(normalized);
    if (coords) {
      const place = await this.reverse(coords, locale).catch(() => null);
      return [
        place ? { ...place, lat: coords.lat, lon: coords.lon } : this.coordinatePlace(coords),
      ];
    }
    const { def, instance } = this.provider();
    const key = `${def.id}:${locale}:${normalized.toLocaleLowerCase()}`;
    return this.searchCache.getOrSet(key, DAY_MS, () => instance.search(normalized, locale));
  }

  async reverse(point: LatLon, locale: Locale): Promise<Place | null> {
    const { def, instance } = this.provider();
    const key = `${def.id}:${locale}:${roundCoord(point.lat)},${roundCoord(point.lon)}`;
    return this.reverseCache.getOrSet(key, DAY_MS, () => instance.reverse(point, locale));
  }

  private coordinatePlace(point: LatLon): Place {
    return {
      id: `coords:${point.lat},${point.lon}`,
      label: `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`,
      lat: point.lat,
      lon: point.lon,
      kind: "coordinates",
      source: {
        providerId: "user",
        name: "Coordinates",
        attribution: "",
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
