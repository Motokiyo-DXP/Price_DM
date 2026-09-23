import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(
  new URL("supabase/migrations/20260923153810_secure_registration_recent_shop_history.sql", root),
  "utf8",
);
const route = await readFile(new URL("app/api/price-records/route.ts", root), "utf8");
const page = await readFile(new URL("app/register/page.tsx", root), "utf8");
const css = await readFile(new URL("app/globals.css", root), "utf8");

test("recent shop writes are restricted to the registration executor", () => {
  assert.match(migration, /drop policy if exists account_recent_registration_shops_insert_own/);
  assert.match(migration, /drop policy if exists account_recent_registration_shops_update_own/);
  assert.match(migration, /revoke insert, update on table public\.account_recent_registration_shops\s+from anon, authenticated/s);
  assert.match(migration, /for select to price_registration_executor\s+using \(true\)/);
  assert.match(migration, /for insert to price_registration_executor\s+with check \(true\)/);
  assert.match(migration, /for update to price_registration_executor\s+using \(true\)\s+with check \(true\)/);
  assert.match(migration, /revoke all on function public\.record_recent_registration_shop\(bigint\)\s+from public, anon, authenticated, service_role/s);
});

test("history is updated only after a positive record id using signed request identity", () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /owner to price_registration_executor/);
  assert.ok(migration.indexOf("if v_record_id is null or v_record_id <= 0") < migration.indexOf("insert into public.account_recent_registration_shops"));
  assert.match(migration, /current_setting\('request\.jwt\.claim\.sub'/);
  assert.match(migration, /current_setting\('request\.jwt\.claims'/);
  assert.match(migration, /on conflict \(user_id, shop_id\) do update/);
  assert.match(migration, /exception when others then\s+raise log/s);
});

test("API submits with authenticated cookies and reloads history without a separate write RPC", () => {
  assert.match(route, /authSupabase\.auth\.getClaims\(\)/);
  assert.match(route, /authSupabase\.rpc\(\s*"submit_price_record_session_v3"/);
  assert.match(route, /authSupabase\.rpc\(\s*"list_recent_registration_shops"/);
  assert.doesNotMatch(route, /record_recent_registration_shop/);
});

test("recent shortcuts remain rendered during suggestions and the shop list follows them in document flow", () => {
  assert.match(page, /recentRegistrationShops\.length > 0;\s*\n\s*return \(/);
  assert.doesNotMatch(page, /recentRegistrationShops\.length > 0 && !showShopSuggestions/);
  assert.match(css, /\.shop-combobox \.suggestions\{position:relative;top:auto\}/);
});
