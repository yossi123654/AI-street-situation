import { buildUrl, upstreamJson } from "@/lib/http";
import type { ProviderDefinition } from "@/providers/types";

interface MessagesResponse {
  content?: Array<{ type: string; text?: string }>;
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Anthropic Messages API (bring your own key). */
export const anthropic: ProviderDefinition<"ai"> = {
  id: "anthropic",
  kind: "ai",
  name: "Anthropic Claude",
  homepage: "https://docs.anthropic.com/",
  attribution: "AI analysis by Anthropic Claude",
  requiredEnv: ["ANTHROPIC_API_KEY"],
  isEnabled: (config) => Boolean(config.ANTHROPIC_API_KEY),
  create(config) {
    return {
      model: config.ANTHROPIC_MODEL,
      async complete({ system, prompt, image }) {
        if (image && !SUPPORTED_IMAGE_TYPES.has(image.mimeType)) {
          throw new Error(`unsupported image type for Anthropic: ${image.mimeType}`);
        }
        const content = [
          ...(image
            ? [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: image.mimeType,
                    data: image.data.toString("base64"),
                  },
                },
              ]
            : []),
          { type: "text", text: prompt },
        ];
        const data = await upstreamJson<MessagesResponse>(
          buildUrl(config.ANTHROPIC_URL, "v1/messages"),
          {
            method: "POST",
            providerId: anthropic.id,
            timeoutMs: config.AI_TIMEOUT_MS,
            headers: {
              "Content-Type": "application/json",
              "x-api-key": config.ANTHROPIC_API_KEY!,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: config.ANTHROPIC_MODEL,
              max_tokens: 1024,
              temperature: 0.2,
              system,
              messages: [{ role: "user", content }],
            }),
          },
        );
        return (data.content ?? [])
          .filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("");
      },
    };
  },
};
