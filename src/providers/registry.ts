import { getConfig, type AppConfig } from "@/lib/config";
import type { ProviderKind, ProviderStatus } from "@/lib/types";
import { digitrafficCameras } from "@/providers/cameras/digitraffic";
import { hongKongCameras } from "@/providers/cameras/hongKong";
import { singaporeCameras } from "@/providers/cameras/singapore";
import { staticJsonCameras } from "@/providers/cameras/staticJson";
import { tflJamCams } from "@/providers/cameras/tflJamCam";
import { google } from "@/providers/geocoding/google";
import { nominatim } from "@/providers/geocoding/nominatim";
import { photon } from "@/providers/geocoding/photon";
import { hereIncidents } from "@/providers/incidents/here";
import { tomtomIncidents } from "@/providers/incidents/tomtom";
import { wzdxIncidents } from "@/providers/incidents/wzdx";
import { overpassParking } from "@/providers/parking/overpass";
import { osrm } from "@/providers/routing/osrm";
import { tomtomRouting } from "@/providers/routing/tomtom";
import { overpassStops } from "@/providers/stops/overpass";
import { hereTraffic } from "@/providers/traffic/here";
import { tomtomTraffic } from "@/providers/traffic/tomtom";
import type { ProviderDefinition, ProviderKindMap } from "@/providers/types";
import { anthropic } from "@/providers/vision/anthropic";
import { ollama } from "@/providers/vision/ollama";
import { openMeteo } from "@/providers/weather/openMeteo";

/**
 * Every provider the app knows about. To add a provider, implement a
 * ProviderDefinition and list it here (see docs/adding-a-provider.md).
 * Order matters: for single-provider kinds the first enabled one wins
 * unless the user picks one explicitly via configuration. Cameras and
 * incidents merge every enabled provider (one per `group`).
 */
export const ALL_PROVIDERS: ProviderDefinition[] = [
  // geocoding: Google/Photon only when explicitly selected, Nominatim is the fallback.
  google,
  photon,
  nominatim,
  openMeteo,
  tomtomTraffic,
  hereTraffic,
  tomtomIncidents,
  hereIncidents,
  wzdxIncidents,
  staticJsonCameras,
  tflJamCams,
  digitrafficCameras,
  singaporeCameras,
  hongKongCameras,
  overpassParking,
  // routing: TomTom first when keyed (traffic-aware), OSRM is the free default.
  tomtomRouting,
  osrm,
  overpassStops,
  ollama,
  anthropic,
];

/** Kinds whose providers are all used together rather than picking one. */
export const MERGED_KINDS = new Set<ProviderKind>(["cameras", "incidents"]);

type Instances = {
  [K in ProviderKind]: Array<{ def: ProviderDefinition<K>; instance: ProviderKindMap[K] }>;
};

let instances: Instances | undefined;
let instancesConfig: AppConfig | undefined;

function preferred(kind: ProviderKind, config: AppConfig): string | undefined {
  if (kind === "traffic" || kind === "incidents") return config.TRAFFIC_PROVIDER || undefined;
  if (kind === "ai") return config.AI_PROVIDER || undefined;
  if (kind === "routing") return config.ROUTING_PROVIDER || undefined;
  return undefined;
}

function build(config: AppConfig): Instances {
  const result = {
    geocoding: [],
    weather: [],
    traffic: [],
    incidents: [],
    cameras: [],
    parking: [],
    routing: [],
    stops: [],
    ai: [],
  } as unknown as Instances;
  for (const def of ALL_PROVIDERS) {
    if (!def.isEnabled(config)) continue;
    (result[def.kind] as Array<{ def: ProviderDefinition; instance: unknown }>).push({
      def,
      instance: def.create(config),
    });
  }
  for (const kind of Object.keys(result) as ProviderKind[]) {
    const list = result[kind] as Array<{ def: ProviderDefinition }>;
    const want = preferred(kind, config);
    const index = want ? list.findIndex((p) => p.def.id === want) : -1;
    if (index > 0) list.unshift(...list.splice(index, 1));
    // Keep only the first provider of each group (e.g. TomTom or HERE incidents, not both).
    const seenGroups = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const group = list[i]!.def.group;
      if (!group) continue;
      if (seenGroups.has(group)) list.splice(i--, 1);
      else seenGroups.add(group);
    }
  }
  return result;
}

function all(): Instances {
  const config = getConfig();
  if (!instances || instancesConfig !== config) {
    instances = build(config);
    instancesConfig = config;
  }
  return instances;
}

/** The active provider for a single-provider kind, or undefined if none is configured. */
export function getProvider<K extends ProviderKind>(
  kind: K,
): { def: ProviderDefinition<K>; instance: ProviderKindMap[K] } | undefined {
  return all()[kind][0];
}

/** All active providers of a kind (used for kinds that merge providers: cameras, incidents). */
export function getProviders<K extends ProviderKind>(
  kind: K,
): Array<{ def: ProviderDefinition<K>; instance: ProviderKindMap[K] }> {
  return all()[kind];
}

export function getProviderStatuses(): ProviderStatus[] {
  const config = getConfig();
  const active = all();
  return ALL_PROVIDERS.map((def) => {
    const enabled = def.isEnabled(config);
    const list = active[def.kind] as Array<{ def: ProviderDefinition }>;
    const isActive =
      enabled &&
      (MERGED_KINDS.has(def.kind)
        ? list.some((p) => p.def.id === def.id)
        : list[0]?.def.id === def.id);
    return {
      id: def.id,
      kind: def.kind,
      name: def.name,
      enabled,
      active: isActive,
      requiredEnv: def.requiredEnv,
      homepage: def.homepage,
      attribution: def.attribution,
    };
  });
}

/** Test helper. */
export function resetProvidersForTests(): void {
  instances = undefined;
  instancesConfig = undefined;
}
