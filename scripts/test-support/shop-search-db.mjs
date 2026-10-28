import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const migration = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
export const shopSearchMigration = migration('20261027015613_shop_keyword_and_search.sql');
export async function createShopSearchDb(database) {
  const db = database ?? new PGlite();
  await db.exec(`do $$ begin create role anon; exception when duplicate_object then null; end $$; do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create table public.shops (id bigint primary key, name text not null, name_kana text,
      aliases text[] not null default '{}', prefecture text, municipality text,
      operational_status text not null default 'active');
    alter table public.shops enable row level security;
    create policy visible_shops on public.shops for select to anon, authenticated using (id <> 99);
    grant select on public.shops to anon, authenticated;`);
  await db.exec(migration('20260722141114_shop_search_nfkc_folding.sql'));
  const old = migration('20260811143349_prevent_shop_coverage_gaps.sql');
  await db.exec(old.slice(old.indexOf('create or replace function public.search_shops_by_prefecture('), old.indexOf('create function private.list_shop_details_page_for_admin(')));
  await db.exec(`revoke all on function public.search_shops_by_prefecture(text,text,integer) from public;
    grant execute on function public.search_shops_by_prefecture(text,text,integer) to anon,authenticated;
    create function public.search_shops(text default '', integer default 20) returns table(id bigint,name text)
      language sql stable security invoker set search_path='' as $$ select id,name from public.search_shops_by_prefecture($1,null,$2) $$;
    revoke all on function public.search_shops(text,integer) from public;
    grant execute on function public.search_shops(text,integer) to anon,authenticated;
    insert into public.shops (id,name,name_kana,aliases,prefecture,municipality,operational_status) values
    (1,'竜星のPAO横浜店','リュウセイノパオヨコハマテン',array['カード・ショップ','パオ'],'神奈川県','横浜市','active'),
    (2,'PAOテスト支店',null,array['別名マチダ'],'東京都','町田市','active'),
    (3,'PAO大阪店',null,'{}','大阪府','大阪市','active'),
    (4,'町田カードショップ',null,'{}','東京都','町田市','active'),
    (5,'PAO横浜閉店',null,'{}','神奈川県','横浜市','closed'),
    (99,'PAO横浜非公開',null,'{}','神奈川県','横浜市','active');`);
  return db;
}
