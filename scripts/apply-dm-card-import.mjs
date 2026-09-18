import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { assertProductionDbRelease } from "./production-db-guard.mjs";

const MANIFEST_PATH = ".local/dm-import-sql/manifest.json";
const CHECKPOINT_PATH = ".local/dm-import-apply-checkpoint.json";
const LINKED_REF_PATH = "supabase/.temp/project-ref";
const SQL_DIRECTORY = ".local/dm-import-sql";
const CLI_VERSION = "2.109.1";

function argumentValue(argv, prefix) {
  return argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

export function validateApplyRequest({ argv, linkedRef, manifest }) {
  if (!argv.includes("--confirm-production")) {
    throw new Error("--confirm-production is required.");
  }
  const expectedRef = argumentValue(argv, "--project-ref=");
  if (!expectedRef || expectedRef !== linkedRef) {
    throw new Error("--project-ref must match the linked Supabase project.");
  }
  if (!manifest?.complete_source) {
    throw new Error("Official catalog must be complete before production apply.");
  }
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.some(
      (file) => typeof file !== "string" || !/^dm-cards-\d{3}\.sql$/.test(file),
    )
  ) {
    throw new Error("Import manifest contains invalid SQL files.");
  }
  if (
    !Number.isSafeInteger(manifest.card_print_count) ||
    manifest.card_print_count <= 0
  ) {
    throw new Error("Import manifest has an invalid card count.");
  }
  if (manifest.third_party_aliases_included !== false) {
    throw new Error("Third-party aliases must not be included.");
  }
  return {
    expectedRef,
    files: manifest.files,
    cardPrintCount: manifest.card_print_count,
  };
}

export function resolveAppliedFiles(previous, request) {
  if (
    previous?.project_ref !== request.expectedRef ||
    previous?.card_print_count !== request.cardPrintCount ||
    !Array.isArray(previous?.applied)
  ) {
    return [];
  }
  const currentFiles = new Set(request.files);
  return previous.applied.filter((file) => currentFiles.has(file));
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function runSqlFile(file) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "--yes",
    `supabase@${CLI_VERSION}`,
    "db",
    "query",
    "--linked",
    "--file",
    `${SQL_DIRECTORY}/${file}`,
    "--output-format",
    "json",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      // Windows launches npm-generated .cmd shims through cmd.exe. Every
      // interpolated file name is restricted by validateApplyRequest.
      shell: process.platform === "win32",
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Supabase CLI failed for ${file} (${signal ?? `exit ${code}`}).`,
          ),
        );
      }
    });
  });
}

async function main() {
  const [linkedRef, manifest, previous] = await Promise.all([
    readFile(LINKED_REF_PATH, "utf8").then((value) => value.trim()),
    readJson(MANIFEST_PATH, null),
    readJson(CHECKPOINT_PATH, { applied: [] }),
  ]);
  const request = validateApplyRequest({
    argv: process.argv.slice(2),
    linkedRef,
    manifest,
  });
  assertProductionDbRelease(process.cwd());
  const applied = new Set(resolveAppliedFiles(previous, request));

  for (const [index, file] of request.files.entries()) {
    if (applied.has(file)) continue;
    console.log(`Applying ${index + 1}/${request.files.length}: ${file}`);
    await runSqlFile(file);
    applied.add(file);
    await writeFile(
      CHECKPOINT_PATH,
      `${JSON.stringify(
        {
          project_ref: request.expectedRef,
          card_print_count: request.cardPrintCount,
          applied: [...applied],
          complete: applied.size === request.files.length,
          updated_at: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }
  console.log(`Applied ${applied.size}/${request.files.length} SQL chunks.`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
