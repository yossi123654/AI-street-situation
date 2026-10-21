import { apiHandler, parsePhotoId } from "@/lib/api";
import { services } from "@/services";

type PhotoRouteContext = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

/**
 * GET /api/photos/:id/image?size=thumb|large → the photo's image.
 * Only photos the server itself returned from /api/photos can be opened, and
 * the server fetches the URL the provider gave it; clients never supply a URL.
 */
export const GET = apiHandler<PhotoRouteContext>(
  async (request, context) => {
    const id = parsePhotoId((await context.params).id);
    const size = request.nextUrl.searchParams.get("size") === "large" ? "large" : "thumb";
    const image = await services().photos.getImage(id, size);
    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mimeType,
        // Published photos do not change.
        "Cache-Control": "private, max-age=86400",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
  { bucket: "media" },
);
