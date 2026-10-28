import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createShopSearchDb, shopSearchMigration } from '../scripts/test-support/shop-search-db.mjs';
import { normalizeShopSearchQuery } from './search-normalization.ts';

test('keyword boundaries survive client normalization and both RPC paths', () => {
  for (const query of ['PAO 横浜', 'ＰＡＯ　横浜', ' PAO   横浜 ']) assert.equal(normalizeShopSearchQuery(query), 'pao 横浜');
  assert.notEqual(normalizeShopSearchQuery('PAO横浜'), normalizeShopSearchQuery('PAO 横浜'));
  assert.equal(normalizeShopSearchQuery('カード・ショップ パオ'), 'かどしょっぷ ぱお');
  const page = readFileSync(new URL('../app/register/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /normalizedShopQuery = normalizeShopSearchQuery\(shopQuery\)/);
  assert.match(page, /p_query: normalizeShopSearchQuery\(query\)/);
  assert.match(page, /p_query: normalizeShopSearchQuery\(shopQuery.trim\(\)\)/);
});

test('real SQL: AND, infix, cross-field, normalization, pagination, RLS and ACL', async (t) => {
  const db = await createShopSearchDb(); t.after(() => db.close());
  const search = async (q, pref = null, limit = 100, offset = 0) => (await db.query('select * from public.search_shops_page($1,$2,$3,$4)', [q,pref,limit,offset])).rows;
  await db.exec('set role anon');
  const singleBefore = await search('PAO');
  const before = await search('PAO 横浜');
  assert.equal(before.length, 1); // contiguous PAO横浜 still works
  assert.equal((await search('竜星 横浜')).length, 0);
  assert.equal((await search('PAO 町田')).length, 0);
  await db.exec('reset role');
  const aclBefore = (await db.query("select proname,proacl::text,prosecdef from pg_proc where proname in ('search_shops','search_shops_page','search_shops_by_prefecture') order by proname")).rows;
  await db.exec(shopSearchMigration);
  assert.deepEqual((await db.query("select proname,proacl::text,prosecdef from pg_proc where proname in ('search_shops','search_shops_page','search_shops_by_prefecture') order by proname")).rows, aclBefore);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    const ids = async (q,pref) => (await search(q,pref)).map(r => Number(r.id));
    for (const q of ['PAO 横浜', '横浜 PAO', 'ＰＡＯ　横浜', '  PAO   横浜 ', '竜星 横浜', '竜星 PAO', 'パオ 横浜', 'ぱお 横浜', 'PAO PAO 横浜']) assert.deepEqual(await ids(q), [1], q);
    for (const q of ['PAO 町田','町田 PAO','PAO 別名マチダ']) assert.deepEqual(await ids(q), [2], q);
    assert.deepEqual(await ids('カード ショップ'), [4,1]);
    assert.deepEqual(await search('PAO'), singleBefore);
    assert.deepEqual(await ids('町田'), [4,2]);
    assert.deepEqual(await ids('PAO 町田 横浜'), []);
    assert.deepEqual(await ids('PAO','東京都'), [2]);
    assert.deepEqual(await ids('PAO 横浜','東京都'), []);
    assert.deepEqual(await ids('%'), []); // literal input must not become SQL wildcards
    const all = await search('');
    const paged = [];
    for(let offset=0;offset<all.length;offset++) { const rows=await search('',null,1,offset); assert.equal(Number(rows[0].total_count),4); paged.push(...rows); }
    assert.deepEqual(paged,all);
    assert.deepEqual(await search('',null,20,100),[]);
    for (const rpc of ['search_shops','search_shops_by_prefecture']) {
      const args = rpc==='search_shops' ? ['$1,$2',['PAO 町田',100]] : ['$1,$2,$3',['PAO 町田',null,100]];
      assert.deepEqual((await db.query(`select id from public.${rpc}(${args[0]})`,args[1])).rows.map(r=>Number(r.id)),[2]);
    }
    await db.exec('reset role');
  }
  // A missing master entry is still a valid zero-result search.
  await db.exec('delete from shops where id=2; set role anon');
  assert.deepEqual(await search('PAO 町田'),[]);
  await db.exec('reset role');
  // Stored search text is maintained on every master-data edit.
  await db.query('update shops set name=$1, name_kana=$2, aliases=$3, municipality=$4 where id=3', ['更新店舗','コウシンヨミ',['更新別名'],'更新市']);
  assert.equal((await search('こうしんよみ 更新市')).length, 1);
  assert.equal((await search('更新別名 更新店舗')).length, 1);
  assert.deepEqual(await search('PAO 大阪'), []);
  // Field and alias boundaries must not accidentally create a contiguous keyword.
  assert.deepEqual(await search('更新店舗こうしん'), []);
  const manifest = JSON.parse(readFileSync(new URL('../data/shop-manifests/yellow-submarine.json', import.meta.url), 'utf8'));
  const shop = manifest.stores.find(s => s.name === 'イエローサブマリン 秋葉原本店★ミント');
  assert.ok(shop);
  await db.query('insert into shops(id,name,prefecture,municipality) values(100,$1,$2,$3)', [shop.name,shop.prefecture,shop.municipality]);
  await db.exec('set role anon');
  assert.deepEqual((await search('ミント 秋葉原')).map(r => Number(r.id)),[100]);
  assert.deepEqual((await search('千代田 ミント')).map(r => Number(r.id)),[100]);
});

