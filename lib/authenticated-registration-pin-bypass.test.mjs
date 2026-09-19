import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL("../app/api/registration-session/route.ts", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/20260904154420_allow_authenticated_registration_without_pin.sql",
  import.meta.url,
);
const authSchemaDependencyRepairMigrationPath = new URL(
  "../supabase/migrations/20260919130000_remove_registration_auth_schema_dependency.sql",
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

test("the app accepts only logged-in registration, even though the historical PIN RPC remains", async () => {
  const route = await readFile(routePath, "utf8");
  const page = await readFile(new URL("../app/register/page.tsx", import.meta.url), "utf8");
  const priceRoute = await readFile(new URL("../app/api/price-records/route.ts", import.meta.url), "utf8");
  const candidateRoute = await readFile(new URL("../app/api/shop-candidates/route.ts", import.meta.url), "utf8");
  const migration = await readFile(migrationPath, "utf8");
  assert.match(route, /if \(!authSupabase \|\| authError \|\| typeof claims\?\.claims\?\.sub !== "string"\)/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.match(priceRoute, /if \(!\(await hasRegistrationUser\(\)\)\)/);
  assert.match(candidateRoute, /if \(!\(await hasRegistrationUser\(\)\)\)/);
  assert.doesNotMatch(page, /registrationPin|create_registration_session|PasswordInput/);
  assert.match(migration, /if \(select auth\.uid\(\)\) is null then/);
  assert.match(migration, /verify_registration_pin_impl\(p_pin\)/);
  assert.match(migration, /private\.registration_sessions/);
  assert.doesNotMatch(migration, /NEXT_PUBLIC|SUPABASE_SERVICE_ROLE_KEY/);
});

test("the registration executor resolves the same JWT claims without auth schema access", async () => {
  const authenticatedRegistrationMigration = await readFile(migrationPath, "utf8");
  const repairMigration = await readFile(authSchemaDependencyRepairMigrationPath, "utf8");

  assert.match(authenticatedRegistrationMigration, /auth\.uid\(\)/);
  assert.match(repairMigration, /current_setting\('request\.jwt\.claim\.sub', true\)/);
  assert.match(repairMigration, /current_setting\('request\.jwt\.claims', true\)/);
  assert.match(repairMigration, /pg_input_is_valid\(v_jwt_claims, 'jsonb'\)/);
  assert.match(repairMigration, /pg_input_is_valid\(v_jwt_sub, 'uuid'\)/);
  assert.match(repairMigration, /if v_user_id is null then/);
  assert.doesNotMatch(repairMigration, /auth\.uid|auth\.jwt|grant usage on schema auth|auth\.users/i);
  assert.match(repairMigration, /security definer/i);
  assert.match(repairMigration, /set search_path = ''/i);
});

test("registration routes refresh the authenticated request cookies before session validation", async () => {
  const middleware = await readFile(new URL("../middleware.ts", import.meta.url), "utf8");
  const auth = await readFile(new URL("../lib/supabase-auth.ts", import.meta.url), "utf8");

  assert.match(middleware, /"\/register\/:path\*"/);
  assert.match(middleware, /"\/api\/registration-session"/);
  assert.match(auth, /request\.cookies\.set\(\{ name, value \}\)/);
  assert.match(auth, /response = NextResponse\.next\(\{ request \}\)/);
});
