import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const DIRECTORY = ".local/dm-card-metadata-sql";
const MANIFEST_PATH = `${DIRECTORY}/manifest.json`;
const CHECKPOINT_PATH = ".local/dm-card-metadata-apply-checkpoint.json";
const LINKED_REF_PATH = "supabase/.temp/project-ref";
const CLI_VERSION = "2.109.1";

export function validateMetadataApply({ argv, linkedRef, manifest }) {
  if (!argv.includes("--confirm-production")) throw new Error("--confirm-production is required.");
  const expectedRef = argv.find((value) => value.startsWith("--project-ref="))?.split("=", 2)[1];
  if (!expectedRef || expectedRef !== linkedRef) throw new Error("--project-ref must match the linked Supabase project.");
  if (!manifest?.complete || !Number.isSafeInteger(manifest.records) || manifest.records <= 0) throw new Error("Metadata manifest is incomplete.");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0 || manifest.files.some((file) => !/^card-metadata-\d{3}\.sql$/u.test(file))) throw new Error("Metadata manifest contains invalid files.");
  return { expectedRef, files: manifest.files, records: manifest.records };
}

function runSqlFile(file) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--yes", `supabase@${CLI_VERSION}`, "db", "query", "--linked", "--file", `${DIRECTORY}/${file}`, "--output-format", "json"], { shell: process.platform === "win32", stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Supabase CLI failed for ${file} (exit ${code}).`)));
  });
}

async function main() {
  const [linkedRef, manifest, previous] = await Promise.all([
    readFile(LINKED_REF_PATH, "utf8").then((value) => value.trim()),
    readFile(MANIFEST_PATH, "utf8").then(JSON.parse),
    readFile(CHECKPOINT_PATH, "utf8").then(JSON.parse).catch((error) => error?.code === "ENOENT" ? { applied: [] } : Promise.reject(error)),
  ]);
  const request = validateMetadataApply({ argv: process.argv.slice(2), linkedRef, manifest });
  const applied = new Set(previous?.project_ref === request.expectedRef && previous?.records === request.records ? previous.applied ?? [] : []);
  for (const [index, file] of request.files.entries()) {
    if (applied.has(file)) continue;
    console.log(`Applying ${index + 1}/${request.files.length}: ${file}`);
    await runSqlFile(file);
    applied.add(file);
    await writeFile(CHECKPOINT_PATH, `${JSON.stringify({ project_ref: request.expectedRef, records: request.records, applied: [...applied], complete: applied.size === request.files.length, updated_at: new Date().toISOString() }, null, 2)}\n`, "utf8");
  }
  console.log(`Applied ${applied.size}/${request.files.length} metadata SQL chunks.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
