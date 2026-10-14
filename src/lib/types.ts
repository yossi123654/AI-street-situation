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
  label: string;
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
  mediaType: "image" | "video" | "link";
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
}

export type UnavailableReason = "not_configured" | "error" | "no_data";

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
}

export type ProviderKind =
  "geocoding" | "weather" | "traffic" | "incidents" | "cameras" | "parking" | "ai";

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
