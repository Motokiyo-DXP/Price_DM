import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SET = 'DM26-EX4';
const PRODUCT_URL = 'https://dm.takaratomy.co.jp/product/dm26ex4/';
const DM_WIKI_URL = 'https://m.dmwiki.net/DM26-EX4';
const productName = 'DM26-EX4 デュエル・マスターズTCG 切札不滅!! デュエキング FOREVER 2026';
const q = (v) => v == null ? 'null' : `'${String(v).replaceAll("'", "''")}'`;

export function validatePreview(raw) {
  if (!raw || raw.set_code !== SET || raw.product?.product_code !== SET || raw.product?.official_url !== PRODUCT_URL ||
    raw.product?.product_name !== productName || raw.product?.release_date !== '2026-10-17' || raw.product?.source !== 'official') {
    throw new Error('Unexpected product metadata: verify official product page first.');
  }
  if (!Array.isArray(raw.cards) || raw.cards.length === 0) throw new Error('Missing provisional card records.');
  const seen = new Set();
  const cards = raw.cards.map((card) => {
    const {card_number: number, name} = card;
    if (typeof number !== 'string' || !/^(?:\d+\/99|超G\d+\/超G12|超\d+\/超50|㊙\d+\/㊙25)$/u.test(number) ||
      typeof name !== 'string' || !name.trim() || card.source !== 'dmwiki' || card.verified !== false || card.source_url !== DM_WIKI_URL) {
      throw new Error(`Invalid or unverified-source card row: ${number ?? '?'}`);
    }
    if (seen.has(number)) throw new Error(`Duplicate printed number ${number}`);
    seen.add(number);
    const bounds = number.match(/^(?:超G|超|㊙)?(\d+)\/(?:超G|超|㊙)?(\d+)$/u);
    if (!bounds || Number(bounds[1]) < 1 || Number(bounds[1]) > Number(bounds[2])) throw new Error(`Invalid printed number ${number}`);
    return { number, name: name.trim(), dbNumber: `DM26EX4 ${number}` };
  });
  const fragments = raw.reading_fragments ?? [];
  for (const f of fragments) {
    if (!cards.some(x => x.name === f.card_name) || typeof f.reading !== 'string' || !f.reading.trim() ||
      !/^https:\/\/dmwiki\.net\//u.test(f.source_url) || f.source !== 'dmwiki' || f.verified !== false) {
      throw new Error('Untraceable third-party reading fragment.');
    }
  }
  return { cards, fragments };
}

