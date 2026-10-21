/**
 * Domain types shared by the server (providers, services, API routes) and the
 * browser (UI). Keep this file free of server-only imports.
 */

export type Locale = "he" | "en";

export interface LatLon {
  lat: number;
  lon: number;
}

/** A geocoded place. */
export interface Place extends LatLon {
  id: string;
  /** Short, readable label, e.g. "Jaffa Street, City Centre, Jerusalem". */
  label: string;
  /** The geocoder's full description, when it differs from the label. */
  fullLabel?: string;
  /** Free-form place kind reported by the geocoder (street, city, ...). */
  kind?: string;
  /** [south, west, north, east] */
  bbox?: [number, number, number, number];
  source: SourceInfo;
}

/** Where a piece of data came from and how old it is. */
export interface SourceInfo {
  providerId: string;
  name: string;
  /** Attribution text that must be shown next to the data. */
  attribution: string;
  url?: string;
  /** When our server fetched it (ISO 8601). */
  fetchedAt: string;
  /** When the upstream says the data was observed/valid (ISO 8601), if known. */
  observedAt?: string;
}

/** live: fresh enough to call "now"; recent: usable but not live; stale: too old to rely on. */
export type Freshness = "live" | "recent" | "stale" | "unknown";

export interface WeatherData {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  humidityPct: number | null;
  precipitationMm: number | null;
  /** WMO weather interpretation code. */
  weatherCode: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  cloudCoverPct: number | null;
  visibilityM: number | null;
  isDay: boolean | null;
  source: SourceInfo;
}

export type TrafficLevel = "free" | "moderate" | "heavy" | "severe" | "closed" | "unknown";

export interface TrafficFlow {
  roadName?: string;
  currentSpeedKmh: number | null;
  freeFlowSpeedKmh: number | null;
  /** 0 = free flowing, 1 = standstill. */
  congestion: number | null;
  level: TrafficLevel;
  /** 0..1 as reported by the provider, if any. */
  confidence?: number;
  source: SourceInfo;
}

export type IncidentType =
  | "accident"
  | "roadworks"
  | "closure"
  | "congestion"
  | "hazard"
  | "weather"
  | "event"
  | "breakdown"
  | "other";

export type IncidentSeverity = "minor" | "moderate" | "major" | "unknown";

export interface Incident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  roadName?: string;
  lat?: number;
  lon?: number;
  distanceM?: number;
  startTime?: string;
  endTime?: string;
  roadClosed?: boolean;
  source: SourceInfo;
}

export type ParkingKind =
  "surface" | "underground" | "multi-storey" | "street-side" | "rooftop" | "unknown";

export interface ParkingFacility {
  id: string;
  name?: string;
  lat: number;
  lon: number;
  distanceM: number;
  kind: ParkingKind;
  capacity: number | null;
  capacityDisabled: number | null;
  fee: "yes" | "no" | "unknown";
  access: "public" | "customers" | "unknown";
  /** Raw OSM opening_hours value, e.g. "Mo-Fr 07:00-22:00". */
  openingHours?: string;
  operator?: string;
  maxStay?: string;
  parkAndRide: boolean;
  /** Real-time occupancy. Only set by providers that publish live data. */
  occupancy?: { free: number | null; total: number | null; observedAt: string };
  source: SourceInfo;
}

// ── Trips ────────────────────────────────────────────────────────────────────

export type TravelMode = "car";

export type RouteTrafficCategory = "jam" | "roadworks" | "closure" | "other";

/** A stretch of the route with degraded traffic, as reported by a traffic-aware router. */
export interface RouteTrafficSection {
  /** Indexes into Route.geometry. */
  startIndex: number;
  endIndex: number;
  category: RouteTrafficCategory;
  severity: IncidentSeverity;
  effectiveSpeedKmh: number | null;
  delayS: number;
  /** Distance from the start of the route to the start of the section. */
  distanceAlongM: number;
  lengthM: number;
}

export interface RouteStep {
  /** Road name and/or number, e.g. "כביש 1". */
  name: string;
  /** Distance from the start of the route to the start of this step. */
  distanceAlongM: number;
  distanceM: number;
  durationS: number;
}

