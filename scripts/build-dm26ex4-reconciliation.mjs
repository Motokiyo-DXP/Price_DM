import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const sqlQuote = v => v == null ? 'null' : `'${String(v).replaceAll("'", "''")}'`;
const CODE='DM26-EX4';

export function officialCardId(officialUrl) {
  try {
    const url=new URL(officialUrl);
    if (url.protocol!=='https:' || url.hostname!=='dm.takaratomy.co.jp' || url.pathname!=='/card/detail/') return null;
    const match=url.search.match(/[?&]id=([^&]+)/u);
    const id=match ? decodeURIComponent(match[1]) : null;
    return id && /^dm26ex4-[a-z0-9_+\-$]+$/iu.test(id) ? id : null;
  } catch { return null; }
}

export function filterOfficialCards(rows) {
  const seenIds=new Set(), seenNumbers=new Set(), output=[];
  for (const record of rows) {
    if (typeof record?.card_number!=='string' || !/^DM26EX4\s+/iu.test(record.card_number)) continue;
    const id=officialCardId(record.official_url);
    const name=record.name?.trim();
    const number=record.card_number.trim().replace(/^DM26EX4\s+/iu,'DM26EX4 ');
    if (!id || !name) throw new Error(`Official card record has no valid detail URL/name: ${number}`);
    if (seenIds.has(id.toLowerCase()) || seenNumbers.has(number)) throw new Error(`Ambiguous duplicate official card record: ${number}`);
    seenIds.add(id.toLowerCase()); seenNumbers.add(number);
    output.push({official_card_id:id, card_number:number,name,official_url:record.official_url});
  }
  if (!output.length) throw new Error('No matching official DM26-EX4 card details in the input. Refusing to generate an empty update.');
  return output;
}

export function buildReconciliationSql(officialCards) {
  const values=officialCards.map(r=>`(${sqlQuote(r.official_card_id)},${sqlQuote(r.card_number)},${sqlQuote(r.name)},${sqlQuote(r.official_url)})`).join(',\n');
  return `-- Run BEFORE scripts/build-dm-card-import.mjs for DM26-EX4 once official detail data exists.
-- This upgrades a matching provisional print in-place so price/deck references keep their IDs.
-- Unmatched official prints must be inserted by the existing full catalog importer.
begin;
set local lock_timeout='5s';
lock table public.card_products, public.canonical_cards, public.card_prints in share row exclusive mode;
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dm26ex4-provisional',0));
create temporary table dm26ex4_official(official_id text primary key,card_number text unique not null,name text not null,official_url text not null) on commit drop;
insert into dm26ex4_official values
${values};

do $$ begin
  if exists(
    select 1 from dm26ex4_official s
    join public.card_products product on product.product_code='${CODE}'
    join public.card_prints p on p.product_id=product.id and p.card_number=s.card_number
    join public.canonical_cards c on c.id=p.canonical_card_id
    where p.manually_locked or c.manually_locked or p.deleted_at is not null or c.deleted_at is not null or c.normalized_name_nfkc<>pg_catalog.normalize(s.name,'NFKC')
       or (p.official_card_id is not null and lower(p.official_card_id)<>lower(s.official_id))
  ) then raise exception 'Official/provisional mismatch or locked print; inspect affected numbers before proceeding'; end if;
  if exists(
    select 1 from dm26ex4_official s
    join public.card_products product on product.product_code='${CODE}'
    join public.card_prints p on p.product_id=product.id and p.card_number=s.card_number and p.deleted_at is null
    join public.card_prints other on lower(other.official_card_id)=lower(s.official_id) and other.deleted_at is null and other.id<>p.id
  ) then raise exception 'Another print already has this official ID. Deduplicate manually; never delete by default'; end if;
  if exists(select 1 from dm26ex4_official s join public.card_prints p on p.card_number=s.card_number
    left join public.card_products product on product.id=p.product_id where product.product_code is distinct from '${CODE}') then
    raise exception 'Unlinked official/provisional print; manual review required'; end if;
  if exists(select 1 from dm26ex4_official s join public.card_products product on product.product_code='${CODE}'
    join public.card_prints p on p.product_id=product.id and p.card_number=s.card_number
    group by s.card_number having count(*)>1) then raise exception 'Duplicate provisional print; manual review required'; end if;
end $$;

update public.card_prints p set official_card_id=s.official_id,official_url=s.official_url,
  source_checked_at=now(),updated_at=now()
from dm26ex4_official s join public.card_products product on product.product_code='${CODE}'
where p.product_id=product.id and p.card_number=s.card_number and p.deleted_at is null
  and p.official_card_id is null and not p.manually_locked;
select count(*) as source_official_records from dm26ex4_official;
commit;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input,output]=process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node build-dm26ex4-reconciliation.mjs <official-full-catalog.jsonl> <output.sql>');
  const rows=(await readFile(input,'utf8')).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
  const cards=filterOfficialCards(rows);
  await writeFile(output,buildReconciliationSql(cards),'utf8');
  console.log(`Prepared ${cards.length} official ID reconciliation entries. SQL not applied.`);
}
