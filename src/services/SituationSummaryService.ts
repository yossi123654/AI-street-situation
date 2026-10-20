import { TtlCache } from "@/lib/cache";
import { notConfigured } from "@/lib/errors";
import { roundCoord } from "@/lib/geo";
import { getConfig } from "@/lib/config";
import type {
  AiSummary,
  LatLon,
  Locale,
  ParkingFacility,
  Section,
  SituationReport,
  TripReport,
  VisionAnalysis,
} from "@/lib/types";
import { getProvider } from "@/providers/registry";
import { summarySystemPrompt, tripSummarySystemPrompt } from "@/services/ai/prompts";
import type { CameraRegistry } from "@/services/CameraRegistry";
import type { LocationService } from "@/services/LocationService";
import type { ParkingService } from "@/services/ParkingService";
import type { TripService } from "@/services/TripService";
import type { SituationService } from "@/services/SituationService";
import type { VisionAnalyzer } from "@/services/VisionAnalyzer";

/** Max distance of a camera whose image may be analysed as part of a summary. */
const SUMMARY_CAMERA_RADIUS_M = 1500;

const ageMinutes = (iso: string | undefined) =>
  iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)) : null;

/** Compact, model-friendly facts. Keeps observed and external data apart. */
export function buildSummaryFacts(
  report: SituationReport,
  analyses: VisionAnalysis[],
  parking?: { section: Section<ParkingFacility[]>; radiusM: number },
) {
  const w = report.weather;
  const t = report.traffic;
  const i = report.incidents;
  return {
    location: report.location.label ?? `${report.location.lat}, ${report.location.lon}`,
    externalData: {
      weather:
        w.status === "ok"
          ? {
              freshness: w.freshness,
              ageMinutes: ageMinutes(w.data.source.observedAt),
              temperatureC: w.data.temperatureC,
              apparentTemperatureC: w.data.apparentTemperatureC,
              wmoWeatherCode: w.data.weatherCode,
              precipitationMm: w.data.precipitationMm,
              windSpeedKmh: w.data.windSpeedKmh,
              visibilityM: w.data.visibilityM,
              source: w.data.source.name,
            }
          : { missing: w.reason },
      trafficFlow:
        t.status === "ok"
          ? {
              freshness: t.freshness,
              roads: t.data.map((f) => ({
                road: f.roadName ?? null,
                level: f.level,
                currentSpeedKmh: f.currentSpeedKmh,
                freeFlowSpeedKmh: f.freeFlowSpeedKmh,
              })),
              source: t.data[0]?.source.name,
            }
          : { missing: t.reason },
      incidents:
        i.status === "ok"
          ? {
              freshness: i.freshness,
              count: i.data.length,
              items: i.data.slice(0, 8).map((x) => ({
                type: x.type,
                severity: x.severity,
                description: x.description,
                road: x.roadName ?? null,
                distanceM: x.distanceM ?? null,
                roadClosed: x.roadClosed ?? false,
              })),
              source: i.sources[0]?.name,
            }
          : { missing: i.reason },
      parking:
        !parking || parking.section.status !== "ok"
          ? {
              missing:
                parking?.section.status === "unavailable"
                  ? parking.section.reason
                  : "not_requested",
            }
          : {
              searchRadiusM: parking.radiusM,
              facilitiesFound: parking.section.data.length,
              publicFacilities: parking.section.data.filter((p) => p.access === "public").length,
              freeOfCharge: parking.section.data.filter((p) => p.fee === "no").length,
              nearestDistanceM: parking.section.data[0]?.distanceM ?? null,
              liveOccupancy:
                "not available: locations come from OpenStreetMap, which has no live occupancy data",
              source: parking.section.sources[0]?.name,
            },
    },
    observedInCameraImages:
      analyses.length > 0
        ? analyses.map((a) => ({
            camera: a.cameraName,
            imageFreshness: a.imageFreshness,
            imageAgeMinutes: ageMinutes(a.imageTime),
            traffic: a.traffic,
            weather: a.weather,
            visibility: a.visibility,
            uncertainty: a.uncertainty,
          }))
        : { missing: "no camera image that may be analysed is available nearby" },
    missingOrStale: report.missing,
  };
}

