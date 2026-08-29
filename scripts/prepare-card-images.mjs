import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const [sourceArg, outputArg, manifestArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error("Usage: npm run images:prepare -- <source-dir> <output-dir> [manifest.csv]");

const sourceDir = path.resolve(sourceArg);
const outputDir = path.resolve(outputArg);
const manifestPath = path.resolve(manifestArg || path.join(".local", "card-images.csv"));
const cacheDirectory = path.resolve(".local", "card-image-cache", createHash("sha256").update(outputDir).digest("hex").slice(0, 12));
const extensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".avif"]);
const files = (await readdir(sourceDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, "ja"));

await Promise.all([mkdir(outputDir, { recursive: true }), mkdir(path.dirname(manifestPath), { recursive: true }), mkdir(cacheDirectory, { recursive: true })]);
const rows = [];
let converted = 0;
let skipped = 0;

async function convert(filename) {
  const inputPath = path.join(sourceDir, filename);
  const imageKey = path.basename(filename, path.extname(filename));
  if (!/^[a-zA-Z0-9_-]+$/.test(imageKey)) throw new Error(`${filename}: ファイル名は英数字、_、- のみ使用できます。`);
  const outputPath = path.join(outputDir, `${imageKey}.webp`);
  const input = await readFile(inputPath);
  const sourceHash = createHash("sha256").update(input).digest("hex");
  const markerPath = path.join(cacheDirectory, `${imageKey}.sha256`);
  let previousHash = "";
  try { previousHash = (await readFile(markerPath, "utf8")).trim(); } catch {}

  if (previousHash !== sourceHash) {
    await sharp(input).rotate().resize({ width: 384, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(outputPath);
    await writeFile(markerPath, `${sourceHash}\n`);
    converted += 1;
  } else {
    skipped += 1;
  }
  const [metadata, file] = await Promise.all([sharp(outputPath).metadata(), stat(outputPath)]);
  rows.push({ imageKey, filename, width: metadata.width, height: metadata.height, bytes: file.size });
}

const concurrency = Math.max(1, Math.min(8, Number(process.env.CARD_IMAGE_CONCURRENCY) || 4));
for (let index = 0; index < files.length; index += concurrency) await Promise.all(files.slice(index, index + concurrency).map(convert));

const csv = ["image_key,source_filename,width,height,byte_size", ...rows.map((row) =>
  [row.imageKey, row.filename, row.width, row.height, row.bytes].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
)].join("\n");
await writeFile(manifestPath, `${csv}\n`);
const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
console.log(JSON.stringify({ files: rows.length, converted, skipped, totalBytes, manifestPath }, null, 2));
