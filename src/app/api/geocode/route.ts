import { apiHandler, json, parseLocale } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/geocode?q=<text>&lang=he|en → Place[] */
export const GET = apiHandler(async (request) => {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 200) throw badRequest("q must be between 2 and 200 characters");
  const places = await services().location.search(q, parseLocale(params.get("lang")));
  return json({ places }, { maxAge: 3600 });
});
