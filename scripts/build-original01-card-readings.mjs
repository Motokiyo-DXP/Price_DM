import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildOriginal01ReadingSql, ORIGINAL01_SOURCE } from "./original01-card-readings.mjs";

const input = `.local/dm-card-readings-${ORIGINAL01_SOURCE}.jsonl`;
const output = `.local/dm-card-readings-${ORIGINAL01_SOURCE}.sql`;
const records = (await readFile(input, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
await mkdir(".local", { recursive: true });
await writeFile(output, buildOriginal01ReadingSql(records), "utf8");
console.log(`Saved ${output}.`);
