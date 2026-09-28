import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseOfficialCardPowerValue } from "./import-dm-cards-sample.mjs";

const INPUT_PATH = ".local/dm-card-metadata.jsonl";
const OUTPUT_DIRECTORY = ".local/dm-card-metadata-sql";
const MANIFEST_PATH = `${OUTPUT_DIRECTORY}/manifest.json`;
const CHUNK_SIZE = 250;
const CIVILIZATIONS = new Set(["light", "water", "darkness", "fire", "nature", "zero"]);

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlArray = (values) => `array[${values.map(sqlText).join(", ")}]::text[]`;
const sqlNullableText = (value) => value === null ? "null" : sqlText(value);

export function normalizeMetadataRecords(records) {
  const byName = new Map();
  for (const record of records) {
    if (typeof record?.name !== "string" || !record.name.trim()) throw new Error("Metadata record has no name.");
    if (record.cost !== null && (!Number.isSafeInteger(record.cost) || record.cost < 0 || record.cost > 99)) throw new Error(`Invalid cost: ${record.name}`);
    if (typeof record.cost_is_infinite !== "boolean" || (record.cost_is_infinite && record.cost !== null)) throw new Error(`Invalid infinite cost: ${record.name}`);
    if (!Array.isArray(record.civilizations) || record.civilizations.some((value) => !CIVILIZATIONS.has(value))) throw new Error(`Invalid civilizations: ${record.name}`);
    if (!Array.isArray(record.card_types) || record.card_types.some((value) => typeof value !== "string")) throw new Error(`Invalid card types: ${record.name}`);
    if (record.power_text !== null && typeof record.power_text !== "string") throw new Error(`Invalid power text: ${record.name}`);
    if (record.power_value !== null && (!Number.isSafeInteger(record.power_value) || record.power_value < 0)) throw new Error(`Invalid power value: ${record.name}`);
    if (record.power_value !== parseOfficialCardPowerValue(record.power_text)) throw new Error(`Inconsistent printed power metadata: ${record.name}`);
    byName.set(record.name.trim(), {
      name: record.name.trim(),
      cost: record.cost,
      cost_is_infinite: record.cost_is_infinite,
      civilizations: [...new Set(record.civilizations)],
      card_types: [...new Set(record.card_types)],
      power_text: record.power_text,
      power_value: record.power_value,
    });
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name, "ja"));
}

export function buildMetadataUpdateSql(records) {
  const values = records.map((record) => `(${sqlText(record.name)}, ${record.cost ?? "null"}, ${record.cost_is_infinite}, ${sqlArray(record.civilizations)}, ${sqlArray(record.card_types)}, ${sqlNullableText(record.power_text)}, ${record.power_value ?? "null"})`).join(",\n  ");
  return `begin;\ncreate temporary table dm_card_metadata_source(name text primary key, cost smallint, cost_is_infinite boolean not null, civilizations text[] not null, card_types text[] not null, power_text text, power_value integer) on commit drop;\ninsert into dm_card_metadata_source(name,cost,cost_is_infinite,civilizations,card_types,power_text,power_value) values\n  ${values};\ndo $$\ndeclare updated_count integer;\nbegin\n  update public.canonical_cards canonical\n  set cost=source.cost,cost_is_infinite=source.cost_is_infinite,civilizations=source.civilizations,card_types=source.card_types,power_text=source.power_text,power_value=source.power_value,metadata_synced_at=pg_catalog.now(),updated_at=pg_catalog.now()\n  from dm_card_metadata_source source\n  join public.tcg_games game on game.slug='duel-masters'\n  where canonical.game_id=game.id and canonical.name=source.name and canonical.deleted_at is null;\n  get diagnostics updated_count = row_count;\n  if updated_count <> (select count(*) from dm_card_metadata_source) then\n    raise exception 'Expected to update % cards, but updated %',(select count(*) from dm_card_metadata_source),updated_count;\n  end if;\nend $$;\ncommit;\n`;
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
