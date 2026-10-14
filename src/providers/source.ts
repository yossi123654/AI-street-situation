import type { SourceInfo } from "@/lib/types";
import type { ProviderDefinition } from "@/providers/types";

export function sourceFrom(
  definition: Pick<ProviderDefinition, "id" | "name" | "attribution" | "homepage">,
  observedAt?: string,
): SourceInfo {
  return {
    providerId: definition.id,
    name: definition.name,
    attribution: definition.attribution,
    url: definition.homepage,
    fetchedAt: new Date().toISOString(),
    ...(observedAt ? { observedAt } : {}),
  };
}