export interface Route {
  /** [lat, lon] pairs. */
  geometry: Array<[number, number]>;
  distanceM: number;
  /** Expected travel time. Includes traffic when `trafficAware` is true. */
  durationS: number;
  trafficAware: boolean;
  /** "live" for departures now, "predicted" (historic patterns) for later departures. */
  trafficKind?: "live" | "predicted";
  /** Travel time without traffic, when the router reports it. */
  noTrafficDurationS?: number;
  trafficDelayS?: number;
  /** Cumulative travel time at each geometry point (seconds), when available. */
  cumulativeDurationS?: number[];
  /** Major roads used, in order, de-duplicated. */
  roads: string[];
  steps: RouteStep[];
  trafficSections?: RouteTrafficSection[];
  source: SourceInfo;
}

/** Weather at a point of the route, for the time the traveller is expected there. */
export interface RoutePointWeather {
  lat: number;
  lon: number;
  distanceAlongM: number;
  /** Seconds after departure when the traveller passes this point. */
  etaOffsetS: number;
  /** Time the forecast is for (ISO). */
  forecastFor: string;
  /** "current" for points reached within ~30 min, else "forecast". */
  kind: "current" | "forecast";
  temperatureC: number | null;
  weatherCode: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  visibilityM: number | null;
  isDay: boolean | null;
  /** Nearest road name from the route steps, if known. */
  roadName?: string;
}

/** Traffic flow sampled at a point along the route (when the router is not traffic-aware). */
export interface RouteTrafficSample {
  lat: number;
  lon: number;
  distanceAlongM: number;
  roadName?: string;
  flow: TrafficFlow;
}

export type TripStopKind = "fuel" | "rest_area" | "services" | "charging";

export type TripFacility =
  "toilets" | "shop" | "cafe" | "restaurant" | "car_wash" | "compressed_air" | "charging";

export interface TripStop {
  id: string;
  kind: TripStopKind;
  name?: string;
  brand?: string;
  lat: number;
  lon: number;
  /** Distance from the start of the route to the nearest route point. */
  distanceAlongM: number;
  /** Straight-line distance from the route. */
  detourM: number;
  openingHours?: string;
  /** Extra facilities from OSM tags. */
  facilities: TripFacility[];
}

/** A camera near the route; `distanceM` is its distance from the route line. */
export interface TripCamera extends CameraView {
  distanceAlongM: number;
  /** Seconds after departure at which the traveller passes the camera. */
  etaOffsetS: number;
  roadName?: string;
}

export interface TripReport {
  from: LatLon & { label?: string };
  to: LatLon & { label?: string };
  mode: TravelMode;
  generatedAt: string;
  departureTime: string;
  /** False when the user chose a later departure time. */
  departureIsNow: boolean;
  route: Section<Route>;
  weatherAlong: Section<RoutePointWeather[]>;
  /** Either the router's own traffic sections or sampled flow; `null` data when neither applies. */
  trafficAlong: Section<{ sections: RouteTrafficSection[]; samples: RouteTrafficSample[] }>;
  incidents: Section<Incident[]>;
  stops: Section<TripStop[]>;
  destinationParking: Section<ParkingFacility[]>;
  /** Cameras close to the route, in the order the traveller passes them. */
  cameras: Section<TripCamera[]>;
  missing: TripMissingCode[];
  confidence: Confidence;
}

export type TripMissingCode = "route" | "weather" | "traffic" | "incidents" | "stops" | "parking";

export type Permission = true | false | "unknown";

export interface Camera {
  id: string;
  name: string;
  description?: string;
  country: string;
  city: string;
  lat: number;
  lon: number;
  cameraType: "traffic" | "scenic" | "public";
  /** "youtube": a live stream played in YouTube's embedded player. */
  mediaType: "image" | "video" | "youtube" | "link";
  /** Human-facing page of the operator for this camera. */
  sourceUrl: string;
  /** Direct media URL (image or video). Only ever fetched by the server from the registry. */
  mediaUrl?: string;
  operator: { name: string; url?: string };
  license: { name: string; termsUrl: string; attribution?: string };
  permissions: {
    embedAllowed: Permission;
    aiAnalysisAllowed: Permission;
    commercialUseAllowed: Permission;
  };
  refreshSeconds: number;
  verification: { lastVerified: string; verifiedBy: string };
  /** Which camera provider supplied this record. */
  providerId: string;
  /** Provider-reported availability, if known. */
  available?: boolean;
}

