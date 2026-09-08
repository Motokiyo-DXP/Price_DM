import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const INPUT_PATH = ".local/dm-card-metadata.jsonl";
const OUTPUT_DIRECTORY = ".local/dm-card-metadata-sql";
const MANIFEST_PATH = `${OUTPUT_DIRECTORY}/manifest.json`;
const CHUNK_SIZE = 250;
const CIVILIZATIONS = new Set(["light", "water", "darkness", "fire", "nature", "zero"]);

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlArray = (values) => `array[${values.map(sqlText).join(", ")}]::text[]`;

export function normalizeMetadataRecords(records) {
  const byName = new Map();
  for (const record of records) {
    if (typeof record?.name !== "string" || !record.name.trim()) throw new Error("Metadata record has no name.");
    if (record.cost !== null && (!Number.isSafeInteger(record.cost) || record.cost < 0 || record.cost > 99)) throw new Error(`Invalid cost: ${record.name}`);
    if (!Array.isArray(record.civilizations) || record.civilizations.some((value) => !CIVILIZATIONS.has(value))) throw new Error(`Invalid civilizations: ${record.name}`);
    byName.set(record.name.trim(), { name: record.name.trim(), cost: record.cost, civilizations: [...new Set(record.civilizations)] });
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name, "ja"));
}

export function buildMetadataUpdateSql(records) {
  const values = records.map((record) => `(${sqlText(record.name)}, ${record.cost ?? "null"}, ${sqlArray(record.civilizations)})`).join(",\n  ");
  return `begin;\ncreate temporary table dm_card_metadata_source(name text primary key, cost smallint, civilizations text[] not null) on commit drop;\ninsert into dm_card_metadata_source(name,cost,civilizations) values\n  ${values};\ndo $$\ndeclare updated_count integer;\nbegin\n  update public.canonical_cards canonical\n  set cost=source.cost,civilizations=source.civilizations,metadata_synced_at=pg_catalog.now(),updated_at=pg_catalog.now()\n  from dm_card_metadata_source source\n  join public.tcg_games game on game.slug='duel-masters'\n  where canonical.game_id=game.id and canonical.name=source.name and canonical.deleted_at is null;\n  get diagnostics updated_count = row_count;\n  if updated_count <> (select count(*) from dm_card_metadata_source) then\n    raise exception 'Expected to update % cards, but updated %',(select count(*) from dm_card_metadata_source),updated_count;\n  end if;\nend $$;\ncommit;\n`;
}

async function main() {
  const records = normalizeMetadataRecords((await readFile(INPUT_PATH, "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)));
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const outputs = [];
  for (let index = 0; index < records.length; index += CHUNK_SIZE) {
    const output = path.join(OUTPUT_DIRECTORY, `card-metadata-${String(outputs.length + 1).padStart(3, "0")}.sql`);
    await writeFile(output, buildMetadataUpdateSql(records.slice(index, index + CHUNK_SIZE)), "utf8");
    outputs.push(output);
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify({ records: records.length, files: outputs.map((output) => path.basename(output)), complete: true }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ records: records.length, chunks: outputs.length, outputDirectory: OUTPUT_DIRECTORY }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error); process.exitCode = 1; });
