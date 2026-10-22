"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import type { LatLon, Section, StreetPhoto } from "@/lib/types";

/**
 * Photos near a point, fetched on their own so a slow photo source never
 * delays the report. `point` null means "nothing to show".
 */
export function usePhotos(
  point: LatLon | null,
  reloadToken: number,
  /** Search radius in metres; the server's default when omitted. */
  radiusM?: number,
): { section: Section<StreetPhoto[]> | undefined; loading: boolean } {
  const key = point ? `${point.lat},${point.lon},${radiusM ?? ""},${reloadToken}` : null;
  const [result, setResult] = useState<{ key: string; section: Section<StreetPhoto[]> } | null>(
    null,
  );
  const lat = point?.lat;
  const lon = point?.lon;

  useEffect(() => {
    if (!key || lat === undefined || lon === undefined) return;
    const controller = new AbortController();
    const radius = radiusM ? `&radius=${radiusM}` : "";
    apiGet<Section<StreetPhoto[]>>(`/api/photos?lat=${lat}&lon=${lon}${radius}`, {
      signal: controller.signal,
    })
      .then((section) => setResult({ key, section }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key, section: { status: "unavailable", reason: "error" } });
        }
      });
    return () => controller.abort();
  }, [key, lat, lon, radiusM]);

  return {
    section: result?.key === key ? result.section : undefined,
    loading: Boolean(key) && result?.key !== key,
  };
}
