import type { AppConfig } from "@/lib/config";
import type {
  Camera,
  Incident,
  LatLon,
  Locale,
  ParkingFacility,
  Place,
  Route,
  TravelMode,
  TripStop,
  ProviderKind,
  TrafficFlow,
  WeatherData,
} from "@/lib/types";

/**
 * Provider interfaces. Each provider is a small adapter around one upstream
 * service and returns normalised domain objects. Providers do not cache;
 * caching happens in services.
 */

export interface GeocodingProvider {
  search(query: string, locale: Locale): Promise<Place[]>;
  reverse(point: LatLon, locale: Locale): Promise<Place | null>;
}

export interface WeatherProvider {
  current(point: LatLon): Promise<WeatherData>;
  /**
   * Weather at several points, each for a given time (now or a few hours
   * ahead). Optional: providers without forecasts can omit it.
   */
  forecastAt?(points: Array<LatLon & { at: Date }>): Promise<PointForecast[]>;
}

export interface PointForecast {
  temperatureC: number | null;
  weatherCode: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  visibilityM: number | null;
  isDay: boolean | null;
  /** The time the values are valid for (ISO). */
  validAt: string;
  kind: "current" | "forecast";
}

export interface StopsProvider {
  /** Fuel stations, rest areas and similar within `radiusM` of the polyline ([lat, lon] pairs). */
  stopsAlong(line: Array<[number, number]>, radiusM: number): Promise<TripStop[]>;
}

export interface RouteOptions {
  /** Leave at this time instead of now. Routers with traffic models use it to predict traffic. */
  departAt?: Date;
}

export interface RoutingProvider {
  route(
    from: LatLon,
    to: LatLon,
    mode: TravelMode,
    locale: Locale,
    options?: RouteOptions,
  ): Promise<Route>;
}

export interface TrafficProvider {
  /** Traffic flow on roads near the point. */
  flow(point: LatLon, radiusM: number): Promise<TrafficFlow[]>;
}

export interface IncidentsProvider {
  incidents(point: LatLon, radiusM: number, locale: Locale): Promise<Incident[]>;
}

export interface ParkingProvider {
  /** Parking facilities within `radiusM` of the point, with distanceM set. */
  parking(point: LatLon, radiusM: number): Promise<ParkingFacility[]>;
}

export interface CameraProvider {
  /** All cameras known to this provider. Implementations may cache internally. */
  list(): Promise<Camera[]>;
  /**
   * Areas this provider has cameras in, as [south, west, north, east] boxes.
   * The registry only asks providers whose coverage overlaps the search area,
   * so a search in Jerusalem never calls Singapore's API. Omit for providers
   * that can have cameras anywhere (the community registry).
   */
  coverage?: Array<[number, number, number, number]>;
  /** Prefix of every camera id from this provider, used to route id lookups. */
  idPrefix?: string;
  /**
   * Where this provider's media may be served from: hostnames, or
   * "host/path/prefix" entries for shared hosts such as S3. The image proxy
   * refuses anything else.
   */
  allowedMediaHosts?(): string[];
}

export interface AiImageInput {
  data: Buffer;
  mimeType: string;
}

export interface AiProvider {
  readonly model: string;
  /** Returns the raw model text. */
  complete(input: {
    system: string;
    prompt: string;
    image?: AiImageInput;
    json?: boolean;
  }): Promise<string>;
}

export interface ProviderKindMap {
  geocoding: GeocodingProvider;
  weather: WeatherProvider;
  traffic: TrafficProvider;
  incidents: IncidentsProvider;
  cameras: CameraProvider;
  parking: ParkingProvider;
  routing: RoutingProvider;
  stops: StopsProvider;
  ai: AiProvider;
}

export interface ProviderDefinition<K extends ProviderKind = ProviderKind> {
  /** Stable identifier, e.g. "tomtom". Unique per kind. */
  id: string;
  kind: K;
  name: string;
  homepage: string;
  /** Attribution text shown next to data from this provider. */
  attribution: string;
  /** Environment variables this provider needs (documentation + status page). */
  requiredEnv: string[];
  /**
   * For kinds that merge several providers (cameras, incidents): only the
   * first enabled provider of the same group is used, e.g. TomTom *or* HERE.
   */
  group?: string;
  /** True when the configuration needed by this provider is present. */
  isEnabled(config: AppConfig): boolean;
  create(config: AppConfig): ProviderKindMap[K];
}
