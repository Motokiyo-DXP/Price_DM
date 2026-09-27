import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { canonicalizeDuelMastersCard } from "./dm-canonical-equivalents.mjs";

const INPUT_PATH = ".local/dm-card-rules.jsonl";
const OUTPUT_PATH = ".local/dm-card-rules-update.sql";
const SOURCE_PATH = ".local/dm-cards-full.jsonl";
const MANIFEST_PATH = ".local/dm-card-rules-manifest.json";

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  if (values.length === 0) return "'{}'::text[]";
  return `array[${values.map(sqlText).join(", ")}]::text[]`;
}

function officialCardId(officialUrl) {
  try {
    const url = new URL(officialUrl);
    if (url.protocol !== "https:" || url.hostname !== "dm.takaratomy.co.jp" || url.pathname !== "/card/detail/") return null;
    const match = url.search.match(/[?&]id=([^&]+)/u);
    return match ? decodeURIComponent(match[1]).trim() || null : null;
  } catch {
    return null;
  }
}

export function normalizeRulesRecords(records) {
  const seenIds = new Set();
  return records.map((record, index) => {
    if (!record || typeof record !== "object" || typeof record.name !== "string" || !record.name.trim()) {
      throw new Error(`Rules record ${index + 1} has no card name.`);
    }
    if (typeof record.official_card_id !== "string" || !record.official_card_id.trim()
      || officialCardId(record.official_url) !== record.official_card_id) {
      throw new Error(`Rules record ${index + 1} has an official ID that does not match its URL.`);
    }
    if (seenIds.has(record.official_card_id)) throw new Error(`Duplicate rules record for official card ID ${record.official_card_id}.`);
    seenIds.add(record.official_card_id);
    if (!Array.isArray(record.races) || record.races.some((race) => typeof race !== "string" || !race.trim())) {
      throw new Error(`Rules record ${index + 1} has invalid races.`);
    }
    if (!Array.isArray(record.card_texts) || record.card_texts.length === 0
      || record.card_texts.some((text) => typeof text !== "string")) {
      throw new Error(`Rules record ${index + 1} has invalid card texts.`);
    }
    return {
      name: record.name.trim(),
      official_card_id: record.official_card_id,
      official_url: record.official_url,
      races: [...new Set(record.races.map((race) => race.trim()).filter(Boolean))].sort(),
      card_texts: record.card_texts,
    };
  });
}

export function validateRulesCoverage(sourceCards, records, manifest) {
  const sourcesById = new Map();
  for (const [index, source] of sourceCards.entries()) {
    if (typeof source?.name !== "string" || !source.name.trim()) throw new Error(`Card source ${index + 1} has no name.`);
    const id = officialCardId(source.official_url);
    if (!id) throw new Error(`Card source ${index + 1} has an invalid official URL.`);
    if (source.official_card_id !== undefined && source.official_card_id !== id) {
      throw new Error(`Card source official ID does not match URL: ${source.official_card_id} / ${id}`);
    }
    if (sourcesById.has(id)) throw new Error(`Duplicate source print for official card ID ${id}.`);
    sourcesById.set(id, source);
  }

  if (manifest?.complete !== true || manifest.failure_count !== 0
    || manifest.source_print_count !== sourcesById.size
    || manifest.rules_print_count !== records.length
    || records.length !== sourcesById.size) {
    throw new Error("Card rules backfill is incomplete; refusing to generate update SQL.");
  }

  for (const record of records) {
    const source = sourcesById.get(record.official_card_id);
    if (!source || source.official_url !== record.official_url) {
      throw new Error(`Rules record does not match a source print URL: ${record.official_card_id}`);
    }
    const sourceName = canonicalizeDuelMastersCard(source, record.official_card_id).name;
    const rulesName = canonicalizeDuelMastersCard(record, record.official_card_id).name;
    if (sourceName !== rulesName) {
      throw new Error(`Rules record does not match the source canonical name: ${record.official_card_id}`);
    }
    sourcesById.delete(record.official_card_id);
  }
  if (sourcesById.size > 0) {
    throw new Error(`Card rules backfill is missing ${sourcesById.size} source prints.`);
  }
  return records;
}

