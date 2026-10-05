import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Disposable PostgreSQL: no production credentials, linked project or host port.
const container = `price-dm-out-of-stock-${process.pid}`;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const migration = read("supabase/migrations/20261005024359_allow_out_of_stock_without_prices.sql");
function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
const sql = (input) => docker(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], input);
const functionSql = (source) => source.match(/create or replace function private\.submit_price_record_session_v3_impl[\s\S]*?\$\$;/u)[0];
const oldFunction = functionSql(read("supabase/migrations/20260808023236_fix_canonical_price_registration.sql"));
assert.equal(functionSql(migration), oldFunction.replace(
  "if p_sale_price is null and p_buy_price is null then",
  "if p_sale_price is null and p_buy_price is null\n     and coalesce(p_stock_status, 'unknown'::public.stock_status) <> 'out_of_stock'::public.stock_status then",
), "RPC changes only the price-required condition");
assert.doesNotMatch(migration, /create\s+(?:type|table)|add\s+(?:column|value)|update\s+public\.price_records/iu);

try {
  docker(["run", "-d", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]);
  for (let attempt = 0; attempt < 80; attempt++) {
    if (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"]).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  sql(`create role anon; create role authenticated; create role service_role;
    create role price_registration_executor;
    create schema private authorization price_registration_executor;
    create schema extensions; create extension pgcrypto with schema extensions;`);
  sql(read("supabase/migrations/20260717054158_initial_tcg_price_schema.sql"));
  sql(`
    create table canonical_cards(id bigint primary key, game_id bigint, name text,
      name_kana text, aliases text[], aliases_kana text[], deleted_at timestamptz);
    create table card_prints(id bigint primary key, canonical_card_id bigint, deleted_at timestamptz);
    alter table price_records alter column card_id drop not null;
    alter table price_records add column canonical_card_id bigint references canonical_cards(id),
      add column card_print_id bigint references card_prints(id), add column deleted_at timestamptz;
    create table price_attributes(id bigint primary key, slug text, deleted_at timestamptz, approval_status text);
    create table price_attribute_implications(attribute_id bigint, implied_attribute_id bigint);
    create table price_record_attributes(price_record_id bigint, attribute_id bigint, unique(price_record_id, attribute_id));
    create table private.registration_sessions(token_hash bytea primary key, expires_at timestamptz,
      usage_window_started_at timestamptz default now(), usage_count integer default 0, last_used_at timestamptz);
    create table private.registration_security_config(id boolean primary key, rate_limit_hmac_key bytea);
    create table private.registration_rate_limits(scope text, subject_hash bytea, action text,
      window_started_at timestamptz, attempt_count integer, blocked_until timestamptz, updated_at timestamptz,
      unique(scope,subject_hash,action));
    grant usage on schema public,extensions to price_registration_executor;
    grant select,insert,update on all tables in schema private to price_registration_executor;
    grant select on all tables in schema public to price_registration_executor;
    grant insert on price_records,price_record_attributes to price_registration_executor;
    grant usage,select on all sequences in schema public to price_registration_executor;
    create policy registration_insert on price_records for insert to price_registration_executor with check(true);
    create policy registration_read on price_records for select to price_registration_executor using(true);
    create policy registration_shop_read on shops for select to price_registration_executor using(true);
    insert into canonical_cards values(1,1,'検証カード',null,'{}','{}',null),(2,1,'在庫のみ',null,'{}','{}',null);
    insert into shops(name) values('検証店舗A'),('検証店舗B');
    insert into private.registration_security_config values(true,extensions.gen_random_bytes(32));
    insert into private.registration_sessions(token_hash,expires_at)
      values(extensions.digest('local-stock-test','sha256'),now()+interval '1 hour');
    insert into price_records(canonical_card_id,shop_id,sale_price,buy_price,stock_status,observed_on)
      values(1,1,980,400,'in_stock',current_date-1),(1,2,1200,500,'in_stock',current_date);
  `);
  sql(`grant price_registration_executor to postgres with set true; set role price_registration_executor; ${oldFunction}
    set role postgres; revoke price_registration_executor from postgres granted by postgres;`);
  sql(migration);
  const summary = read("supabase/migrations/20260717182317_canonical_market_details.sql");
  sql(summary.slice(0, summary.indexOf("create or replace function public.get_canonical_card_best_prices")));
  const call = (args) => sql(`select private.submit_price_record_session_v3_impl('local-stock-test',${args});`).trim();
  const recordId = Number(call("1,1,p_stock_status=>'out_of_stock'"));
  assert.ok(recordId > 0, `RPC returned ${recordId}`);
  assert.equal(sql(`select sale_price is null and buy_price is null and stock_status='out_of_stock' from price_records where id=${recordId};`).trim(), "t");
  assert.equal(sql("select sale_price||','||buy_price||','||sale_record_count||','||buy_record_count||','||stock_status from canonical_card_market_summary where canonical_card_id=1;").trim(), "1200,500,1,1,out_of_stock");
  assert.equal(sql("select sale_price||','||buy_price from price_records where canonical_card_id=1 and observed_on=current_date-1;").trim(), "980,400", "previous prices stay unchanged");
  assert.equal(sql("select sale_price||','||buy_price||','||sale_record_count||','||buy_record_count from get_canonical_card_price_history(1) where observed_on=current_date;").trim(), "1200,500,1,1");
  call("2,1,p_stock_status=>'out_of_stock'");
  assert.equal(sql("select sale_price is null and buy_price is null and sale_record_count=0 and buy_record_count=0 and stock_status='out_of_stock' and last_observed_on=current_date from canonical_card_market_summary where canonical_card_id=2;").trim(), "t", "stock-only card remains visible and latest state updates");
  for (const stock of ["'unknown'", "null", "'in_stock'"]) {
    sql(`do $$ begin
      perform private.submit_price_record_session_v3_impl('local-stock-test',1,1,p_stock_status=>${stock});
      raise exception 'unexpected success';
    exception when raise_exception then
      if sqlerrm <> 'at_least_one_price_required' then raise; end if;
    end $$;`);
  }
  for (const price of [980, 0]) {
    const id = Number(call(`1,1,p_sale_price=>${price},p_stock_status=>'out_of_stock'`));
    assert.equal(sql(`select sale_price=${price} and buy_price is null and stock_status='out_of_stock' from price_records where id=${id};`).trim(), "t");
  }
  sql(`do $$ begin
    insert into price_records(canonical_card_id,shop_id,stock_status) values(1,1,'unknown');
    raise exception 'constraint accepted no price';
  exception when check_violation then null; end $$;`);
  assert.equal(sql("select enum_range(null::stock_status);").trim(), "{in_stock,low_stock,out_of_stock,unknown,buying,buying_paused}");
  assert.equal(sql("select proowner::regrole from pg_proc where oid='private.submit_price_record_session_v3_impl(text,bigint,bigint,bigint,integer,integer,stock_status,date,text,text,text[])'::regprocedure;").trim(), "price_registration_executor");
  console.log("PASS: stock-only/980/0 RPC, NULL/unknown rejection, CHECK, existing enum/owner, NULL-safe summary/history and retained previous prices");
} finally {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
