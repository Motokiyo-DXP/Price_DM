import { readFile, writeFile } from "node:fs/promises";
import { buildSql, SOURCE_NAME } from "./dmwiki-original01.mjs";
const records = (await readFile(`.local/dmwiki-readings-${SOURCE_NAME}.jsonl`, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
await writeFile(`.local/dmwiki-readings-${SOURCE_NAME}.sql`, buildSql(records));
