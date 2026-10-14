import type { AppConfig } from "@/lib/config";
import type {
  Camera,
  Incident,
  LatLon,
  Locale,
  Place,
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
}

export interface TrafficProvider {
  /** Traffic flow on roads near the point. */
  flow(point: LatLon, radiusM: number): Promise<TrafficFlow[]>;
}

export interface IncidentsProvider {
  incidents(point: LatLon, radiusM: number, locale: Locale): Promise<Incident[]>;
}

export interface CameraProvider {
  /** All cameras known to this provider. Implementations may cache internally. */
  list(): Promise<Camera[]>;
  /**
   * Hostnames this provider's media URLs may point to. The image proxy only
   * fetches from these (in addition to the exact URL in the registry).
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
  /** True when the configuration needed by this provider is present. */
  isEnabled(config: AppConfig): boolean;
  create(config: AppConfig): ProviderKindMap[K];
}
