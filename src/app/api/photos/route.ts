import { apiHandler, json, parsePoint } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/photos?lat=&lon= → Section<StreetPhoto[]> (published photos near the point) */
export const GET = apiHandler(async (request) => {
  const point = parsePoint(request.nextUrl.searchParams);
  const section = await services().photos.find(point, getConfig().PHOTO_SEARCH_RADIUS_M);
  return json(section, { maxAge: 600 });
});
