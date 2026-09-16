import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_MANIFEST = "project/rule-automation/data/manifests/source_manifest.yaml";
const DEFAULT_INDEX_URL = "https://dm.takaratomy.co.jp/rule/rulechange/";

export class RuleSourceError extends Error {
  constructor(kind, message, options) {
    super(message, options);
    this.name = "RuleSourceError";
    this.kind = kind;
  }
}

function scalar(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSourceEntries(yaml) {
  const entries = [];
  let current = null;
  for (const line of yaml.split(/\r?\n/u)) {
    const start = line.match(/^\s{2}-\s+([a-z_]+):\s*(.*?)\s*$/u);
    if (start) {
      current = { [start[1]]: scalar(start[2]) };
      entries.push(current);
      continue;
    }
    const field = line.match(/^\s{4}([a-z_]+):\s*(.*?)\s*$/u);
    if (current && field) current[field[1]] = scalar(field[2]);
  }
  return entries;
}

function requireText(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new RuleSourceError("MANIFEST_ERROR", `missing_manifest_field:${field}`);
  }
  return value;
}

function normalizeDate(value, errorKind) {
  const match = value.match(/(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/u);
  if (!match) throw new RuleSourceError(errorKind, `invalid_date:${value}`);
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function validateUrl(value, field, errorKind) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("https_required");
    return url.href;
  } catch {
    throw new RuleSourceError(errorKind, `invalid_${field}:${value}`);
  }
}

export function parseManifestBaseline(yaml) {
  const entries = parseSourceEntries(yaml);
  const index = entries.find((entry) => entry.source_id === "dm_comprehensive_rules_index" && entry.type === "rules_index");
  if (!index) throw new RuleSourceError("MANIFEST_ERROR", "rules_index_source_not_found");

  const version = requireText(index.current_observed_version, "current_observed_version");
  const date = normalizeDate(requireText(index.current_observed_date, "current_observed_date"), "MANIFEST_ERROR");
  const pdfEntries = entries.filter((entry) => entry.type === "pdf" && entry.rule_version === version);
  if (pdfEntries.length !== 1) {
    throw new RuleSourceError("MANIFEST_ERROR", `expected_one_matching_pdf_source:${pdfEntries.length}`);
  }
  const pdfUrl = validateUrl(requireText(pdfEntries[0].url, "pdf.url"), "pdf_url", "MANIFEST_ERROR");
  return Object.freeze({ indexUrl: validateUrl(index.url, "index_url", "MANIFEST_ERROR"), version, date, pdfUrl });
}

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

export function parseRuleIndexHtml(html, indexUrl = DEFAULT_INDEX_URL) {
  if (typeof html !== "string" || html.length === 0) {
    throw new RuleSourceError("PARSER_ERROR", "empty_rule_index_html");
  }

  const candidates = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/giu;
  for (const match of html.matchAll(anchorPattern)) {
    const text = decodeHtml(match[3]);
    if (!text.includes("デュエル・マスターズ総合ゲームルール")) continue;
    const versionMatch = text.match(/Ver\.?\s*([0-9]+(?:\.[0-9]+)+)/iu);
    if (!versionMatch) throw new RuleSourceError("PARSER_ERROR", "rule_version_not_found");
    const following = html.slice(match.index + match[0].length, match.index + match[0].length + 1200);
    const dateContainer = following.match(/<[^>]*class\s*=\s*["'][^"']*\bday01\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/iu);
    if (!dateContainer) throw new RuleSourceError("PARSER_ERROR", "rule_date_not_found");

    let pdfUrl;
    try {
      pdfUrl = new URL(match[2], indexUrl).href;
    } catch {
      throw new RuleSourceError("PARSER_ERROR", `invalid_pdf_url:${match[2]}`);
    }
    if (!/^https:\/\//u.test(pdfUrl) || !/\.pdf(?:$|[?#])/iu.test(pdfUrl)) {
      throw new RuleSourceError("PARSER_ERROR", `invalid_pdf_url:${pdfUrl}`);
    }
    candidates.push({
      version: versionMatch[1],
      date: normalizeDate(decodeHtml(dateContainer[1]), "PARSER_ERROR"),
      pdfUrl,
    });
  }

  if (candidates.length !== 1) {
    throw new RuleSourceError("PARSER_ERROR", `expected_one_comprehensive_rule_entry:${candidates.length}`);
  }
  return Object.freeze(candidates[0]);
}

export function compareRuleSource(baseline, observed) {
  const changes = [];
  for (const field of ["version", "date", "pdfUrl"]) {
    if (baseline[field] !== observed[field]) {
      changes.push(Object.freeze({ field, baseline: baseline[field], observed: observed[field] }));
    }
  }
  return Object.freeze({
    status: changes.length === 0 ? "NO_CHANGE" : "CHANGE_DETECTED",
    baseline,
    observed,
    changes: Object.freeze(changes),
  });
}

async function fetchIndex(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    throw new RuleSourceError("NETWORK_ERROR", "rule_index_fetch_failed", { cause: error });
  }
  if (!response.ok) {
    throw new RuleSourceError("NETWORK_ERROR", `rule_index_http_status:${response.status}`);
  }
  return response.text();
}

export async function checkRuleSource({ manifestText, html, fetchImpl = fetch } = {}) {
  const baseline = parseManifestBaseline(manifestText);
  const indexHtml = html ?? await fetchIndex(baseline.indexUrl, fetchImpl);
  return compareRuleSource(baseline, parseRuleIndexHtml(indexHtml, baseline.indexUrl));
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const manifestPath = argumentValue("--manifest") ?? DEFAULT_MANIFEST;
  const indexFile = argumentValue("--index-file");
  let manifestText;
  let html;
  try {
    manifestText = await readFile(resolve(manifestPath), "utf8");
    if (indexFile) html = await readFile(resolve(indexFile), "utf8");
  } catch (error) {
    throw new RuleSourceError("MANIFEST_ERROR", `source_file_read_failed:${error.code ?? "unknown"}`, { cause: error });
  }
  const result = await checkRuleSource({ manifestText, html });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const kind = error instanceof RuleSourceError ? error.kind : "PARSER_ERROR";
    console.error(`${kind}: ${error instanceof Error ? error.message : "unknown_rule_source_error"}`);
    process.exitCode = 1;
  });
}
