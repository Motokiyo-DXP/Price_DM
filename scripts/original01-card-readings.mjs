import { load } from "cheerio";

export const ORIGINAL01_SOURCE = "original01";

const normalizeSpace = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const original01PageTitle = (cardName) =>
  `《${normalizeSpace(cardName).replaceAll("/", "／")}》`;

export const original01PageUrl = (cardName) =>
  `https://dmwiki.net/${encodeURIComponent(original01PageTitle(cardName))}`;

const isReading = (value) =>
  /[ぁ-ゖァ-ヺーA-Za-z0-9]/u.test(normalizeSpace(value));

export function extractOriginal01Readings(html, expectedCardName) {
  const $ = load(html);
  const heading = normalizeSpace(
    $("h2").first().clone().find("a").remove().end().text(),
  ).replace(/\s*\[編集\]\s*$/u, "");
  const wrapped = heading.match(/^《(.+)》$/u)?.[1] ?? "";
  if (!wrapped) return { heading, matched: false, readings: [] };

  const pattern = /([^()（）]+)[(（]([^()（）]+)[)）]/gu;
  const withoutReadings = wrapped.replace(pattern, (whole, base, reading) =>
    /[一-龯々〆ヵヶ]/u.test(base) && isReading(reading) ? base : whole,
  );
  const expected = normalizeSpace(expectedCardName).replaceAll("/", "／");
  if (withoutReadings !== expected) {
    return { heading, matched: false, readings: [] };
  }

  const readings = [];
  for (const match of wrapped.matchAll(pattern)) {
    if (/[一-龯々〆ヵヶ]/u.test(match[1]) && isReading(match[2])) {
      readings.push(normalizeSpace(match[2]));
    }
  }
  return { heading, matched: true, readings: [...new Set(readings)] };
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildOriginal01ReadingSql(records) {
  const values = records.flatMap((record) =>
    (record.readings ?? []).map(
      (reading) =>
        `(${sqlText(record.name)}, ${sqlText(reading)}, ${sqlText(record.source_url)})`,
    ),
  );
  if (values.length === 0) throw new Error("No original01 readings are available.");

  return `begin;
create temporary table original01_reading_source(
  card_name text not null,
  reading text not null,
  source_url text not null
) on commit drop;
insert into original01_reading_source(card_name, reading, source_url) values
  ${values.join(",\n  ")};
insert into public.card_search_terms(
  canonical_card_id, term, normalized_term, term_kind, source, verified, priority
)
select distinct
  cards.id,
  source.reading,
  public.normalize_card_search(source.reading),
  'alias_reading',
  '${ORIGINAL01_SOURCE}',
  false,
  20
from original01_reading_source as source
join public.tcg_games as games on games.slug = 'duel-masters'
join public.canonical_cards as cards
  on cards.game_id = games.id
 and cards.name = source.card_name
 and cards.deleted_at is null
where public.normalize_card_search(source.reading) <> ''
on conflict (canonical_card_id, normalized_term, term_kind) do update
set term = excluded.term,
    source = excluded.source,
    verified = excluded.verified,
    priority = excluded.priority,
    updated_at = pg_catalog.now();
commit;
`;
}