export function buildCardRulesUpdateSql(records) {
  if (records.length === 0) throw new Error("Rules update input is empty.");
  const values = records.map((record) => `(${[
    sqlText(record.name),
    sqlText(record.official_card_id),
    sqlText(record.official_url),
    sqlTextArray(record.races),
    sqlTextArray(record.card_texts),
  ].join(", ")})`).join(",\n  ");

  return `begin;

create temporary table dm_card_rules_source (
  name text not null,
  official_card_id text not null primary key,
  official_url text not null,
  races text[] not null,
  card_texts text[] not null
) on commit drop;

insert into dm_card_rules_source(name, official_card_id, official_url, races, card_texts)
values
  ${values};

do $$
declare
  expected_print_count integer;
  expected_canonical_count integer;
  updated_count integer;
begin
  select count(*) into expected_print_count from dm_card_rules_source;
  select count(distinct name) into expected_canonical_count from dm_card_rules_source;

  if exists (
    select source.official_card_id
    from dm_card_rules_source as source
    left join public.tcg_games as game on game.slug = 'duel-masters'
    left join public.canonical_cards as canonical
      on canonical.game_id = game.id
     and canonical.name = source.name
     and canonical.deleted_at is null
    left join public.card_prints as prints
      on prints.official_card_id = source.official_card_id
     and prints.deleted_at is null
    group by source.official_card_id
    having count(distinct canonical.id) <> 1
       or count(distinct prints.id) <> 1
       or bool_or(prints.id is not null and prints.canonical_card_id is distinct from canonical.id)
  ) then
    raise exception 'Card rules source has a missing, ambiguous, or mismatched canonical/print target';
  end if;

  if exists (
    select 1
    from dm_card_rules_source as source
    join public.card_prints as prints
      on prints.official_card_id = source.official_card_id
     and prints.deleted_at is null
    join public.canonical_cards as canonical
      on canonical.id = prints.canonical_card_id
     and canonical.deleted_at is null
    where prints.manually_locked or canonical.manually_locked
  ) then
    raise exception 'Card rules source includes a manually locked canonical card or print';
  end if;

  with canonical_races as (
    select names.name, coalesce((
      select array_agg(sorted_races.race)
      from (
        select distinct race_values.race collate "C" as race
        from dm_card_rules_source as race_source
        cross join lateral unnest(race_source.races) as race_values(race)
        where race_source.name = names.name
          and pg_catalog.btrim(race_values.race) <> ''
        order by race
      ) as sorted_races
    ), '{}'::text[]) as races
    from (select distinct name from dm_card_rules_source) as names
  )
  update public.canonical_cards as canonical
  set races = source.races,
      updated_at = pg_catalog.now()
  from canonical_races as source
  join public.tcg_games as game on game.slug = 'duel-masters'
  where canonical.game_id = game.id
    and canonical.name = source.name
    and canonical.deleted_at is null
    and not canonical.manually_locked;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_canonical_count then
    raise exception 'Expected to update % canonical cards, but updated %',
      expected_canonical_count, updated_count;
  end if;

  update public.card_prints as prints
  set card_texts = source.card_texts,
      updated_at = pg_catalog.now()
  from dm_card_rules_source as source
  join public.canonical_cards as canonical
    on canonical.name = source.name
   and canonical.deleted_at is null
  join public.tcg_games as game
    on game.id = canonical.game_id
   and game.slug = 'duel-masters'
  where prints.official_card_id = source.official_card_id
    and prints.canonical_card_id = canonical.id
    and prints.deleted_at is null
    and not prints.manually_locked
    and not canonical.manually_locked;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_print_count then
    raise exception 'Expected to update % card prints, but updated %',
      expected_print_count, updated_count;
  end if;
end
$$;

commit;
`;
}

async function main() {
  const [rulesContent, sourceContent, manifestContent] = await Promise.all([
    readFile(INPUT_PATH, "utf8"),
    readFile(SOURCE_PATH, "utf8"),
    readFile(MANIFEST_PATH, "utf8"),
  ]);
  const records = normalizeRulesRecords(rulesContent.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)));
  const sourceCards = sourceContent.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  const manifest = JSON.parse(manifestContent);
  validateRulesCoverage(sourceCards, records, manifest);
  await writeFile(OUTPUT_PATH, buildCardRulesUpdateSql(records), "utf8");
  console.log(JSON.stringify({ output: OUTPUT_PATH, records: records.length, canonical_cards: new Set(records.map((record) => record.name)).size }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
