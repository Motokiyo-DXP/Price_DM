import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_STORE_TEXT_FIELDS = [
  "sourceStoreId",
  "name",
  "prefecture",
  "municipality",
  "addressLine",
];

function isNonEmptyText(value, maxLength = 500) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function validateShopManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("manifest_must_be_an_object");
  }
  if (value.schemaVersion !== 1) throw new Error("unsupported_manifest_schema");
  if (!isNonEmptyText(value.chainName, 200)) throw new Error("invalid_chain_name");
  if (!isNonEmptyText(value.scope, 500)) throw new Error("invalid_scope");
  if (!isNonEmptyText(value.sourceUrl, 500) || !/^https?:\/\/\S+$/u.test(value.sourceUrl)) {
    throw new Error("invalid_source_url");
  }
  if (!isNonEmptyText(value.verifiedAt, 50) || Number.isNaN(Date.parse(value.verifiedAt))) {
    throw new Error("invalid_verified_at");
  }
  if (!Array.isArray(value.stores) || value.stores.length === 0) {
    throw new Error("manifest_has_no_stores");
  }

  const ids = new Set();
  const names = new Set();
  for (const store of value.stores) {
    if (!store || typeof store !== "object" || Array.isArray(store)) {
      throw new Error("invalid_store_entry");
    }
    for (const field of REQUIRED_STORE_TEXT_FIELDS) {
      if (!isNonEmptyText(store[field], field === "name" ? 200 : 300)) {
        throw new Error(`invalid_store_${field}`);
      }
    }
    if (store.operationalStatus !== "active") {
      throw new Error("manifest_only_accepts_active_physical_stores");
    }
    const normalizedId = store.sourceStoreId.toLowerCase();
    if (ids.has(normalizedId)) throw new Error(`duplicate_source_store_id:${store.sourceStoreId}`);
    if (names.has(store.name)) throw new Error(`duplicate_store_name:${store.name}`);
    ids.add(normalizedId);
    names.add(store.name);
  }
  return value;
}

export function auditShopRows(manifestValue, databaseRows) {
  const manifest = validateShopManifest(manifestValue);
  if (!Array.isArray(databaseRows)) throw new Error("database_rows_must_be_an_array");

  const rowsById = new Map();
  const duplicateDatabaseIds = [];
  for (const row of databaseRows) {
    const id = typeof row.source_store_id === "string" ? row.source_store_id.toLowerCase() : "";
    if (!id) continue;
    if (rowsById.has(id)) duplicateDatabaseIds.push(row.source_store_id);
    else rowsById.set(id, row);
  }

  const missing = [];
  const fieldMismatches = [];
  const incomplete = [];
  const expectedIds = new Set();

  for (const expected of manifest.stores) {
    const id = expected.sourceStoreId.toLowerCase();
    expectedIds.add(id);
    const actual = rowsById.get(id);
    if (!actual) {
      missing.push(expected.name);
      continue;
    }

    const expectedFields = {
      name: expected.name,
      prefecture: expected.prefecture,
      municipality: expected.municipality,
      address_line: expected.addressLine,
      operational_status: expected.operationalStatus,
      chain_name: manifest.chainName,
      source_url: manifest.sourceUrl,
    };
    for (const [field, expectedValue] of Object.entries(expectedFields)) {
      if (actual[field] !== expectedValue) {
        fieldMismatches.push({ store: expected.name, field, expected: expectedValue, actual: actual[field] });
      }
    }

    const missingFields = [];
    if (!isNonEmptyText(actual.name_kana, 200)) missingFields.push("name_kana");
    if (!Array.isArray(actual.aliases) || actual.aliases.length === 0) missingFields.push("aliases");
    if (!isNonEmptyText(actual.website_url, 500)) missingFields.push("website_url");
    if (!isNonEmptyText(actual.source_verified_at, 100)) missingFields.push("source_verified_at");
    if (missingFields.length > 0) incomplete.push({ store: expected.name, fields: missingFields });
  }

  const unexpected = databaseRows
    .filter((row) => row.operational_status === "active")
    .filter((row) => typeof row.source_store_id !== "string" || !expectedIds.has(row.source_store_id.toLowerCase()))
    .map((row) => row.name);

  return {
    chainName: manifest.chainName,
    expectedCount: manifest.stores.length,
    databaseCount: databaseRows.filter((row) => row.operational_status === "active").length,
    missing,
    unexpected,
    duplicateDatabaseIds,
    fieldMismatches,
    incomplete,
    ok:
      missing.length === 0 &&
      unexpected.length === 0 &&
      duplicateDatabaseIds.length === 0 &&
      fieldMismatches.length === 0 &&
      incomplete.length === 0,
  };
}

async function loadJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function fetchAllChainRows(manifest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("supabase_environment_not_configured");

  const client = createClient(url, key, { auth: { persistSession: false } });
  const pageSize = 200;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("shops")
      .select("name,name_kana,aliases,prefecture,municipality,address_line,website_url,chain_name,source_store_id,source_url,source_verified_at,operational_status,superseded_by_shop_id")
      .eq("chain_name", manifest.chainName)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`shop_query_failed:${error.code ?? error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const manifestPath = argumentValue("--manifest") ?? "data/shop-manifests/yellow-submarine.json";
  const rowsPath = argumentValue("--rows");
  const manifest = validateShopManifest(await loadJson(manifestPath));
  const rows = rowsPath ? await loadJson(rowsPath) : await fetchAllChainRows(manifest);
  const report = auditShopRows(manifest, rows);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "shop_manifest_audit_failed");
    process.exitCode = 1;
  });
}
