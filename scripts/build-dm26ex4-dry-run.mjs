import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validatePreview } from './build-dm26ex4-preview.mjs';
const q = v => `'${String(v).replaceAll("'", "''")}'`;

// SELECT only: no inserts, sequence consumption, or temporary objects in production.
export function buildDryRunSql(raw) {
  const { cards, fragments } = validatePreview(raw);
  const values = cards.map(c => `(${q(c.dbNumber)},${q(c.name)})`).join(',\n');
  const terms = [...cards.map(c => [c.name,c.name,'alias']), ...fragments.map(f => [f.card_name,f.reading,'alias_reading'])];
  return `with s(number,name) as (values ${values}),
  g as (select id from public.tcg_games where slug='duel-masters'),
  names as (select distinct normalize(name,NFKC) name from s),
  terms(name,term,kind) as (values ${terms.map(t=>`(${t.map(q).join(',')})`).join(',')}),
  existing_cards as (select c.* from public.canonical_cards c join g on g.id=c.game_id
    where c.normalized_name_nfkc in (select name from names)),
  existing_prints as (select p.* from public.card_prints p
    where p.card_number in (select number from s) or p.product_id in
      (select id from public.card_products where product_code='DM26-EX4')),
  conflicts as (
    select 'ambiguous/deleted canonical name' reason,s.number from s join public.canonical_cards c
      on c.game_id=(select id from g) and public.normalize_card_search(c.name)=public.normalize_card_search(s.name)
      where c.deleted_at is not null or c.normalized_name_nfkc<>normalize(s.name,NFKC)
    union all select 'print mismatch/link/deletion',s.number from s join existing_prints p on p.card_number=s.number
      left join public.card_products product on product.id=p.product_id left join public.canonical_cards c on c.id=p.canonical_card_id
      where product.product_code is distinct from 'DM26-EX4' or p.deleted_at is not null or c.deleted_at is not null
        or c.normalized_name_nfkc is distinct from normalize(s.name,NFKC)
    union all select 'duplicate print',p.card_number from existing_prints p group by p.card_number having count(*)>1
    union all select 'product metadata mismatch','DM26-EX4' from public.card_products p where p.product_code='DM26-EX4'
      and (p.game_id is distinct from (select id from g) or p.product_name is distinct from ${q(raw.product.product_name)}
        or p.official_url is distinct from ${q(raw.product.official_url)} or p.release_date is distinct from ${q(raw.product.release_date)}::date
        or p.release_date_precision<>'day')
  )
  select jsonb_build_object(
    'product_add',(select case when count(*)=0 then 1 else 0 end from public.card_products where product_code='DM26-EX4'),
    'canonical_add',(select count(*) from names n where not exists(select 1 from existing_cards c where c.normalized_name_nfkc=n.name and c.deleted_at is null)),
    'canonical_reuse',(select count(*) from existing_cards where deleted_at is null),
    'print_add',(select count(*) from s where not exists(select 1 from existing_prints p where p.card_number=s.number)),
    'print_duplicate',(select count(*) from s where exists(select 1 from existing_prints p where p.card_number=s.number)),
    'updates',0,'official_products',1,'official_prints',0,'unverified_prints',${cards.length},'deferred',${raw.deferred_review?.length ?? 0},
    'search_term_add',(select count(*) from (select distinct normalize(t.name,NFKC),public.normalize_card_search(t.term),t.kind from terms t
      where not exists(select 1 from existing_cards c join public.card_search_terms old on old.canonical_card_id=c.id
        where c.normalized_name_nfkc=normalize(t.name,NFKC) and old.normalized_term=public.normalize_card_search(t.term) and old.term_kind=t.kind)) added),
    'conflicts',(select coalesce(jsonb_agg(to_jsonb(conflicts)),'[]') from conflicts),
    'existing_cards',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from existing_cards c),
    'existing_prints',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from existing_prints p),
    'existing_products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from public.card_products p where product_code='DM26-EX4'),
    'existing_terms',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.card_search_terms t where t.canonical_card_id in (select id from existing_cards))
  ) report;`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raw = JSON.parse(await readFile(process.argv[2] ?? new URL('./dm26ex4-preview.json',import.meta.url),'utf8'));
  await writeFile(process.argv[3] ?? '.local/dm26ex4-dry-run.sql',buildDryRunSql(raw));
  console.log('Prepared read-only dry-run SQL; not executed.');
}