/** Compact facts for the trip briefing. */
export function buildTripFacts(report: TripReport) {
  const r = report.route;
  const route =
    r.status === "ok"
      ? {
          distanceKm: Math.round(r.data.distanceM / 100) / 10,
          travelTimeMinutes: Math.round(r.data.durationS / 60),
          includesLiveTraffic: r.data.trafficAware,
          ...(r.data.noTrafficDurationS !== undefined
            ? { travelTimeWithoutTrafficMinutes: Math.round(r.data.noTrafficDurationS / 60) }
            : {}),
          ...(r.data.trafficDelayS !== undefined
            ? { trafficDelayMinutes: Math.round(r.data.trafficDelayS / 60) }
            : {}),
          mainRoads: r.data.roads.slice(0, 6),
          source: r.data.source.name,
        }
      : { missing: r.reason };
  const t = report.trafficAlong;
  const w = report.weatherAlong;
  const i = report.incidents;
  const s = report.stops;
  const p = report.destinationParking;
  return {
    from: report.from.label ?? `${report.from.lat}, ${report.from.lon}`,
    to: report.to.label ?? `${report.to.lat}, ${report.to.lon}`,
    departure: report.departureTime,
    route,
    trafficOnTheWay:
      t.status === "ok"
        ? {
            freshness: t.freshness,
            slowSections: t.data.sections.map((x) => ({
              atKm: Math.round(x.distanceAlongM / 1000),
              lengthKm: Math.round(x.lengthM / 100) / 10,
              category: x.category,
              severity: x.severity,
              delayMinutes: Math.round(x.delayS / 60),
              effectiveSpeedKmh: x.effectiveSpeedKmh,
            })),
            sampledFlow: t.data.samples.map((x) => ({
              atKm: Math.round(x.distanceAlongM / 1000),
              road: x.roadName ?? null,
              level: x.flow.level,
              currentSpeedKmh: x.flow.currentSpeedKmh,
              freeFlowSpeedKmh: x.flow.freeFlowSpeedKmh,
            })),
          }
        : { missing: t.reason },
    incidentsOnTheWay:
      i.status === "ok"
        ? {
            count: i.data.length,
            items: i.data.slice(0, 8).map((x) => ({
              atKm: Math.round((x.distanceM ?? 0) / 1000),
              type: x.type,
              severity: x.severity,
              description: x.description,
              road: x.roadName ?? null,
              roadClosed: x.roadClosed ?? false,
            })),
          }
        : { missing: i.reason },
    weatherAlongTheWay:
      w.status === "ok"
        ? w.data.map((x) => ({
            atKm: Math.round(x.distanceAlongM / 1000),
            road: x.roadName ?? null,
            minutesAfterDeparture: Math.round(x.etaOffsetS / 60),
            valuesAre: x.kind,
            temperatureC: x.temperatureC,
            wmoWeatherCode: x.weatherCode,
            precipitationMm: x.precipitationMm,
            windSpeedKmh: x.windSpeedKmh,
            visibilityM: x.visibilityM,
          }))
        : { missing: w.reason },
    placesToStop:
      s.status === "ok"
        ? {
            count: s.data.length,
            examples: s.data
              .filter((x) => x.kind !== "charging")
              .filter((_, idx, arr) => idx % Math.max(1, Math.floor(arr.length / 5)) === 0)
              .slice(0, 5)
              .map((x) => ({
                atKm: Math.round(x.distanceAlongM / 1000),
                kind: x.kind,
                name: x.name ?? x.brand ?? null,
                facilities: x.facilities,
              })),
          }
        : { missing: s.reason },
    parkingAtDestination:
      p.status === "ok"
        ? {
            facilitiesFound: p.data.length,
            freeOfCharge: p.data.filter((x) => x.fee === "no").length,
            nearestDistanceM: p.data[0]?.distanceM ?? null,
            liveOccupancy: "not available",
          }
        : { missing: p.reason },
    missing: report.missing,
  };
}

/**
 * Produces the AI-written summary of a situation report. It may analyse the
 * nearest camera image whose terms allow AI analysis.
 */
export class SituationSummaryService {
  private readonly cache = new TtlCache<AiSummary>(500);

