// Copies browser assets that must be served as standalone files into public/vendor.
// MapLibre runs its tile parsing in a module Web Worker that bundlers cannot
// inline, so the worker (and the shared chunk it imports) is served as-is.
// Runs automatically before `npm run dev` and `npm run build`.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const target = path.resolve("public/vendor/maplibre-gl");
await mkdir(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(path.resolve("node_modules/maplibre-gl/dist", file), path.join(target, file));
}
console.log("copied MapLibre worker to public/vendor/maplibre-gl");
