import { apiHandler, json, parseLocale, parsePoint } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/summary?lat=&lon=&lang= → AiSummary (503 when no AI provider is configured).
 * A `label` parameter is ignored: summaries are shared between users, so the
 * place name comes from the geocoder, never from the request.
 */
export const GET = apiHandler(
  async (request) => {
    const params = request.nextUrl.searchParams;
    const summary = await services().summary.summarize(
      parsePoint(params),
      parseLocale(params.get("lang")),
    );
    return json(summary);
  },
  { cost: 5 },
);
