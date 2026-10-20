import { apiHandler, json, parseEndpoint, parseLocale } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/trip?from=lat,lon&to=lat,lon&lang=&fromLabel=&toLabel= → TripReport */
export const GET = apiHandler(
  async (request) => {
    const params = request.nextUrl.searchParams;
    const report = await services().trip.plan(
      parseEndpoint(params, "from"),
      parseEndpoint(params, "to"),
      parseLocale(params.get("lang")),
    );
    return json(report);
  },
  { cost: 3 },
);
