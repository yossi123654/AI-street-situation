import { apiHandler, json, parsePoint } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/parking?lat=&lon=&radius= → Section<ParkingFacility[]> */
export const GET = apiHandler(async (request) => {
  const params = request.nextUrl.searchParams;
  const requested = Number(params.get("radius"));
  const radius =
    Number.isFinite(requested) && requested >= 100
      ? Math.min(Math.round(requested), 3000)
      : getConfig().PARKING_SEARCH_RADIUS_M;
  return json(await services().parking.find(parsePoint(params), radius), { maxAge: 300 });
});
