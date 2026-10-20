import { apiHandler, json, parseEndpoint, parseLocale } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/trip/summary?from=lat,lon&to=lat,lon&lang= → AiSummary (503 when no AI provider is configured) */
export const GET = apiHandler(
  async (request) => {
    const params = request.nextUrl.searchParams;
    const summary = await services().summary.summarizeTrip(
      parseEndpoint(params, "from"),
      parseEndpoint(params, "to"),
      parseLocale(params.get("lang")),
    );
    return json(summary);
  },
  { cost: 5 },
);
