import { apiHandler, json, parsePoint } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/area?lat=&lon= → AreaSummary (home page: weather now and today, cameras nearby) */
export const GET = apiHandler(async (request) => {
  const point = parsePoint(request.nextUrl.searchParams);
  return json(await services().area.summary(point), { maxAge: 300 });
});
