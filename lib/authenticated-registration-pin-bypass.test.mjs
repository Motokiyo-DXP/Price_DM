import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/registration-session/route.ts", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/20260904154420_allow_authenticated_registration_without_pin.sql",
  import.meta.url,
);

test("logged-in registration creates the existing protected registration session", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /createAuthServerSupabaseClient/);
  assert.match(route, /authSupabase\.auth\.getClaims\(\)/);
  assert.match(route, /typeof claims\?\.claims\?\.sub !== "string"/);
  assert.match(route, /create_registration_session/);
  assert.match(route, /p_pin: ""/);
  assert.match(route, /httpOnly: true/);
});

test("anonymous registration retains PIN verification while authenticated JWTs bypass it", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /if \(select auth\.uid\(\)\) is null then/);
  assert.match(migration, /verify_registration_pin_impl\(p_pin\)/);
  assert.match(migration, /private\.registration_sessions/);
  assert.doesNotMatch(migration, /NEXT_PUBLIC|SUPABASE_SERVICE_ROLE_KEY/);
});
