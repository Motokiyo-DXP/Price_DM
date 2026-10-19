import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = new URL("../supabase/migrations/20261016181706_shopping_list_sharing.sql", import.meta.url);
const owner = "10000000-0000-4000-8000-000000000001";
const friend = "10000000-0000-4000-8000-000000000002";
const stranger = "10000000-0000-4000-8000-000000000003";

// Real PostgreSQL roles, RLS, PL/pgSQL and privileges; no linked project or secrets.
export async function createShoppingTestDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
    create function auth.jwt() returns jsonb language sql stable as
      $$ select jsonb_build_object('session_id',nullif(current_setting('request.jwt.claim.session_id',true),'')) $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table public.canonical_cards(id bigint primary key, deleted_at timestamptz);
    create table public.profiles(user_id uuid primary key, display_name text);
    insert into auth.users values ('${owner}'),('${friend}'),('${stranger}');
    insert into auth.sessions(id,user_id) select id,id from auth.users;
    insert into public.profiles values ('${owner}','所有者'),('${friend}','フレンド'),('${stranger}','非許可ユーザー');
    insert into public.canonical_cards values (1,null),(2,null),(3,null);
  `);
  const friendships = await readFile(new URL("../supabase/migrations/20260903032638_add_user_friendships_and_friend_invites.sql", import.meta.url), "utf8");
  await db.exec(friendships.slice(0, friendships.indexOf("create or replace function")));
  await db.exec(await readFile(new URL("../supabase/migrations/20260904164036_add_account_card_bookmarks_and_shopping_list.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(migration, "utf8"));
  await db.exec(`insert into public.user_friendships(requester_user_id,addressee_user_id,status) values ('${owner}','${friend}','accepted');
    insert into public.account_card_bookmarks values ('${owner}',1,now()),('${owner}',2,now());`);
  return db;
}
export { owner, friend, stranger };
export async function asUser(db, user, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${user ? "authenticated" : "anon"}`);
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? ""]);
    await tx.query("select set_config('request.jwt.claim.session_id',$1,true)", [user ?? ""]);
    return (await tx.query(sql, params)).rows;
  });
}

