# Adding a data provider

Providers are small adapters around one upstream service. The UI and services
never talk to upstream APIs directly, so adding or swapping a provider does not
touch the rest of the app.

```
src/providers/
  types.ts            interfaces: GeocodingProvider, WeatherProvider, TrafficProvider,
                      IncidentsProvider, CameraProvider, ParkingProvider, RoutingProvider,
                      StopsProvider, AiProvider
  registry.ts         ALL_PROVIDERS list, selection rules
  geocoding/          nominatim, photon, google
  weather/            openMeteo
  traffic/            tomtom, here
  incidents/          tomtom, here, wzdx (open road-work feeds)
  cameras/            staticJson (community registry), tflJamCam, digitraffic,
                      singapore, hongKong, cachedList (shared list cache)
  parking/            overpass (OpenStreetMap)
  routing/            osrm (free default), tomtom (live traffic)
  stops/              overpass (fuel, chargers, rest areas along a route)
  overpass/           shared Overpass client with endpoint failover
  vision/             ollama, anthropic
```

## 1. Implement a `ProviderDefinition`

```ts
// src/providers/weather/myWeather.ts
import { buildUrl, upstreamJson } from "@/lib/http";
import { sourceFrom } from "@/providers/source";
import type { ProviderDefinition } from "@/providers/types";

export const myWeather: ProviderDefinition<"weather"> = {
  id: "my-weather", // unique per kind
  kind: "weather",
  name: "My Weather Service",
  homepage: "https://example.org/docs",
  attribution: "Weather © My Weather Service", // shown next to the data
  requiredEnv: ["MY_WEATHER_API_KEY"], // shown on the providers panel
  isEnabled: (config) => Boolean(config.MY_WEATHER_API_KEY),
  create(config) {
    return {
      async current(point) {
        const url = buildUrl(config.MY_WEATHER_URL, "v1/now", {
          lat: point.lat,
          lon: point.lon,
          key: config.MY_WEATHER_API_KEY,
        });
        const data = await upstreamJson<{ temp: number; observed: string }>(url, {
          providerId: myWeather.id,
        });
        return {
          temperatureC: data.temp,
          // ...fill every field of WeatherData, using null when unknown
          source: sourceFrom(myWeather, data.observed), // observedAt drives freshness
        };
      },
    };
  },
};
```

Guidelines:

- **Use `upstreamJson` / `upstreamFetch`** from `src/lib/http.ts`. They add the
  User-Agent, a timeout and consistent errors.
- **Return normalised domain types** from `src/lib/types.ts`. Use `null` for
  unknown values. Never invent defaults.
- **Set `observedAt`** whenever the upstream says when data was measured. The
  UI uses it to label data as live, recent or outdated. If the upstream gives
  no time, use the fetch time only when the API is documented as real-time.
- **Respect rate limits** in the provider (see the Nominatim throttle) and
  leave caching to the services.
- **Never log or return secrets.**
- Camera providers: return `Camera` objects with honest permissions, and
  implement `allowedMediaHosts()` so the image proxy only fetches from your
  provider's media hosts. Feed-based camera providers should also set
  `coverage` (the bounding boxes they have cameras in, so searches elsewhere
  never call them) and `idPrefix` (so image requests only load the provider
  that owns the id). Cache the camera list with `cachedList()`.

## 2. Add configuration

Add your environment variables to `src/lib/config.ts` (with safe defaults)
and document them in `.env.example`. A unit test fails if a key is missing
from `.env.example`.

## 3. Register it

Add the definition to `ALL_PROVIDERS` in `src/providers/registry.ts`. For
single-provider kinds (geocoding, weather, traffic, parking, routing, stops, AI) the first
enabled provider wins unless the user picks one (`TRAFFIC_PROVIDER`,
`AI_PROVIDER`, `GEOCODING_PROVIDER`, `ROUTING_PROVIDER`). Cameras and incidents merge every
enabled provider. Set `group` on providers that overlap (TomTom and HERE
incidents share the group `commercial-traffic`, so only one is used).

A live parking-occupancy provider should fill `ParkingFacility.occupancy`
with `observedAt`; the UI shows it only when present.

## 4. Test and document

- Add unit tests in `tests/unit/providers.test.ts` with a mocked `fetch`
  (see the existing tests). Cover the mapping and the error path.
- Add the source to [`docs/sources.md`](sources.md): operator, terms URL,
  attribution, limits, and whether embedding and AI analysis are allowed.
- Add any new UI strings to **every** file in `src/i18n/messages/`.

## Routing providers

A `RoutingProvider` returns a `Route`: the geometry as `[lat, lon]` pairs,
distance, duration, the major steps with their start offset, and optionally
`cumulativeDurationS` per geometry point (used to compute when the driver
reaches each point), `trafficSections` and `trafficDelayS`. Set
`trafficAware: true` only when the duration really includes live traffic;
the UI tells the user either way.
