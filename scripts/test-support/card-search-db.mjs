import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
export const readMigration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
export async function createCardSearchDb() {
  const db = new PGlite({extensions:{pg_trgm}});
  await db.exec(`create schema private; create schema auth; create schema extensions;
    create extension pg_trgm with schema extensions;
    create role anon; create role authenticated; grant usage on schema private,auth,extensions to anon,authenticated;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table tcg_games(id bigint primary key,slug text,name text);
    create table canonical_cards(id bigint primary key,game_id bigint,name text,name_kana text,cost integer,civilizations text[],card_types text[],races text[],power_value integer,deleted_at timestamptz);
    create table card_products(id bigint primary key,release_date date);
    create table card_prints(id bigint primary key,canonical_card_id bigint,product_id bigint,product_name text,card_number text,image_key text,official_card_id text,card_texts text[],deleted_at timestamptz,
      card_number_search text generated always as(lower(card_number)) stored,product_name_search text generated always as(lower(product_name)) stored);
    create table card_search_terms(id bigint generated always as identity,canonical_card_id bigint,normalized_term text,term_kind text);
    create index on card_search_terms using gin(normalized_term extensions.gin_trgm_ops);
    create index on card_search_terms(canonical_card_id);
    create index on card_prints(canonical_card_id) where deleted_at is null;
    create table decks(id bigint primary key); create table deck_cards(deck_id bigint,canonical_card_id bigint,quantity integer);
    grant select on all tables in schema public to anon,authenticated;
    alter table canonical_cards enable row level security; create policy readable_cards on canonical_cards for select to anon,authenticated using(deleted_at is null and id<>999);
    alter table card_search_terms enable row level security; create policy readable_terms on card_search_terms for select to anon,authenticated using(canonical_card_id<>999);
    alter table card_prints enable row level security; create policy readable_prints on card_prints for select to anon,authenticated using(deleted_at is null);
    insert into tcg_games values(1,'duel-masters','デュエル・マスターズ'),(2,'other','他ゲーム');
    insert into canonical_cards values
      (1,1,'ゲート','ゲート',2,'{light}','{呪文}','{}',null,null),
      (2,1,'ゲート・テスト','ゲートテスト',3,'{fire}','{呪文}','{}',null,null),
      (3,1,'ヘブンズ・ゲート','ヘブンズゲート',6,'{light}','{呪文}','{}',null,null),
      (4,1,'テストゲート後半','テストゲートコウハン',5,'{water}','{クリーチャー}','{テスト種族}',5000,null),
      (5,2,'ヘブンズ・ゲート他TCG',null,1,'{}','{}','{}',null,null),
      (6,1,'削除ヘブンズ・ゲート',null,1,'{}','{}','{}',null,now()),
      (999,1,'非公開ヘブンズ・ゲート',null,1,'{}','{}','{}',null,null);
    insert into card_prints(id,canonical_card_id,product_name,card_number,image_key,card_texts) values
      (1,1,'商品A','DM-01 1','one','{ブロッカー}'),(2,2,'商品A','DM-01 2','two','{}'),
      (3,3,'天門商品','DM-02 3','three','{ブロッカー}'),(4,4,'商品B','DM-03 4','four','{}');`);
  const norm = readMigration('20260904145848_restore_nfkc_card_search_normalization.sql');
  await db.exec(norm.slice(0,norm.indexOf('$$;')+3));
  await db.exec(`insert into card_search_terms(canonical_card_id,normalized_term,term_kind)
    select id,normalize_card_search(name),'official_name' from canonical_cards;
    insert into card_search_terms(canonical_card_id,normalized_term,term_kind) values(3,normalize_card_search('天門'),'alias');`);
  const home = readMigration('20260923161835_add_home_market_search_rpc.sql');
  await db.exec(home.slice(0, home.indexOf('-- Keep the fuzzy cutoff')));
  await db.exec(readMigration('20260923145858_optimize_registration_long_search.sql'));
  await db.exec(readMigration('20260924185334_deck_market_search_first_response.sql'));
  await db.exec(readMigration('20261004193830_deck_search_metadata_filters_release.sql'));
  await db.exec(readMigration('20260906190323_optimize_card_image_search.sql'));
  return db;
}
