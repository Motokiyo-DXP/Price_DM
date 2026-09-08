import { load } from "cheerio";

export const SOURCE_NAME = "original01";
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
export const pageTitleFor = (name) => `《${compact(name).replaceAll("/", "／")}》`;
export const pageUrlFor = (name) => `https://dmwiki.net/${encodeURIComponent(pageTitleFor(name))}`;
export const isSkippableCardPageStatus = (status) => status === 403;

export function extractReadings(html, expectedName) {
  const $ = load(html);
  const node = $("h2").first().clone();
  node.find(".editsection,.anchor_super").remove();
  const heading = compact(node.text());
  const readings = node.find("ruby rt").map((_, element) => compact($(element).text())).get().filter(Boolean);
  node.find("ruby").each((_, element) => $(element).replaceWith($(element).find("rb").text()));
  const plainName = compact(node.text()).match(/^《(.+)》$/u)?.[1] ?? "";
  const expected = compact(expectedName).replaceAll("/", "／");
  return { heading, matched: plainName === expected, readings: plainName === expected ? [...new Set(readings)] : [] };
}

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
export function buildSql(records) {
  const values = records.flatMap((row) => (row.readings ?? []).map((reading) => `(${sqlText(row.name)},${sqlText(reading)},${sqlText(row.source_url)})`));
  if (!values.length) throw new Error("No original01 readings are available.");
  return `begin;
create temporary table original01_source(card_name text,reading text,source_url text) on commit drop;
insert into original01_source values ${values.join(",\n")};
insert into public.card_search_terms(canonical_card_id,term,normalized_term,term_kind,source,verified,priority)
select distinct cards.id,src.reading,public.normalize_card_search(src.reading),'alias_reading','original01',false,20
from original01_source src
join public.tcg_games games on games.slug='duel-masters'
join public.canonical_cards cards on cards.game_id=games.id and cards.name=src.card_name and cards.deleted_at is null
where public.normalize_card_search(src.reading)<>''
on conflict(canonical_card_id,normalized_term,term_kind) do update
set term=excluded.term,source=excluded.source,verified=excluded.verified,priority=excluded.priority,updated_at=pg_catalog.now();
commit;\n`;
}
