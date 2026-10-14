import { apiHandler, json, parseLabel, parseLocale, parsePoint } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/situation?lat=&lon=&lang=&label= → SituationReport */
export const GET = apiHandler(async (request) => {
  const params = request.nextUrl.searchParams;
  const report = await services().situation.report(
    parsePoint(params),
    parseLocale(params.get("lang")),
    parseLabel(params.get("label")),
  );
  return json(report);
});
