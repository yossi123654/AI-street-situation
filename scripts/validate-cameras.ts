/**
 * Validates every camera file in data/cameras (or the directory given as the
 * first argument). Run by CI on every pull request.
 *
 *   npm run validate:cameras
 *   npm run validate:cameras -- --write-schema   # regenerate schemas/camera-file.schema.json
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { cameraFileSchema } from "../src/lib/cameraSchema.ts";

const args = process.argv.slice(2);
const writeSchema = args.includes("--write-schema");
const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? "data/cameras");
const schemaPath = path.resolve("schemas/camera-file.schema.json");

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : Promise.resolve(e.name.endsWith(".json") ? [full] : []);
    }),
  );
  return files.flat().sort();
}

function jsonSchema() {
  const schema = z.toJSONSchema(cameraFileSchema(), { io: "input", unrepresentable: "any" });
  return `${JSON.stringify({ ...schema, title: "AI Street Situation camera file" }, null, 2)}\n`;
}

async function main() {
  if (writeSchema) {
    await writeFile(schemaPath, jsonSchema());
    console.log(`wrote ${path.relative(process.cwd(), schemaPath)}`);
    return;
  }

  const errors: string[] = [];
  const ids = new Map<string, string>();
  const today = new Date().toISOString().slice(0, 10);
  const schema = cameraFileSchema();
  const files = await walk(root);
  let count = 0;

  for (const file of files) {
    const rel = path.relative(process.cwd(), file);
    const parts = path.relative(root, file).split(path.sep);
    if (parts.length !== 2) {
      errors.push(`${rel}: camera files must live at data/cameras/<country>/<city>.json`);
      continue;
    }
    const [countryDir, fileName] = parts as [string, string];
    const cityFromFile = fileName.replace(/\.json$/, "");

    let data: unknown;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      errors.push(`${rel}: invalid JSON (${(error as Error).message})`);
      continue;
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${rel}: ${issue.path.join(".") || "(root)"}: ${issue.message}`);
      }
      continue;
    }
    for (const [index, camera] of parsed.data.cameras.entries()) {
      const where = `${rel}: cameras[${index}] (${camera.id})`;
      count++;
      if (camera.country !== countryDir)
        errors.push(`${where}: country "${camera.country}" does not match folder "${countryDir}"`);
      if (camera.city !== cityFromFile)
        errors.push(`${where}: city "${camera.city}" does not match file name "${cityFromFile}"`);
      if (camera.verification.lastVerified > today)
        errors.push(`${where}: lastVerified is in the future`);
      const previous = ids.get(camera.id);
      if (previous) errors.push(`${where}: duplicate id, already used in ${previous}`);
      ids.set(camera.id, rel);
    }
  }

  try {
    if ((await readFile(schemaPath, "utf8")) !== jsonSchema()) {
      errors.push(
        `${path.relative(process.cwd(), schemaPath)} is out of date: run "npm run validate:cameras -- --write-schema"`,
      );
    }
  } catch {
    errors.push(
      `${path.relative(process.cwd(), schemaPath)} is missing: run "npm run validate:cameras -- --write-schema"`,
    );
  }

  const unique = [...new Set(errors)];
  if (unique.length > 0) {
    console.error(`✗ ${unique.length} problem(s) found:\n`);
    for (const error of unique) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${count} camera(s) in ${files.length} file(s) are valid.`);
}

await main();
