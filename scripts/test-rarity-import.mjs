import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {readMigration} from './test-support/card-search-db.mjs';
import {buildCanonicalImportSql} from './build-dm-card-import.mjs';
const db=new PGlite({extensions:{pg_trgm}});
try {
  await db.exec(`create schema extensions;create extension pg_trgm with schema extensions;
    create table tcg_games(id bigint primary key,slug text);insert into tcg_games values(1,'duel-masters');
    create table cards(id bigint primary key);`);
  const foundation=readMigration('20260717165209_canonical_card_foundation.sql');
  await db.exec(foundation.slice(foundation.indexOf('create table public.canonical_cards'),foundation.indexOf('-- One canonical row')));
  await db.exec(`alter table canonical_cards add column cost smallint,add column cost_is_infinite boolean default false,
    add column civilizations text[] default '{}',add column card_types text[] default '{}',add column races text[] default '{}',
    add column power_text text,add column power_value integer,
    add column normalized_name_nfkc text generated always as (normalize(name,NFKC)) stored;
    create unique index on canonical_cards(game_id,normalized_name_nfkc) where deleted_at is null;
    alter table card_prints add column card_texts text[] default '{}',add column rarity_codes text[],add column rarity_provenance jsonb;`);
  const normalize=readMigration('20260904145848_restore_nfkc_card_search_normalization.sql');await db.exec(normalize.slice(0,normalize.indexOf('$$;')+3));
  const card={name:'同名検証',name_kana:null,cost:3,cost_is_infinite:false,power_text:'1000',power_value:1000,
    civilizations:['fire'],card_types:['クリーチャー'],races:['テスト'],card_texts:['能力'],card_number:'DM-01 1',product_name:'商品A',
    rarity_codes:['C'],official_url:'https://dm.takaratomy.co.jp/card/detail/?id=rarity-import-a'};
  const cards=[card,{...card,rarity_codes:['SR'],card_number:'DM-02 1',product_name:'商品B',official_url:'https://dm.takaratomy.co.jp/card/detail/?id=rarity-import-b'},
    {...card,rarity_codes:['U','VIC'],official_url:'https://dm.takaratomy.co.jp/card/detail/?id=rarity-import-c'}];
  await db.exec(buildCanonicalImportSql(cards));
  const snapshot=(await db.query('select id,canonical_card_id,official_card_id,rarity_codes,rarity_provenance from card_prints order by id')).rows;
  assert.deepEqual(snapshot.map(r=>r.rarity_codes),[['C'],['SR'],['U','VIC']]);assert.equal(new Set(snapshot.map(r=>r.canonical_card_id)).size,1);
  await db.exec(buildCanonicalImportSql(cards));
  assert.deepEqual((await db.query('select id,canonical_card_id,official_card_id,rarity_codes,rarity_provenance from card_prints order by id')).rows,snapshot);
  await db.exec(buildCanonicalImportSql(cards.map(c=>({...c,rarity_codes:null}))));
  assert.deepEqual((await db.query('select id,canonical_card_id,official_card_id,rarity_codes,rarity_provenance from card_prints order by id')).rows,snapshot);
  await db.exec('update card_prints set manually_locked=true where id=1');
  await db.exec(buildCanonicalImportSql([{...card,rarity_codes:['R']}]));
  assert.deepEqual((await db.query('select rarity_codes from card_prints where id=1')).rows[0].rarity_codes,['C']);
  console.log('PASS: actual generated import SQL, same-name/different-print rarity, repeat IDs/provenance, absent metadata and manual lock preservation');
} finally {await db.close();}
