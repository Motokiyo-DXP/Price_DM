import assert from 'node:assert/strict';
import test from 'node:test';
import { createCardSearchDb, readMigration } from '../scripts/test-support/card-search-db.mjs';
import { normalizeCardSearchQuery } from './search-normalization.ts';

test('client query keys preserve spaces without changing existing normalization', () => {
  assert.equal(normalizeCardSearchQuery(' ヘブンズ　 ゲート '), 'へぶんず げーと');
  assert.notEqual(normalizeCardSearchQuery('ヘブンズゲート'), normalizeCardSearchQuery('ヘブンズ ゲート'));
  assert.equal(normalizeCardSearchQuery('ＧＡＴＥ ゲート'), 'gate げーと');
});

test('actual SQL reproduces and repairs long-vowel routing, AND, rank, filters, ACL, RLS and paging', async t => {
  const db=await createCardSearchDb(); t.after(()=>db.close());
  const rpc=async(name,q,limit=100,offset=0)=>(await db.query(`select id,name from ${name}($1,'duel-masters',$2,'broad'${name.endsWith('_page')?',$3':''})`,name.endsWith('_page')?[q,limit,offset]:[q,limit])).rows;
  await db.exec('set role anon');
  const before={};
  const compatibilityQueries=['ゲ','ヘブ','ヘブンズ','DM','DM-02','商品','商品B','天門','RP3','???'];
  const compatibility=new Map();
  for(const name of ['search_market_cards','search_registration_cards']) {
    before[name]=await rpc(name,'ヘブンズ');
    for(const query of compatibilityQueries) compatibility.set(name+query,await rpc(name,query));
    assert.deepEqual((await rpc(name,'ゲート')).map(r=>Number(r.id)),[1,2]);
    assert.deepEqual(await rpc(name,'ゲート ヘブンズ'),[]);
  }
  await db.exec('reset role');
  const oldAcl=(await db.query("select n.nspname,p.proname,p.proacl::text,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('search_market_cards','search_registration_cards','search_canonical_cards','search_deck_cards_filtered','search_deck_cards_filtered_fast_impl') order by 1,2")).rows;
  await db.exec(readMigration('20261028040039_card_keyword_infix_search.sql'));
  assert.deepEqual((await db.query("select n.nspname,p.proname,p.proacl::text,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('search_market_cards','search_registration_cards','search_canonical_cards','search_deck_cards_filtered','search_deck_cards_filtered_fast_impl') order by 1,2")).rows,oldAcl);
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    for(const name of ['search_market_cards','search_registration_cards']) for(const query of compatibilityQueries) assert.deepEqual(await rpc(name,query),compatibility.get(name+query),name+query);
    for(const name of ['search_market_cards','search_registration_cards','search_canonical_cards','search_market_cards_page','search_registration_cards_page']) {
      const ids=async(q)=>(await rpc(name,q)).map(r=>Number(r.id));
      assert.deepEqual(await ids('ゲート'),[1,2,3,4],name);
      for(const q of ['ヘブンズ ゲート','ゲート ヘブンズ','ヘブンズ　ゲート','  ヘブンズ   ゲート ','ﾍﾌﾞﾝｽﾞ ｹﾞｰﾄ','天門 ゲート']) assert.deepEqual(await ids(q),[3],name+q);
      if(name !== 'search_canonical_cards') {
        assert.deepEqual(await ids('ゲ'),[1,2]);
        assert.deepEqual(await ids('ゲー'),[1,2]);
      }
      assert.deepEqual(await ids('ヘブ'),[3]);
      assert.deepEqual(await ids('ヘブンズ'),[3]);
      assert.deepEqual(await ids('存在しない文字列'),[]);
      assert.deepEqual(await ids('ヘブンズ 大阪'),[]);
      assert.deepEqual(await ids('ゲート テスト'),await ids('テスト ゲート'));
      assert.deepEqual(new Set(await ids('ゲート テスト')),new Set([2,4]));
      assert.deepEqual(await ids('DM-02 ヘブンズ'),[3]);
      assert.deepEqual(await ids('商品B'),[4]);
      assert.deepEqual(await ids('ヘブンズゲートト'),[3]);
      assert.deepEqual((await db.query(`select id from ${name}($1,'duel-masters',100,'precise')`,['ヘブンズゲートト'])).rows, []);
      assert.deepEqual((await db.query(`select id from ${name}($1,'duel-masters',100,'precise')`,['ゲート'])).rows.map(r=>Number(r.id)), [1,2,3,4]);
    }
    await db.exec('reset role');
  }
  await db.exec(`insert into canonical_cards(id,game_id,name,name_kana,cost,civilizations,card_types,races,power_value)
    select 100+n,1,'ゲート前方候補'||lpad(n::text,3,'0'),null,3,'{fire}','{呪文}','{}',null from generate_series(1,120)n;
    insert into card_search_terms(canonical_card_id,normalized_term,term_kind) select id,normalize_card_search(name),'official_name' from canonical_cards where id>100 and id<999;
    set role anon;`);
  for(const [name,size] of [['search_market_cards_page',100],['search_registration_cards_page',30]]) {
    const rows=[];for(let offset=0;offset<200;offset+=size){const page=await rpc(name,'ゲート',size,offset);rows.push(...page);if(page.length<size)break;}
    assert.equal(rows.length,124);assert.equal(new Set(rows.map(r=>r.id)).size,124);
    assert.ok(rows.some(r=>Number(r.id)===3),'contains survives more than 100 prefix hits');
    assert.deepEqual(rows.slice(-2).map(r=>Number(r.id)),[3,4]);
  }
  await db.exec("reset role;set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'");
  const deck=async(args='')=>(await db.query(`select id from search_deck_cards_filtered(p_query=>'ゲート',p_sort=>'relevance',p_ascending=>true${args})`)).rows.map(r=>Number(r.id));
  assert.deepEqual(await deck(",p_civilizations=>array['water'],p_card_types=>array['クリーチャー'],p_min_power=>4000,p_race_tokens=>array['テスト種族']"),[4]);
  assert.deepEqual(await deck(",p_min_cost=>6,p_card_text_query=>'ブロッカー',p_card_number=>'DM-02',p_product_name=>'天門商品',p_image=>'with'"),[3]);
  const reversed=await db.query("select id from search_deck_cards_filtered(p_query=>'ゲート ヘブンズ',p_sort=>'relevance',p_ascending=>true,p_max_cost=>6)");
  assert.ok(reversed.rows.some(r=>Number(r.id)===3));
  await db.exec(`reset role;insert into canonical_cards(id,game_id,name,cost_is_infinite,power_text,civilizations,card_types,races) values(7,1,'無限検証',true,'∞','{light}','{呪文}','{}');
    insert into card_search_terms(canonical_card_id,normalized_term,term_kind) values(7,normalize_card_search('無限検証'),'official_name');set role authenticated;`);
  for(const [bounds,expected] of [["p_min_cost=>99,p_min_power=>99999",[7]],["p_max_cost=>99",[]],["p_max_power=>99999",[]]]) {
    assert.deepEqual((await db.query(`select id from search_deck_cards_filtered(p_query=>'無限',${bounds})`)).rows.map(r=>Number(r.id)),expected);
  }
  const deckPages=[];for(let offset=0;offset<150;offset+=30) deckPages.push(...await deck(`,p_limit=>30,p_offset=>${offset}`));
  assert.equal(new Set(deckPages).size,125);assert.ok(deckPages.includes(3));
  await db.exec("reset role;set role anon");
  await assert.rejects(()=>db.query("select * from search_deck_cards_filtered(p_query=>'ゲート')"),/permission denied/);
  await db.exec("reset role;set role authenticated;set request.jwt.claim.sub=''");
  await assert.rejects(()=>db.query("select * from search_deck_cards_filtered(p_query=>'ゲート')"),/Authentication required/);
});
