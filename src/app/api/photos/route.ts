import { apiHandler, json, parsePoint } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/photos?lat=&lon=[&radius=] → Section<StreetPhoto[]> (published photos near the point) */
export const GET = apiHandler(async (request) => {
  const params = request.nextUrl.searchParams;
  const point = parsePoint(params);
  // The home page asks for a wider area (its point is rounded to ~1 km).
  const requested = Number(params.get("radius"));
  const radius =
    Number.isFinite(requested) && requested >= 50
      ? Math.min(Math.round(requested), 2000)
      : getConfig().PHOTO_SEARCH_RADIUS_M;
  const section = await services().photos.find(point, radius);
  return json(section, { maxAge: 600 });
});