export function buildPreviewSql(raw) {
  const {cards, fragments} = validatePreview(raw);
  const cardValues = cards.map(x => `(${q(x.dbNumber)}, ${q(x.name)})`).join(',\n');
  const readingValues = fragments.length ? fragments.map(x=>`(${q(x.card_name)},${q(x.reading)})`).join(',\n') : '';
  return `-- DM26-EX4 provisional release-stage import, NOT official card-catalog data.
-- Official evidence: ${PRODUCT_URL}; card-name/number evidence: ${DM_WIKI_URL} (unverified).
-- Run only from the dedicated Price_DM release session after conflict checks.
begin;
set local lock_timeout='5s';
lock table public.card_products, public.canonical_cards, public.card_prints, public.card_search_terms in share row exclusive mode;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dm26ex4-provisional', 0));
create temporary table dm26ex4_preview (card_number text primary key, name text not null) on commit drop;
insert into dm26ex4_preview(card_number,name) values
${cardValues};

do $$ begin
  if not exists(select 1 from public.tcg_games where slug='duel-masters') then
    raise exception 'Duel Masters game not found';
  end if;
  if exists(select 1 from public.card_products where product_code=${q(SET)} and (official_url is distinct from ${q(PRODUCT_URL)}
    or product_name is distinct from ${q(productName)} or release_date is distinct from '2026-10-17'::date
    or release_date_precision <> 'day' or game_id <> (select id from public.tcg_games where slug='duel-masters'))) then
    raise exception 'DM26-EX4 product already has a different source URL; manual review required';
  end if;
  if exists(select 1 from public.card_prints p join dm26ex4_preview s on p.card_number=s.card_number
    left join public.card_products product on product.id=p.product_id
    where product.product_code is distinct from ${q(SET)}) then
    raise exception 'Unlinked or differently linked DM26-EX4 print; manual review required';
  end if;
  if exists(select 1 from dm26ex4_preview s join public.canonical_cards c
    on c.game_id=(select id from public.tcg_games where slug='duel-masters')
    and public.normalize_card_search(c.name)=public.normalize_card_search(s.name)
    where c.deleted_at is not null or c.normalized_name_nfkc<>pg_catalog.normalize(s.name,'NFKC')) then
    raise exception 'Ambiguous canonical name; manual review required';
  end if;
  if exists(select 1 from public.card_prints p join public.card_products product on product.id=p.product_id
    join dm26ex4_preview s on s.card_number=p.card_number where product.product_code=${q(SET)}
    group by p.card_number having count(*)>1) then raise exception 'Duplicate existing print; manual review required'; end if;
  if exists(
    select 1 from dm26ex4_preview s
    join public.card_products product on product.product_code=${q(SET)}
    join public.card_prints print on print.product_id=product.id and print.card_number=s.card_number
    left join public.canonical_cards card on card.id=print.canonical_card_id
    where print.deleted_at is not null or card.id is null or card.deleted_at is not null
       or pg_catalog.normalize(card.name,'NFKC') <> pg_catalog.normalize(s.name,'NFKC')
  ) then raise exception 'Conflicting or deleted DM26-EX4 print; manual review required'; end if;
end $$;

insert into public.card_products(game_id,product_code,product_name,release_date,release_date_precision,official_url,source_checked_at)
select g.id, ${q(SET)}, ${q(productName)}, '2026-10-17'::date, 'day', ${q(PRODUCT_URL)}, now()
from public.tcg_games g where g.slug='duel-masters'
on conflict(game_id,product_code) do nothing;

-- Only create new canonical names; NEVER treat wiki names as official assertions or overwrite official fields.
insert into public.canonical_cards(game_id,name,source_name,source_name_kana,name_kana,cost,civilizations,card_types,source_checked_at)
select distinct on (pg_catalog.normalize(s.name,'NFKC')) g.id,s.name,s.name,null,null,null,'{}'::text[],'{}'::text[],null
from dm26ex4_preview s cross join public.tcg_games g where g.slug='duel-masters'
order by pg_catalog.normalize(s.name,'NFKC'),s.name collate "C"
on conflict(game_id,normalized_name_nfkc) where deleted_at is null do nothing;

-- Provisional prints have null official_card_id and null official_url by design.
insert into public.card_prints(canonical_card_id,official_card_id,card_number,product_name,official_url,source_checked_at,product_id)
select c.id,null,s.card_number,${q(productName)},null,null,p.id
from dm26ex4_preview s
cross join public.tcg_games g
join public.card_products p on p.game_id=g.id and p.product_code=${q(SET)}
join public.canonical_cards c on c.game_id=g.id and c.normalized_name_nfkc=pg_catalog.normalize(s.name,'NFKC') and c.deleted_at is null
where g.slug='duel-masters' and not exists(
  select 1 from public.card_prints old where old.product_id=p.id and old.card_number=s.card_number
)
on conflict do nothing;

-- Unverified card title search entry: never update existing official terms.
insert into public.card_search_terms(canonical_card_id,term,normalized_term,term_kind,source,verified,priority)
select distinct on (c.id,public.normalize_card_search(s.name)) c.id,s.name,
  public.normalize_card_search(s.name),'alias','dmwiki',false,40
from dm26ex4_preview s cross join public.tcg_games g
join public.canonical_cards c on c.game_id=g.id and c.normalized_name_nfkc=pg_catalog.normalize(s.name,'NFKC') and c.deleted_at is null
where g.slug='duel-masters' and public.normalize_card_search(s.name)<>''
order by c.id,public.normalize_card_search(s.name),s.name collate "C"
on conflict(canonical_card_id,normalized_term,term_kind) do nothing;
${fragments.length ? `
-- A reading may cover only a ruby fragment; never store it as the complete official name_kana.
create temporary table dm26ex4_readings(card_name text, reading text) on commit drop;
insert into dm26ex4_readings(card_name,reading) values ${readingValues};
insert into public.card_search_terms(canonical_card_id,term,normalized_term,term_kind,source,verified,priority)
select distinct on (c.id,public.normalize_card_search(r.reading)) c.id,r.reading,public.normalize_card_search(r.reading),
  'alias_reading','dmwiki',false,40
from dm26ex4_readings r cross join public.tcg_games g
join public.canonical_cards c on c.game_id=g.id and c.normalized_name_nfkc=pg_catalog.normalize(r.card_name,'NFKC') and c.deleted_at is null
where g.slug='duel-masters' and public.normalize_card_search(r.reading)<>''
order by c.id,public.normalize_card_search(r.reading),r.reading collate "C"
on conflict(canonical_card_id,normalized_term,term_kind) do nothing;
` : ''}
select count(*) as staged_previews from dm26ex4_preview;
commit;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv[2] ?? new URL('./dm26ex4-preview.json', import.meta.url);
  const output = process.argv[3] ?? new URL('./preview-import.sql', import.meta.url);
  const cards = JSON.parse(await readFile(source, 'utf8'));
  const sql = buildPreviewSql(cards);
  await writeFile(output, sql, 'utf8');
  console.log(`Prepared ${cards.cards.length} unverified DMwiki print records; SQL not applied.`);
}
