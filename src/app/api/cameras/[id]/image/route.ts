import { apiHandler, parseCameraId } from "@/lib/api";
import { forbidden, notFound } from "@/lib/errors";
import { services } from "@/services";

type CameraRouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * GET /api/cameras/:id/image → the camera's current still image.
 * Only for cameras whose terms explicitly allow embedding. The server fetches
 * the URL stored in the registry; clients can never supply a URL (no SSRF).
 */
export const GET = apiHandler<CameraRouteContext>(async (_request, context) => {
  const id = parseCameraId((await context.params).id);
  const { cameras, images } = services();
  const camera = await cameras.getById(id);
  if (!camera) throw notFound("camera not found");
  if (camera.permissions.embedAllowed !== true) throw forbidden("this camera may not be embedded");
  const image = await images.getImage(camera);
  const maxAge = Math.min(camera.refreshSeconds, 300);
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": `private, max-age=${maxAge}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
      ...(image.imageTime ? { "X-Image-Time": image.imageTime } : {}),
      "X-Fetched-At": image.fetchedAt,
    },
  });
});