// The exported harness is also used by the isolated HTTP/browser integration.
if (process.argv[1]?.endsWith("shopping-sharing-db.test.mjs")) {
  test("shopping sharing: PostgreSQL access control and bookmark source of truth", async (t) => {
    const db = await createShoppingTestDatabase();
    t.after(() => db.close());
    const call = (user, sql, params) => asUser(db, user, sql, params);
    const read = async (user, share = null, token = null) => (await call(user, "select public.read_shopping_list($1,$2) as ids", [share,token]))[0].ids;
    let share, token;
    await t.test("initial sharing is disabled and friendship alone grants no read", async () => {
      assert.deepEqual((await call(owner, "select public.shopping_share_settings() as settings"))[0].settings,{token:null,readers:[]});
      assert.deepEqual(await read(friend), []);
      await assert.rejects(() => read(null), /shopping_list_unavailable/);
      assert.deepEqual((await call(friend,"select * from public.shared_shopping_lists()")),[]);
    });
    await t.test("owner-only bookmark RLS remains unchanged", async () => {
      assert.equal((await call(friend,"select * from public.account_card_bookmarks")).length,0);
      assert.equal((await call(stranger,"delete from public.account_card_bookmarks returning *")).length,0);
      await assert.rejects(() => call(friend,"insert into public.account_card_bookmarks(user_id,canonical_card_id) values ($1,3)",[owner]), /row-level security/);
      await assert.rejects(() => call(null,"select * from public.account_card_bookmarks"), /permission denied/);
      await assert.rejects(() => call(friend,"select * from private.shopping_list_shares"), /permission denied/);
    });
    await t.test("explicit friend grant, discoverability, and nonfriend denial", async () => {
      await assert.rejects(() => call(owner,"select public.set_shopping_friend($1,true)",[stranger]), /friendship_required/);
      await call(owner,"select public.set_shopping_friend($1,true)",[friend]);
      const lists = await call(friend,"select * from public.shared_shopping_lists()");
      assert.equal(lists.length,1); share=lists[0].share_id;
      assert.deepEqual(Object.keys(lists[0]).sort(),["display_name","share_id"]);
      assert.deepEqual((await read(friend,share)).sort(),[1,2]);
      await assert.rejects(() => read(stranger,share), /shopping_list_unavailable/);
      await assert.rejects(() => read(null,share), /shopping_list_unavailable/);
    });
    await t.test("shared reader cannot edit owner bookmarks or settings", async () => {
      assert.equal((await call(friend,"delete from public.account_card_bookmarks where user_id=$1 returning *",[owner])).length,0);
      await call(friend,"select public.set_shopping_url(true)");
      assert.equal((await call(owner,"select public.shopping_share_settings() as s"))[0].s.token,null);
      assert.deepEqual((await read(owner)).sort(),[1,2]);
    });
    await t.test("anonymous random token reads only current card IDs", async () => {
      token=(await call(owner,"select public.set_shopping_url(true) as token"))[0].token;
      assert.match(token,/^[a-f0-9]{64}$/); assert.ok(!token.includes(owner));
      assert.deepEqual((await read(null,null,token)).sort(),[1,2]);
      await assert.rejects(() => read(null,null,"0".repeat(64)),/shopping_list_unavailable/);
      await assert.rejects(() => call(null,"select public.shopping_share_settings()"),/permission denied/);
      await assert.rejects(() => call(null,"select public.set_shopping_url(true)"),/permission denied/);
    });
    await t.test("favorite add/remove/clear updates original source for both sharing paths", async () => {
      await call(owner,"insert into public.account_card_bookmarks(user_id,canonical_card_id) values ($1,3)",[owner]);
      assert.deepEqual((await read(null,null,token)).sort(),[1,2,3]);
      assert.deepEqual((await read(friend,share)).sort(),[1,2,3]);
      await call(owner,"delete from public.account_card_bookmarks where canonical_card_id=1");
      assert.deepEqual((await read(null,null,token)).sort(),[2,3]);
      await call(owner,"delete from public.account_card_bookmarks");
      assert.deepEqual(await read(friend,share),[]);
      assert.deepEqual(await read(null,null,token),[]);
    });
    await t.test("URL disabling revokes immediately and re-enable never revives old token", async () => {
      await call(owner,"select public.set_shopping_url(false)");
      await assert.rejects(() => read(null,null,token),/shopping_list_unavailable/);
      const replacement=(await call(owner,"select public.set_shopping_url(true) as token"))[0].token;
      assert.notEqual(replacement,token);
      await assert.rejects(() => read(null,null,token),/shopping_list_unavailable/);
    });
    await t.test("friend unshare revokes immediately", async () => {
      await call(owner,"select public.set_shopping_friend($1,false)",[friend]);
      await assert.rejects(() => read(friend,share),/shopping_list_unavailable/);
      assert.deepEqual(await call(friend,"select * from public.shared_shopping_lists()"),[]);
    });
    await t.test("expired Auth sessions and signed-out JWTs cannot read or change sharing", async () => {
      await call(owner,"select public.set_shopping_friend($1,true)",[friend]);
      await db.query("update auth.sessions set not_after = now() - interval '1 second' where user_id=$1",[friend]);
      await assert.rejects(() => read(friend,share),/shopping_list_unavailable/);
      await assert.rejects(() => call(friend,"select public.set_shopping_url(true)"),/authentication_required/);
      await db.query("delete from auth.sessions where user_id=$1",[friend]);
      await assert.rejects(() => read(friend,share),/shopping_list_unavailable/);
      await assert.rejects(() => call(friend,"select public.set_shopping_friend($1,false)",[owner]),/authentication_required/);
      await db.query("insert into auth.sessions(id,user_id) values($1,$1)",[friend]);
    });
    await t.test("unfriend removes grant permanently, including re-friend", async () => {
      await call(owner,"select public.set_shopping_friend($1,true)",[friend]);
      await db.exec("delete from public.user_friendships");
      await assert.rejects(() => read(friend,share),/shopping_list_unavailable/);
      await db.query("insert into public.user_friendships(requester_user_id,addressee_user_id,status) values ($1,$2,'accepted')",[owner,friend]);
      await assert.rejects(() => read(friend,share),/shopping_list_unavailable/);
    });
  });
}
