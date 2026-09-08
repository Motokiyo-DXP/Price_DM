import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { canonicalizeDuelMastersCard } from "./dm-canonical-equivalents.mjs";

const CARD_PATH = ".local/dm-cards-full.jsonl";
const METADATA_PATH = ".local/dm-card-metadata.jsonl";
const CARD_TYPES_PATH = ".local/dm-card-types.jsonl";
const CHECKPOINT_PATH = ".local/dm-cards-full-checkpoint.json";
const OUTPUT_DIRECTORY = ".local/dm-import-sql";
const DEFAULT_CHUNK_SIZE = 100;
const CIVILIZATIONS = new Set(["light", "water", "darkness", "fire", "nature", "zero"]);

function sqlText(value) {
  return value === null || value === undefined
    ? "null"
    : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  if (!Array.isArray(values) || values.length === 0) return "'{}'::text[]";
  return `array[${values.map(sqlText).join(", ")}]::text[]`;
}

function officialCardId(card) {
  if (typeof card.official_url !== "string") return null;
  try {
    const url = new URL(card.official_url);
    const match = url.search.match(/[?&]id=([^&]+)/u);
    return match ? decodeURIComponent(match[1]).trim() || null : null;
  } catch {
    return null;
  }
}

function validateCard(card, index) {
  if (!card || typeof card !== "object") {
    throw new Error(`Card ${index + 1} is not an object.`);
  }
  if (typeof card.name !== "string" || !card.name.trim()) {
    throw new Error(`Card ${index + 1} has no name.`);
  }
  if (!officialCardId(card)) {
    throw new Error(`Card ${index + 1} has no official card id.`);
  }
  if (card.cost !== undefined && card.cost !== null && (!Number.isSafeInteger(card.cost) || card.cost < 0 || card.cost > 99)) {
    throw new Error(`Card ${index + 1} has an invalid cost.`);
  }
  if (card.civilizations !== undefined && (!Array.isArray(card.civilizations) || card.civilizations.some((value) => typeof value !== "string" || !CIVILIZATIONS.has(value)))) {
    throw new Error(`Card ${index + 1} has invalid civilizations.`);
  }
  if (card.card_types !== undefined && (!Array.isArray(card.card_types) || card.card_types.some((value) => typeof value !== "string" || !value.trim()))) {
    throw new Error(`Card ${index + 1} has invalid card types.`);
  }
}

export function mergeCardMetadata(cards, metadata) {
  const byName = new Map();
  for (const record of metadata) {
    if (typeof record?.name === "string" && record.name.trim()) {
      byName.set(record.name.trim(), record);
    }
  }
  return cards.map((card) => ({ ...card, ...(byName.get(card.name?.trim()) ?? {}) }));
}

