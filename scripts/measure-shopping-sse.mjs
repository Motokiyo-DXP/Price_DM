// Opt-in integration check against a synthetic-data-only cloud project.
// Run with the existing Supabase CLI login, and Vercel env run for a Preview.
import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const state = JSON.parse(await fs.readFile(process.env.SHOPPING_CLOUD_STATE, "utf8"));
assert.match(state.ref, /^[a-z]{20}$/);
assert.notEqual(state.ref, "fxhlobydispnbywxhirn", "Production forbidden");
assert.equal(state.url, `https://${state.ref}.supabase.co`);
const base = new URL(process.env.SHOPPING_CLOUD_BASE_URL || "http://127.0.0.1:3000");
assert.notEqual(base.hostname, "dm-price-tracker.vercel.app", "Production forbidden");
const isPreview = base.hostname.endsWith(".vercel.app");
assert.ok(isPreview || ["127.0.0.1", "localhost"].includes(base.hostname));
const headers = isPreview ? { "x-vercel-trusted-oidc-idp-token": process.env.VERCEL_OIDC_TOKEN } : {};
if (isPreview) assert.ok(headers["x-vercel-trusted-oidc-idp-token"], "Use Vercel env run");
const db = createClient(state.url, state.publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (result) => { if (result.error) throw result.error; return result.data; };
ok(await db.auth.signInWithPassword({ email: state.users.owner.email, password: state.users.owner.password }));
// Revoke any orphan test streams before measuring this run's own connections.
ok(await db.auth.signOut({ scope: "global" }));
ok(await db.auth.signInWithPassword({ email: state.users.owner.email, password: state.users.owner.password }));
for (const card of state.cards.slice(0, 2)) ok(await db.from("account_card_bookmarks").upsert(
  { user_id: state.users.owner.id, canonical_card_id: card.id },
  { onConflict: "user_id,canonical_card_id", ignoreDuplicates: true },
));
const token = ok(await db.rpc("set_shopping_url", { p_enabled: true }));
const endpoint = new URL("/api/shopping-list/live", base); endpoint.searchParams.set("token", token);
await fs.mkdir(".local/cloud-validation", { recursive: true });
await fs.writeFile(".local/cloud-validation/sse-stats.sql", `select
  coalesce(sum(calls) filter(where query like '%read_shopping_list%'),0)::bigint as read_calls,
  coalesce(sum(calls),0)::bigint as api_calls,coalesce(sum(total_exec_time),0) as exec_ms
  from extensions.pg_stat_statements where query like 'WITH pgrst_source%';`);
function stats() {
  const command = `npx --yes supabase db query --linked --project-ref ${state.ref} --file .local/cloud-validation/sse-stats.sql`;
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], { encoding: "utf8" })
    : spawnSync("npx", ["--yes", "supabase", "db", "query", "--linked", "--project-ref", state.ref, "--file", ".local/cloud-validation/sse-stats.sql"], { encoding: "utf8" });
  if (result.status !== 0) throw Error("Isolated statistics query failed");
  return JSON.parse(result.stdout).rows[0];
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function bounded(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error("SSE deadline exceeded")), ms); })]); }
  finally { clearTimeout(timer); }
}
function open() {
  const abort = new AbortController(); const started = performance.now();
  let resolve, reject;
  const ready = new Promise((r, j) => { resolve = r; reject = j; });
  const done = (async () => {
    try {
      const response = await fetch(endpoint, { signal: abort.signal, headers, redirect: "error" });
      assert.equal(response.status, 200);
      let buffer = "";
      for await (const chunk of response.body) {
        buffer += Buffer.from(chunk).toString();
        if (buffer.includes("event: snapshot")) resolve();
        if (buffer.includes("event: unavailable")) reject(Error("Shared list unavailable"));
        if (buffer.includes("\n\n")) buffer = "";
      }
    } catch (error) { if (error.name !== "AbortError") reject(error); }
    finally { reject(Error("Closed before initial snapshot")); }
  })();
  return { abort, ready, done, started };
}
const results = [];
try {
  for (const connections of [1, 5, 20]) {
    const before = stats(), started = performance.now();
    const streams = Array.from({ length: connections }, open);
    try {
      await bounded(Promise.all(streams.map((s) => s.ready)), 20_000);
      await pause(10_000);
    } finally { streams.forEach((s) => s.abort.abort()); await Promise.all(streams.map((s) => s.done)); }
    const elapsed = (performance.now() - started) / 1000;
    await pause(1500); const after = stats(); await pause(3000); const settled = stats();
    const result = { connections, seconds: Math.round(elapsed * 10) / 10,
      readRpcCalls: Number(after.read_calls) - Number(before.read_calls),
      allDataApiCalls: Number(after.api_calls) - Number(before.api_calls),
      sqlExecutionMs: Math.round(after.exec_ms - before.exec_ms),
      queriesAfterSettledDisconnect: Number(settled.api_calls) - Number(after.api_calls) };
    results.push(result); console.log(JSON.stringify(result));
    await fs.writeFile(".local/cloud-validation/sse-measurement.json", JSON.stringify({ target: base.origin, results }, null, 2));
    assert.equal(result.queriesAfterSettledDisconnect, 0, "Disconnected clients must stop DB polling");
  }
  const stream = open();
  try {
    await bounded(stream.ready, 20_000); await bounded(stream.done, 65_000);
    const naturalCloseSeconds = (performance.now() - stream.started) / 1000;
    assert.ok(naturalCloseSeconds >= 48 && naturalCloseSeconds < 60);
    console.log(JSON.stringify({ naturalCloseSeconds }));
    await fs.writeFile(".local/cloud-validation/sse-measurement.json", JSON.stringify({ target: base.origin, results, naturalCloseSeconds }, null, 2));
  } finally { stream.abort.abort(); }
} finally { ok(await db.rpc("set_shopping_url", { p_enabled: false })); }
