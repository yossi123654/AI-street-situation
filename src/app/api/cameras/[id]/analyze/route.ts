import { apiHandler, json, parseCameraId, parseLocale } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { services } from "@/services";

type CameraRouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** POST /api/cameras/:id/analyze?lang= → VisionAnalysis (only for cameras that allow AI analysis) */
export const POST = apiHandler<CameraRouteContext>(
  async (request, context) => {
    const id = parseCameraId((await context.params).id);
    const { cameras, vision } = services();
    const camera = await cameras.getById(id);
    if (!camera) throw notFound("camera not found");
    return json(
      await vision.analyze(camera, parseLocale(request.nextUrl.searchParams.get("lang"))),
    );
  },
  { cost: 5 },
);