async function readOptionalJsonl(path) {
  try {
    return (await readFile(path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function loadCards() {
  const content = await readFile(CARD_PATH, "utf8");
  const cards = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const metadata = [
    ...await readOptionalJsonl(METADATA_PATH),
    ...await readOptionalJsonl(CARD_TYPES_PATH),
  ];
  const mergedCards = mergeCardMetadata(cards, metadata);
  const deduplicated = new Map();
  for (const [index, card] of mergedCards.entries()) {
    validateCard(card, index);
    const key = officialCardId(card);
    if (!deduplicated.has(key)) deduplicated.set(key, card);
  }
  return [...deduplicated.values()];
}

function sourceValues(cards) {
  return cards
    .map(
      (card) => `(
      ${sqlText(card.name.trim())},
      ${sqlText(card.name_kana?.trim() || null)},
      ${card.cost ?? "null"},
      ${sqlTextArray(card.civilizations)},
      ${sqlTextArray(card.card_types)},
      ${sqlText(officialCardId(card))},
      ${sqlText(card.card_number?.trim() || null)},
      ${sqlText(card.product_name?.trim() || null)},
      ${sqlText(card.official_url)}
    )`,
    )
    .join(",\n    ");
}

export function buildCanonicalImportSql(cards) {
  cards.forEach(validateCard);
  const values = sourceValues(cards.map((card) => canonicalizeDuelMastersCard(card, officialCardId(card))));

  return `begin;

create temporary table dm_card_import_source (
  name text not null,
  generated_reading text,
  cost smallint,
  civilizations text[] not null,
  card_types text[] not null,
  official_card_id text not null,
  card_number text,
  product_name text,
  official_url text not null
) on commit drop;

insert into dm_card_import_source(
  name, generated_reading, cost, civilizations, card_types, official_card_id,
  card_number, product_name, official_url
)
values
    ${values};

with duel_masters as (
  select id as game_id
  from public.tcg_games
  where slug = 'duel-masters'
),
canonical_source as (
  select
    source.name,
    max(source.generated_reading) as generated_reading,
    max(source.cost) as cost,
    coalesce(
      max(nullif(source.civilizations, '{}'::text[])::text)::text[],
      '{}'::text[]
    ) as civilizations,
    coalesce(
      max(nullif(source.card_types, '{}'::text[])::text)::text[],
      '{}'::text[]
    ) as card_types
  from dm_card_import_source as source
  group by source.name
)
insert into public.canonical_cards(
  game_id,
  name,
  name_kana,
  cost,
  civilizations,
  card_types,
  source_name,
  source_name_kana,
  source_checked_at
)
select
  duel_masters.game_id,
  source.name,
  source.generated_reading,
  source.cost,
  source.civilizations,
  source.card_types,
  source.name,
  null,
  pg_catalog.now()
from canonical_source as source
cross join duel_masters
on conflict (game_id, name) where deleted_at is null do update
set name_kana = excluded.name_kana,
    cost = coalesce(excluded.cost, public.canonical_cards.cost),
    civilizations = case
      when cardinality(excluded.civilizations) > 0 then excluded.civilizations
      else public.canonical_cards.civilizations
    end,
    card_types = case
      when cardinality(excluded.card_types) > 0 then excluded.card_types
      else public.canonical_cards.card_types
    end,
    source_name = excluded.source_name,
    source_name_kana = excluded.source_name_kana,
    source_checked_at = excluded.source_checked_at,
    updated_at = pg_catalog.now()
where not public.canonical_cards.manually_locked;

insert into public.card_prints(
  canonical_card_id,
  official_card_id,
  card_number,
  product_name,
  official_url,
  source_checked_at
)
select distinct
  canonical.id,
  source.official_card_id,
  source.card_number,
  source.product_name,
  source.official_url,
  pg_catalog.now()
from dm_card_import_source as source
join public.tcg_games as game
  on game.slug = 'duel-masters'
join public.canonical_cards as canonical
  on canonical.game_id = game.id
 and canonical.name = source.name
 and canonical.deleted_at is null
on conflict (official_card_id) where official_card_id is not null and deleted_at is null
do update
set canonical_card_id = excluded.canonical_card_id,
    card_number = excluded.card_number,
    product_name = coalesce(public.card_prints.product_name, excluded.product_name),
    official_url = excluded.official_url,
    source_checked_at = excluded.source_checked_at,
    updated_at = pg_catalog.now()
where not public.card_prints.manually_locked;

insert into public.card_search_terms(
  canonical_card_id,
  term,
  normalized_term,
  term_kind,
  source,
  verified,
  priority
)
select distinct
  canonical.id,
  source.name,
  public.normalize_card_search(source.name),
  'official_name',
  'official',
  true,
  0
from dm_card_import_source as source
join public.tcg_games as game
  on game.slug = 'duel-masters'
join public.canonical_cards as canonical
  on canonical.game_id = game.id
 and canonical.name = source.name
 and canonical.deleted_at is null
where public.normalize_card_search(source.name) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do update
set term = excluded.term,
    source = excluded.source,
    verified = excluded.verified,
    priority = excluded.priority,
    updated_at = pg_catalog.now();

insert into public.card_search_terms(
  canonical_card_id,
  term,
  normalized_term,
  term_kind,
  source,
  verified,
  priority
)
select distinct
  canonical.id,
  source.generated_reading,
  public.normalize_card_search(source.generated_reading),
  'machine_reading',
  'generated',
  false,
  50
from dm_card_import_source as source
join public.tcg_games as game
  on game.slug = 'duel-masters'
join public.canonical_cards as canonical
  on canonical.game_id = game.id
 and canonical.name = source.name
 and canonical.deleted_at is null
where source.generated_reading is not null
  and public.normalize_card_search(source.generated_reading) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do update
set term = excluded.term,
    source = excluded.source,
    verified = excluded.verified,
    priority = excluded.priority,
    updated_at = pg_catalog.now();

commit;
`;
}

async function main() {
  const allowPartial = process.argv.includes("--allow-partial");
  const chunkArgument = process.argv.find((value) => value.startsWith("--chunk-size="));
  const chunkSize = chunkArgument
    ? Number.parseInt(chunkArgument.split("=", 2)[1], 10)
    : DEFAULT_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 1_000) {
    throw new Error("--chunk-size must be an integer between 1 and 1000.");
  }
  const checkpoint = JSON.parse(await readFile(CHECKPOINT_PATH, "utf8"));
  if (!checkpoint.complete && !allowPartial) {
    throw new Error(
      "Official catalog crawl is not complete. Resume it or pass --allow-partial for a test build.",
    );
  }

  const cards = await loadCards();
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const files = [];
  for (let start = 0; start < cards.length; start += chunkSize) {
    const number = String(files.length + 1).padStart(3, "0");
    const filename = `dm-cards-${number}.sql`;
    await writeFile(
      `${OUTPUT_DIRECTORY}/${filename}`,
      buildCanonicalImportSql(cards.slice(start, start + chunkSize)),
      "utf8",
    );
    files.push(filename);
  }
  await writeFile(
    `${OUTPUT_DIRECTORY}/manifest.json`,
    `${JSON.stringify(
      {
        card_print_count: cards.length,
        canonical_name_count: new Set(cards.map((card) => card.name)).size,
        chunk_size: chunkSize,
        complete_source: Boolean(checkpoint.complete),
        source: "duel-masters-official-card-catalog",
        third_party_aliases_included: false,
        files,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(
    `Generated ${files.length} verified SQL chunks for ${cards.length} official card prints.`,
  );
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