  constructor(
    private readonly situation: SituationService,
    private readonly cameras: CameraRegistry,
    private readonly vision: VisionAnalyzer,
    private readonly parking?: ParkingService,
    private readonly trip?: TripService,
    private readonly location?: LocationService,
  ) {}

  /**
   * Name of a point for the AI prompt. Summaries are cached and shared by
   * location, so the name must not come from the request (a `label` in the URL
   * is user input and would let one user inject text into what others see).
   * The geocoder's reverse lookup is cached for a day.
   */
  private async trustedLabel(point: LatLon, locale: Locale): Promise<string | undefined> {
    if (!this.location) return undefined;
    try {
      return (await this.location.reverse(point, locale))?.label;
    } catch {
      return undefined;
    }
  }

  async summarizeTrip(
    from: LatLon & { label?: string },
    to: LatLon & { label?: string },
    locale: Locale,
  ): Promise<AiSummary> {
    const provider = getProvider("ai");
    if (!provider) throw notConfigured("no AI provider is configured");
    if (!this.trip) throw notConfigured("trip planning is not available");
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    const key = `trip:${provider.def.id}:${locale}:${roundCoord(from.lat, 3)},${roundCoord(from.lon, 3)}:${roundCoord(to.lat, 3)},${roundCoord(to.lon, 3)}:${bucket}`;
    return this.cache.getOrSet(key, 5 * 60_000, async () => {
      const [fromLabel, toLabel] = await Promise.all([
        this.trustedLabel(from, locale),
        this.trustedLabel(to, locale),
      ]);
      const report = await this.trip!.plan(
        { lat: from.lat, lon: from.lon, ...(fromLabel ? { label: fromLabel } : {}) },
        { lat: to.lat, lon: to.lon, ...(toLabel ? { label: toLabel } : {}) },
        locale,
      );
      const facts = buildTripFacts(report);
      const text = await provider.instance.complete({
        system: tripSummarySystemPrompt(locale),
        prompt: `Facts (JSON):\n${JSON.stringify(facts, null, 2)}\n\nWrite the trip briefing.`,
      });
      return {
        text: text.trim(),
        provider: { id: provider.def.id, name: provider.def.name, model: provider.instance.model },
        generatedAt: new Date().toISOString(),
        cameraAnalyses: [],
      };
    });
  }

  async summarize(point: LatLon, locale: Locale): Promise<AiSummary> {
    const provider = getProvider("ai");
    if (!provider) throw notConfigured("no AI provider is configured");
    // Bucket by 5 minutes so repeated requests within a short window are free.
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    const key = `${provider.def.id}:${locale}:${roundCoord(point.lat, 3)},${roundCoord(point.lon, 3)}:${bucket}`;
    return this.cache.getOrSet(key, 5 * 60_000, async () => {
      const radiusM = getConfig().PARKING_SEARCH_RADIUS_M;
      const label = await this.trustedLabel(point, locale);
      const [report, parkingSection] = await Promise.all([
        this.situation.report(point, locale, label),
        this.parking?.find(point, radiusM),
      ]);
      const analyses: VisionAnalysis[] = [];
      if (report.cameras.status === "ok") {
        const candidate = report.cameras.data.find(
          (c) => c.analyzable && c.distanceM <= SUMMARY_CAMERA_RADIUS_M,
        );
        const camera = candidate ? await this.cameras.getById(candidate.id) : undefined;
        if (camera) {
          try {
            analyses.push(await this.vision.analyze(camera, locale));
          } catch (error) {
            console.warn(`[summary] camera analysis failed for ${camera.id}:`, error);
          }
        }
      }
      const facts = buildSummaryFacts(
        report,
        analyses,
        parkingSection ? { section: parkingSection, radiusM } : undefined,
      );
      const text = await provider.instance.complete({
        system: summarySystemPrompt(locale),
        prompt: `Facts (JSON):\n${JSON.stringify(facts, null, 2)}\n\nWrite the summary.`,
      });
      return {
        text: text.trim(),
        provider: { id: provider.def.id, name: provider.def.name, model: provider.instance.model },
        generatedAt: new Date().toISOString(),
        cameraAnalyses: analyses,
      };
    });
  }
}
