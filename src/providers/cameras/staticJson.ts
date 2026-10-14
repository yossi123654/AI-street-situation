import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cameraFileSchema, type CameraEntry } from "@/lib/cameraSchema";
import type { Camera } from "@/lib/types";
import type { ProviderDefinition } from "@/providers/types";

export const PROVIDER_ID = "community";

async function listJsonFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listJsonFiles(full);
      return entry.isFile() && entry.name.endsWith(".json") ? [full] : [];
    }),
  );
  return nested.flat().sort();
}

export function entryToCamera(entry: CameraEntry): Camera {
  const { location, ...rest } = entry;
  delete rest.notes;
  return { ...rest, lat: location.lat, lon: location.lon, providerId: PROVIDER_ID };
}

/** Loads and validates every camera file below `dir`. Invalid files are skipped with a warning. */
export async function loadCameraDirectory(
  dir: string,
  options: { allowInsecureUrls?: boolean } = {},
): Promise<Camera[]> {
  const schema = cameraFileSchema(options);
  const files = await listJsonFiles(dir);
  const cameras: Camera[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    try {
      const parsed = schema.safeParse(JSON.parse(await readFile(file, "utf8")));
      if (!parsed.success) {
        console.warn(`[cameras] skipping invalid file ${file}: ${parsed.error.message}`);
        continue;
      }
      for (const entry of parsed.data.cameras) {
        if (seen.has(entry.id)) {
          console.warn(`[cameras] duplicate camera id ${entry.id} in ${file}, skipping`);
          continue;
        }
        seen.add(entry.id);
        cameras.push(entryToCamera(entry));
      }
    } catch (error) {
      console.warn(`[cameras] could not read ${file}:`, error);
    }
  }
  return cameras;
}

export const staticJsonCameras: ProviderDefinition<"cameras"> = {
  id: PROVIDER_ID,
  kind: "cameras",
  name: "Community camera registry",
  homepage: "https://github.com/yossi123654/ai-street-situation/tree/main/data/cameras",
  attribution: "Camera metadata: AI Street Situation contributors",
  requiredEnv: [],
  isEnabled: () => true,
  create(config) {
    // Resolved at runtime; the data directory is copied into the Docker image explicitly.
    const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), config.CAMERA_DATA_DIR);
    let loaded: Promise<Camera[]> | undefined;
    let loadedAt = 0;
    return {
      list() {
        // Reload at most once a minute so edits show up without a restart.
        if (!loaded || Date.now() - loadedAt > 60_000) {
          loadedAt = Date.now();
          loaded = loadCameraDirectory(dir, { allowInsecureUrls: config.DEV_ALLOW_INSECURE_MEDIA });
        }
        return loaded;
      },
    };
  },
};
