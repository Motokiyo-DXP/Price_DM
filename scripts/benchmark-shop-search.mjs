import { createShopSearchDb, shopSearchMigration } from './test-support/shop-search-db.mjs';

// Isolated SQL benchmark; never connects to Supabase or reads project credentials.
const db = await createShopSearchDb();
try {
  await db.exec(`
    insert into shops(id, name, name_kana, aliases, prefecture, municipality)
    select 1000+n, 'カードショップ検証'||n, 'カードショップケンショウ'||n,
      array['トレカテスト'||n], '東京都', '検証市'
    from generate_series(1, 3000) n;
  `);
  async function measure() {
    const results = {};
    for (const query of ['PAO', 'PAO 横浜', '竜星 横浜', '検証']) {
      const times = [];
      for (let iteration = 0; iteration < 5; iteration++) {
        const started = performance.now();
        await db.query('select * from search_shops_page($1, null, 20, 0)', [query]);
        times.push(performance.now() - started);
      }
      results[query] = Number(times.sort((a, b) => a - b)[2].toFixed(1));
    }
    return results;
  }
  console.log('before (median ms)', await measure());
  await db.exec(shopSearchMigration);
  console.log('after (median ms)', await measure());
} finally {
  await db.close();
}
