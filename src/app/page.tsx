import { cookies } from "next/headers";
import { StreetSituationApp } from "@/components/StreetSituationApp";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { getConfig } from "@/lib/config";
import type { MapConfig } from "@/lib/types";
import { getProviderStatuses } from "@/providers/registry";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(value) ? value : DEFAULT_LOCALE;
  const config = getConfig();
  // Map settings are read at runtime so a Docker image can be reconfigured without rebuilding.
  const map: MapConfig = {
    vector:
      config.MAP_TYPE === "vector"
        ? { styleUrl: config.MAP_STYLE_URL, attribution: config.MAP_STYLE_ATTRIBUTION }
        : null,
    tileUrl: config.MAP_TILE_URL,
    attribution: config.MAP_ATTRIBUTION,
    maxZoom: config.MAP_MAX_ZOOM,
    defaultCenter: config.MAP_DEFAULT_CENTER.split(",").map(Number) as [number, number],
    defaultZoom: config.MAP_DEFAULT_ZOOM,
  };
  return (
    <StreetSituationApp
      locale={locale}
      map={map}
      providers={getProviderStatuses()}
      cameraRadiusM={config.CAMERA_SEARCH_RADIUS_M}
      parkingRadiusM={config.PARKING_SEARCH_RADIUS_M}
    />
  );
}
