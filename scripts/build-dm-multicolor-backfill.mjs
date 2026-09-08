import { load } from "cheerio";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SEARCH_URL = "https://dm.takaratomy.co.jp/card/";
const PAGE_SIZE = 50;
const CIVILIZATIONS = new Map([
  ["光", "light"],
  ["水", "water"],
  ["闇", "darkness"],
  ["火", "fire"],
  ["自然", "nature"],
  ["ゼロ", "zero"],
]);

export function parseOfficialCardIds(html) {
  const $ = load(html);
  return [...new Set($('a[href*="/card/detail/?id="]').map((_, element) => {
    const href = $(element).attr("href") ?? "";
    return new URL(href, SEARCH_URL).searchParams.get("id")?.toLowerCase() ?? null;
  }).get().filter(Boolean))];
}

async function fetchCivilizationIds(label, fetchImpl = fetch) {
  const ids = new Set();
  for (let page = 1; ; page += 1) {
    const body = new URLSearchParams([
      ["condition", "on"],
      ["culture_cond[]", "多色"],
      ["culture[]", label],
      ["pagenum", String(page)],
    ]);
    const response = await fetchImpl(SEARCH_URL, {
      body,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "TCG-Souba-Checker/0.1 (personal noncommercial card metadata index)",
      },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Official card search returned HTTP ${response.status} for ${label} page ${page}.`);
    const pageIds = parseOfficialCardIds(await response.text());
    pageIds.forEach((id) => ids.add(id));
    if (pageIds.length < PAGE_SIZE) break;
  }
  return ids;
}

export async function collectOfficialMulticolorCards(fetchImpl = fetch) {
  const assignments = new Map();
  for (const [label, civilization] of CIVILIZATIONS) {
    const ids = await fetchCivilizationIds(label, fetchImpl);
    for (const id of ids) {
      const values = assignments.get(id) ?? new Set();
      values.add(civilization);
      assignments.set(id, values);
    }
  }
  return new Map([...assignments].filter(([, values]) => values.size > 1));
}

function sqlText(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

export function buildBackfillSql(assignments) {
  const rows = [...assignments].sort(([left], [right]) => left.localeCompare(right)).map(([officialCardId, civilizations]) =>
    `  (${sqlText(officialCardId)}, array[${[...civilizations].sort().map(sqlText).join(", ")}]::text[])`,
  );
  if (!rows.length) throw new Error("Official search returned no multicolor cards.");
  return `with source(official_card_id, civilizations) as (
values
${rows.join(",\n")}
),
resolved as (
  select cp.canonical_card_id, array_agg(distinct civilization order by civilization) as civilizations
  from source
  join public.card_prints cp on lower(cp.official_card_id) = source.official_card_id
  cross join lateral unnest(source.civilizations) as civilization
  where cp.deleted_at is null
  group by cp.canonical_card_id
)
update public.canonical_cards cc
set civilizations = resolved.civilizations,
    updated_at = now()
from resolved
where cc.id = resolved.canonical_card_id
  and cc.civilizations is distinct from resolved.civilizations;
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const assignments = await collectOfficialMulticolorCards();
  const sql = buildBackfillSql(assignments);
  const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
  if (outputArgument) {
    const outputPath = outputArgument.slice("--output=".length);
    await writeFile(outputPath, sql, "utf8");
    process.stdout.write(JSON.stringify({ assignments: assignments.size, outputPath, sqlBytes: Buffer.byteLength(sql) }));
  } else {
    process.stdout.write(sql);
  }
}
