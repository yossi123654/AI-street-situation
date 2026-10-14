import { z } from "zod";
import { TtlCache } from "@/lib/cache";
import { forbidden, notConfigured } from "@/lib/errors";
import { cameraImageFreshness } from "@/lib/freshness";
import type { Camera, Locale, VisionAnalysis } from "@/lib/types";
import { getProvider } from "@/providers/registry";
import { visionSystemPrompt, visionUserPrompt } from "@/services/ai/prompts";
import type { CameraImageService } from "@/services/CameraImageService";

const analysisSchema = z.object({
  traffic: z
    .object({
      level: z
        .enum(["none", "light", "moderate", "heavy", "standstill", "unknown"])
        .catch("unknown"),
      description: z.string().catch(""),
    })
    .catch({ level: "unknown", description: "" }),
  weather: z.string().catch(""),
  visibility: z.enum(["good", "moderate", "poor", "unknown"]).catch("unknown"),
  notes: z.string().catch(""),
  uncertainty: z.enum(["low", "medium", "high"]).catch("high"),
});

/** Extracts and validates the JSON object in a model response. */
export function parseVisionResponse(raw: string): z.infer<typeof analysisSchema> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return analysisSchema.parse(JSON.parse(raw.slice(start, end + 1)));
    } catch {
      // fall through
    }
  }
  return {
    traffic: { level: "unknown", description: "" },
    weather: "",
    visibility: "unknown",
    notes: raw.trim().slice(0, 300),
    uncertainty: "high",
  };
}

/**
 * Describes a camera image with the configured AI provider. Only cameras whose
 * terms allow AI analysis are analysed. Results are cached per camera, image
 * content hash and language, so the same image is never analysed twice.
 */
export class VisionAnalyzer {
  private readonly cache = new TtlCache<VisionAnalysis>(500);

  constructor(private readonly images: CameraImageService) {}

  isConfigured(): boolean {
    return Boolean(getProvider("ai"));
  }

  async analyze(camera: Camera, locale: Locale): Promise<VisionAnalysis> {
    const provider = getProvider("ai");
    if (!provider) throw notConfigured("no AI provider is configured");
    if (camera.permissions.aiAnalysisAllowed !== true || camera.mediaType !== "image") {
      throw forbidden("this camera's terms do not allow AI analysis");
    }
    const image = await this.images.getImage(camera);
    const key = `${provider.def.id}:${provider.instance.model}:${camera.id}:${image.hash}:${locale}`;
    return this.cache.getOrSet(key, 60 * 60 * 1000, async () => {
      const imageAgeMinutes = image.imageTime
        ? (Date.now() - Date.parse(image.imageTime)) / 60_000
        : undefined;
      const raw = await provider.instance.complete({
        system: visionSystemPrompt(locale),
        prompt: visionUserPrompt({
          cameraName: camera.name,
          ...(imageAgeMinutes !== undefined ? { imageAgeMinutes } : {}),
        }),
        image: { data: image.data, mimeType: image.mimeType },
        json: true,
      });
      const parsed = parseVisionResponse(raw);
      const imageFreshness = cameraImageFreshness(image.imageTime, camera.refreshSeconds);
      return {
        cameraId: camera.id,
        cameraName: camera.name,
        ...parsed,
        // An old or undated image can never yield a confident "current" reading.
        uncertainty: imageFreshness === "stale" ? "high" : parsed.uncertainty,
        ...(image.imageTime ? { imageTime: image.imageTime } : {}),
        imageFreshness,
        analyzedAt: new Date().toISOString(),
        provider: { id: provider.def.id, name: provider.def.name, model: provider.instance.model },
      };
    });
  }
}
