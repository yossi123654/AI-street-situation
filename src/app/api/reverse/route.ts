import { apiHandler, json, parseLocale, parsePoint } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/reverse?lat=&lon=&lang= → { place: Place | null } */
export const GET = apiHandler(async (request) => {
  const params = request.nextUrl.searchParams;
  const place = await services().location.reverse(
    parsePoint(params),
    parseLocale(params.get("lang")),
  );
  return json({ place }, { maxAge: 3600 });
});
