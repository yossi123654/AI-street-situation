import { buildUrl, upstreamJson } from "@/lib/http";
import type { ProviderDefinition } from "@/providers/types";

interface OllamaChatResponse {
  message?: { content?: string };
}

/** Local open-weight models via Ollama (https://ollama.com). */
export const ollama: ProviderDefinition<"ai"> = {
  id: "ollama",
  kind: "ai",
  name: "Ollama (local model)",
  homepage: "https://ollama.com/",
  attribution: "AI analysis by a local open-weight model (Ollama)",
  requiredEnv: ["OLLAMA_URL"],
  isEnabled: (config) => Boolean(config.OLLAMA_URL),
  create(config) {
    const base = config.OLLAMA_URL!;
    return {
      model: config.OLLAMA_MODEL,
      async complete({ system, prompt, image, json }) {
        const data = await upstreamJson<OllamaChatResponse>(buildUrl(base, "api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          providerId: ollama.id,
          timeoutMs: config.AI_TIMEOUT_MS,
          body: JSON.stringify({
            model: config.OLLAMA_MODEL,
            stream: false,
            ...(json ? { format: "json" } : {}),
            options: { temperature: 0.2 },
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: prompt,
                ...(image ? { images: [image.data.toString("base64")] } : {}),
              },
            ],
          }),
        });
        return data.message?.content ?? "";
      },
    };
  },
};
