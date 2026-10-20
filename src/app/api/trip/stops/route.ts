import { apiHandler, json, parseEndpoint, parseLocale } from "@/lib/api";
import { services } from "@/services";

export const dynamic = "force-dynamic";

/** GET /api/trip/stops?from=lat,lon&to=lat,lon → Section<TripStop[]> (fuel, chargers, rest areas along the route) */
export const GET = apiHandler(async (request) => {
  const params = request.nextUrl.searchParams;
  const stops = await services().trip.stops(
    parseEndpoint(params, "from"),
    parseEndpoint(params, "to"),
    parseLocale(params.get("lang")),
  );
  return json(stops, { maxAge: 600 });
});