/** A camera as presented to the browser. Never includes mediaUrl for non-embeddable cameras. */
export interface CameraView extends Omit<Camera, "mediaUrl"> {
  distanceM: number;
  /** "embed": we may show the media inline; "link": external link only. */
  display: "embed" | "link";
  /** Whether AI analysis is permitted for this camera. */
  analyzable: boolean;
  /** Direct video URL (only for embeddable video cameras). */
  videoUrl?: string;
  /** YouTube player URL (youtube-nocookie.com), only for embeddable YouTube cameras. */
  embedUrl?: string;
}

/** not_live: the data only exists for "now" (e.g. live traffic) and the user asked about later. */
export type UnavailableReason = "not_configured" | "error" | "no_data" | "not_live";

export type Section<T> =
  | { status: "ok"; data: T; freshness: Freshness; sources: SourceInfo[] }
  | { status: "unavailable"; reason: UnavailableReason; message?: string };

export interface SituationReport {
  location: LatLon & { label?: string };
  generatedAt: string;
  weather: Section<WeatherData>;
  traffic: Section<TrafficFlow[]>;
  incidents: Section<Incident[]>;
  cameras: Section<CameraView[]>;
  /** Codes of data categories that are missing or stale. */
  missing: MissingCode[];
  confidence: Confidence;
}

export type MissingCode =
  | "weather"
  | "traffic"
  | "incidents"
  | "cameras"
  | "weather_stale"
  | "traffic_stale"
  | "incidents_stale";

export type Confidence = "high" | "medium" | "low";

export type VisionTrafficLevel = "none" | "light" | "moderate" | "heavy" | "standstill" | "unknown";

export interface VisionAnalysis {
  cameraId: string;
  cameraName: string;
  traffic: { level: VisionTrafficLevel; description: string };
  weather: string;
  visibility: "good" | "moderate" | "poor" | "unknown";
  notes: string;
  uncertainty: "low" | "medium" | "high";
  /** When the analysed image was captured, if known. */
  imageTime?: string;
  imageFreshness: Freshness;
  analyzedAt: string;
  provider: { id: string; name: string; model: string };
}

export interface AiSummary {
  text: string;
  provider: { id: string; name: string; model: string };
  generatedAt: string;
  /** Cameras whose images were analysed as part of the summary. */
  cameraAnalyses: VisionAnalysis[];
}

export interface ProviderStatus {
  id: string;
  kind: ProviderKind;
  name: string;
  enabled: boolean;
  active: boolean;
  requiredEnv: string[];
  homepage: string;
  attribution: string;
}

/**
 * A published photo of a place: street-level imagery (Panoramax) or a
 * geotagged photo (Wikimedia Commons). Not live: `capturedAt` says when it
 * was taken. Image bytes are served through /api/photos/:id/image only.
 */
export interface StreetPhoto {
  /** "<provider>-<source id>", e.g. "panoramax-93a6d34d-...". */
  id: string;
  providerId: string;
  /** street: street-level imagery; photo: a photo of the place or a landmark. */
  kind: "street" | "photo";
  lat: number;
  lon: number;
  distanceM: number;
  capturedAt?: string;
  /** Direction the camera faced, degrees from north. */
  headingDeg?: number;
  /** True for 360° panoramas (the thumbnail is the flattened panorama). */
  panorama?: boolean;
  title?: string;
  author?: string;
  license: { name: string; url?: string };
  /** The photo's page at the source, for credit and the full-size view. */
  pageUrl: string;
}

export type ProviderKind =
  | "geocoding"
  | "weather"
  | "traffic"
  | "incidents"
  | "cameras"
  | "parking"
  | "routing"
  | "stops"
  | "photos"
  | "ai";

export interface MapConfig {
  /** Vector style (MapLibre) when set; the raster tiles are the fallback. */
  vector: { styleUrl: string; attribution: string } | null;
  tileUrl: string;
  attribution: string;
  maxZoom: number;
  defaultCenter: [number, number];
  defaultZoom: number;
}

export interface ApiError {
  error: { code: string; message: string };
}
