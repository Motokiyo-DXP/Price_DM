import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { readingFor } from "./lib/dm-card-readings.mjs";

const CARD_PATH = ".local/dm-cards-full.jsonl";
const ALIAS_PATH = ".local/dm-card-aliases.json";
const CHECKPOINT_PATH = ".local/dm-cards-full-checkpoint.json";
const OUTPUT_DIRECTORY = ".local/dm-import-sql";
const DEFAULT_CHUNK_SIZE = 100;

function sqlText(value) {
  return value === null || value === undefined
    ? "null"
    : `'${String(value).replaceAll("'", "''")}'`;
}

function sqlTextArray(values) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length === 0
    ? "'{}'::text[]"
    : `array[${unique.map(sqlText).join(", ")}]::text[]`;
}

async function loadCards() {
  const content = await readFile(CARD_PATH, "utf8");
  const cards = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const deduplicated = new Map();
  for (const card of cards) {
    const key = `${card.name}\u0000${card.card_number ?? card.official_url}`;
    if (!deduplicated.has(key)) deduplicated.set(key, card);
  }
  return [...deduplicated.values()];
}

async function loadAliases() {
  const source = JSON.parse(await readFile(ALIAS_PATH, "utf8"));
  return new Map(source.aliases.map((entry) => [entry.name, entry.aliases]));
}

async function enrichCard(card, aliasesByName) {
  const aliases = [
    ...new Set([...(card.aliases ?? []), ...(aliasesByName.get(card.name) ?? [])]),
  ];
  const aliasesKana = [
    ...new Set([
      ...(card.aliases_kana ?? []),
      ...(await Promise.all(aliases.map(readingFor))),
    ]),
  ];
  return { ...card, aliases, aliases_kana: aliasesKana };
}

function buildSql(cards) {
  const values = cards
    .map(
      (card) => `(
      duel_masters.game_id,
      ${sqlText(card.name)},
      ${sqlText(card.name_kana)},
      ${sqlTextArray(card.aliases)},
      ${sqlTextArray(card.aliases_kana)},
      ${sqlText(card.card_number)},
      ${sqlText(card.product_name)},
      ${sqlText(card.official_url)}
    )`,
    )
    .join(",\n    ");

  return `with duel_masters as (
  select id as game_id
  from public.tcg_games
  where slug = 'duel-masters'
)
insert into public.cards(
  game_id, name, name_kana, aliases, aliases_kana,
  card_number, product_name, official_url
)
select imported.*
from duel_masters
cross join lateral (
  values
    ${values}
) as imported(
  game_id, name, name_kana, aliases, aliases_kana,
  card_number, product_name, official_url
)
on conflict (game_id, name, card_number) do update
set name_kana = excluded.name_kana,
    aliases = excluded.aliases,
    aliases_kana = excluded.aliases_kana,
    product_name = excluded.product_name,
    official_url = excluded.official_url;
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

  const [cards, aliasesByName] = await Promise.all([loadCards(), loadAliases()]);
  const enriched = [];
  for (const [index, card] of cards.entries()) {
    enriched.push(await enrichCard(card, aliasesByName));
    if ((index + 1) % 500 === 0) {
      process.stdout.write(`Prepared ${index + 1}/${cards.length} cards\r`);
    }
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const files = [];
  for (let start = 0; start < enriched.length; start += chunkSize) {
    const number = String(files.length + 1).padStart(3, "0");
    const filename = `dm-cards-${number}.sql`;
    await writeFile(
      `${OUTPUT_DIRECTORY}/${filename}`,
      buildSql(enriched.slice(start, start + chunkSize)),
      "utf8",
    );
    files.push(filename);
  }
  await writeFile(
    `${OUTPUT_DIRECTORY}/manifest.json`,
    `${JSON.stringify(
      {
        card_count: enriched.length,
        chunk_size: chunkSize,
        complete_source: Boolean(checkpoint.complete),
        files,
        generated_at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`\nGenerated ${files.length} verified SQL chunks for ${enriched.length} cards.`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
