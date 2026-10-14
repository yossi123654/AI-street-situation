import { apiHandler, json, parseCameraId } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { services } from "@/services";

type CameraRouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/** GET /api/cameras/:id/status → CameraStatus */
export const GET = apiHandler<CameraRouteContext>(async (_request, context) => {
  const id = parseCameraId((await context.params).id);
  const { cameras, availability } = services();
  const camera = await cameras.getById(id);
  if (!camera) throw notFound("camera not found");
  return json(await availability.status(camera));
});
