import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.env.CARD_IMAGE_ROOT || "public/cards");
const concurrency = Math.max(1, Number(process.env.R2_UPLOAD_CONCURRENCY || 20));
const uploadBaseUrl = (process.env.R2_UPLOAD_BASE_URL || "").replace(/\/$/, "");
const uploadToken = process.env.R2_UPLOAD_TOKEN || "";
if (!uploadBaseUrl || !uploadToken) {
  throw new Error("R2_UPLOAD_BASE_URL and R2_UPLOAD_TOKEN are required.");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) files.push(absolute);
  }
  return files;
}

const allFiles = await walk(root);
const retryFailuresOnly = process.env.R2_UPLOAD_FAILURES_ONLY === "1";
const previousFailures = retryFailuresOnly
  ? JSON.parse(await readFile(path.resolve("outputs/r2-upload-failures.json"), "utf8"))
  : [];
const retrySet = new Set(previousFailures.map((item) => path.normalize(item.file)));
const files = retryFailuresOnly
  ? allFiles.filter((file) => retrySet.has(path.normalize(path.relative(root, file))))
  : allFiles;
const totalBytes = (await Promise.all(files.map((file) => stat(file)))).reduce((sum, value) => sum + value.size, 0);
let cursor = 0;
let completed = 0;
let uploadedBytes = 0;
const failures = [];
const startedAt = Date.now();

async function upload(file) {
  const info = await stat(file);
  const key = path.relative(root, file).split(path.sep).map(encodeURIComponent).join("/");
  const url = `${uploadBaseUrl}/${key}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${uploadToken}`,
      "Content-Type": "image/webp",
      "Content-Length": String(info.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: createReadStream(file),
    duplex: "half",
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  uploadedBytes += info.size;
}

async function worker() {
  for (;;) {
    const index = cursor++;
    if (index >= files.length) return;
    const file = files[index];
    try {
      await upload(file);
    } catch (error) {
      failures.push({ file: path.relative(root, file), error: error instanceof Error ? error.message : String(error) });
    }
    completed += 1;
    if (completed % 250 === 0 || completed === files.length) {
      const elapsedSeconds = Math.max(1, (Date.now() - startedAt) / 1000);
      const mib = uploadedBytes / 1024 / 1024;
      console.log(`${completed}/${files.length} (${((completed / files.length) * 100).toFixed(1)}%) ${mib.toFixed(1)} MiB, ${(mib / elapsedSeconds).toFixed(1)} MiB/s, failures=${failures.length}`);
    }
  }
}

console.log(`Uploading ${files.length} WebP files (${(totalBytes / 1024 / 1024).toFixed(1)} MiB) through the authenticated R2 Worker.`);
await Promise.all(Array.from({ length: concurrency }, () => worker()));
await writeFile(path.resolve("outputs/r2-upload-failures.json"), JSON.stringify(failures, null, 2) + "\n");
if (failures.length > 0) {
  console.error(`Upload completed with ${failures.length} failures. See outputs/r2-upload-failures.json.`);
  process.exitCode = 1;
} else {
  console.log("All card images uploaded successfully.");
}
