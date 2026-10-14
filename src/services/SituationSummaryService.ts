import { TtlCache } from "@/lib/cache";
import { notConfigured } from "@/lib/errors";
import { roundCoord } from "@/lib/geo";
import type { AiSummary, LatLon, Locale, SituationReport, VisionAnalysis } from "@/lib/types";
import { getProvider } from "@/providers/registry";
import { summarySystemPrompt } from "@/services/ai/prompts";
import type { CameraRegistry } from "@/services/CameraRegistry";
import type { SituationService } from "@/services/SituationService";
import type { VisionAnalyzer } from "@/services/VisionAnalyzer";

/** Max distance of a camera whose image may be analysed as part of a summary. */
const SUMMARY_CAMERA_RADIUS_M = 1500;

const ageMinutes = (iso: string | undefined) =>
  iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)) : null;

/** Compact, model-friendly facts. Keeps observed and external data apart. */
export function buildSummaryFacts(report: SituationReport, analyses: VisionAnalysis[]) {
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
  ) {}

  async summarize(point: LatLon, locale: Locale, label?: string): Promise<AiSummary> {
    const provider = getProvider("ai");
    if (!provider) throw notConfigured("no AI provider is configured");
    // Bucket by 5 minutes so repeated requests within a short window are free.
    const bucket = Math.floor(Date.now() / (5 * 60_000));
    const key = `${provider.def.id}:${locale}:${roundCoord(point.lat, 3)},${roundCoord(point.lon, 3)}:${bucket}`;
    return this.cache.getOrSet(key, 5 * 60_000, async () => {
      const report = await this.situation.report(point, locale, label);
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
      const facts = buildSummaryFacts(report, analyses);
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
