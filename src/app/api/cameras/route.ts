import { apiHandler, json, parsePoint } from "@/lib/api";
import { getConfig } from "@/lib/config";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/cameras?lat=&lon=&radius= → { cameras: CameraView[] } */
export const GET = apiHandler(async (request) => {
  const params = request.nextUrl.searchParams;
  const requested = Number(params.get("radius"));
  const radius =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, 50_000)
      : getConfig().CAMERA_SEARCH_RADIUS_M;
  const { cameras, errors } = await services().cameras.findNear(parsePoint(params), radius);
  return json({ cameras, errors: errors.map((e) => e.providerId) });
});
