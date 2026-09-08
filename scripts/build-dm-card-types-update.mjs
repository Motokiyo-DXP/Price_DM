import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const INPUT_PATH = ".local/dm-card-types.jsonl";
const OUTPUT_PATH = ".local/dm-card-types-update.sql";

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  return `array[${values.map(sqlText).join(", ")}]::text[]`;
}

export function buildCardTypesUpdateSql(records) {
  const values = records.map((record) =>
    `(${sqlText(record.name)}, ${sqlTextArray(record.card_types)})`,
  ).join(",\n  ");
  return `begin;

create temporary table dm_card_types_source (
  name text primary key,
  card_types text[] not null
) on commit drop;

insert into dm_card_types_source(name, card_types)
values
  ${values};

do $$
declare
  updated_count integer;
begin
  update public.canonical_cards as canonical
  set card_types = source.card_types,
      updated_at = pg_catalog.now()
  from dm_card_types_source as source
  join public.tcg_games as game on game.slug = 'duel-masters'
  where canonical.game_id = game.id
    and canonical.name = source.name
    and canonical.deleted_at is null;

  get diagnostics updated_count = row_count;
  if updated_count <> (select count(*) from dm_card_types_source) then
    raise exception 'Expected to update % cards, but updated %',
      (select count(*) from dm_card_types_source), updated_count;
  end if;
end
$$;

commit;
`;
}

async function main() {
  const records = (await readFile(INPUT_PATH, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (records.some((record) =>
    typeof record?.name !== "string"
    || !Array.isArray(record.card_types)
    || record.card_types.length === 0
    || record.card_types.some((value) => typeof value !== "string" || !value.trim())
  )) {
    throw new Error("Card type input contains an invalid record.");
  }
  await writeFile(OUTPUT_PATH, buildCardTypesUpdateSql(records), "utf8");
  console.log(JSON.stringify({ output: OUTPUT_PATH, records: records.length }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
