import { TtlCache } from "@/lib/cache";
import { roundCoord } from "@/lib/geo";
import type { LatLon, ParkingFacility, Section } from "@/lib/types";
import { getProvider } from "@/providers/registry";

const MAX_RESULTS = 40;

/**
 * Finds parking near a point. Parking facilities change rarely, so results
 * are cached for 12 hours, which also keeps load on the shared Overpass
 * instance low.
 */
export class ParkingService {
  private readonly cache = new TtlCache<ParkingFacility[]>(1000);

  isConfigured(): boolean {
    return Boolean(getProvider("parking"));
  }

  async find(point: LatLon, radiusM: number): Promise<Section<ParkingFacility[]>> {
    const provider = getProvider("parking");
    if (!provider) return { status: "unavailable", reason: "not_configured" };
    const key = `${provider.def.id}:${roundCoord(point.lat, 3)},${roundCoord(point.lon, 3)}:${radiusM}`;
    try {
      const all = await this.cache.getOrSet(key, 12 * 60 * 60_000, () =>
        provider.instance.parking(point, radiusM),
      );
      const data = [...all].sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_RESULTS);
      const source = data[0]?.source ?? {
        providerId: provider.def.id,
        name: provider.def.name,
        attribution: provider.def.attribution,
        url: provider.def.homepage,
        fetchedAt: new Date().toISOString(),
      };
      // Facility locations are reference data, not a live reading.
      return { status: "ok", data, freshness: "unknown", sources: [source] };
    } catch (error) {
      console.warn("[parking] lookup failed:", error);
      return {
        status: "unavailable",
        reason: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
