import { apiHandler, json, parseLabel, parseLocale, parsePoint } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/summary?lat=&lon=&lang=&label= → AiSummary (503 when no AI provider is configured) */
export const GET = apiHandler(
  async (request) => {
    const params = request.nextUrl.searchParams;
    const summary = await services().summary.summarize(
      parsePoint(params),
      parseLocale(params.get("lang")),
      parseLabel(params.get("label")),
    );
    return json(summary);
  },
  { cost: 5 },
);
