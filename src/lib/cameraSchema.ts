import { z } from "zod";

/**
 * Schema for community-maintained camera files in `data/cameras/<country>/<city>.json`.
 * This module must not import other project modules: it is also loaded by
 * `scripts/validate-cameras.ts` under plain Node.js.
 */

export const permissionSchema = z.union([z.boolean(), z.literal("unknown")]);

const httpsUrl = z
  .url({
    protocol: /^https$/,
    hostname: z.regexes.domain,
    error: "must be an https:// URL with a domain name (no IP addresses or localhost)",
  })
  .describe("An https:// URL with a domain name (no IP addresses)");

const anyUrl = z.url({ protocol: /^https?$/, error: "must be an http(s):// URL" });

export function cameraEntrySchema(options: { allowInsecureUrls?: boolean } = {}) {
  const mediaUrl = options.allowInsecureUrls ? anyUrl : httpsUrl;
  return z
    .object({
      id: z
        .string()
        .regex(
          /^[a-z]{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/,
          "id must be lowercase kebab-case and start with the 2-letter country code, e.g. il-jerusalem-jaffa-st-01",
        )
        .max(80),
      name: z.string().trim().min(2).max(120),
      description: z.string().trim().max(500).optional(),
      country: z.string().regex(/^[a-z]{2}$/, "ISO 3166-1 alpha-2 code in lowercase"),
      city: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "city slug, e.g. tel-aviv"),
      location: z.object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      }),
      cameraType: z.enum(["traffic", "scenic", "public"]),
      mediaType: z.enum(["image", "video", "link"]),
      sourceUrl: options.allowInsecureUrls ? anyUrl : httpsUrl,
      mediaUrl: mediaUrl.optional(),
      operator: z.object({
        name: z.string().trim().min(2).max(120),
        url: anyUrl.optional(),
      }),
      license: z.object({
        name: z.string().trim().min(2).max(200),
        termsUrl: anyUrl,
        attribution: z.string().trim().max(300).optional(),
      }),
      permissions: z.object({
        embedAllowed: permissionSchema,
        aiAnalysisAllowed: permissionSchema,
        commercialUseAllowed: permissionSchema,
      }),
      refreshSeconds: z.number().int().min(10).max(86_400),
      verification: z.object({
        lastVerified: z.iso.date(),
        verifiedBy: z.string().trim().min(2).max(100),
      }),
      notes: z.string().trim().max(1000).optional(),
    })
    .strict()
    .superRefine((camera, ctx) => {
      if (camera.mediaType !== "link" && !camera.mediaUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["mediaUrl"],
          message: `mediaUrl is required when mediaType is "${camera.mediaType}"`,
        });
      }
      if (camera.mediaType === "link" && camera.mediaUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["mediaUrl"],
          message: 'mediaUrl must be omitted when mediaType is "link"',
        });
      }
      if (camera.permissions.aiAnalysisAllowed === true && camera.mediaType !== "image") {
        ctx.addIssue({
          code: "custom",
          path: ["permissions", "aiAnalysisAllowed"],
          message: 'AI analysis is only supported for cameras with mediaType "image"',
        });
      }
      if (!camera.id.startsWith(`${camera.country}-`)) {
        ctx.addIssue({
          code: "custom",
          path: ["id"],
          message: `id must start with the country code "${camera.country}-"`,
        });
      }
    });
}

export function cameraFileSchema(options: { allowInsecureUrls?: boolean } = {}) {
  return z
    .object({
      $schema: z.string().optional(),
      cameras: z.array(cameraEntrySchema(options)),
    })
    .strict();
}

export type CameraEntry = z.infer<ReturnType<typeof cameraEntrySchema>>;
export type CameraFile = z.infer<ReturnType<typeof cameraFileSchema>>;
