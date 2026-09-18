import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const EXPECTED_REMOTE = "https://github.com/Motokiyo-DXP/Price_DM.git";

export function parseProductionDbArguments(argv) {
  const modes = argv.filter((argument) => argument === "--dry-run" || argument === "--push");
  const unknown = argv.filter((argument) => !["--dry-run", "--push", "--confirm-production"].includes(argument));
  if (modes.length !== 1 || unknown.length > 0 || !argv.includes("--confirm-production")) {
    throw new Error("Use exactly one of --dry-run or --push together with --confirm-production.");
  }
  return { mode: modes[0] };
}

export function normalizeRemoteUrl(url) {
  return url.trim().replace(/\/$/, "").replace(/\.git$/, "").toLowerCase();
}

export function validateProductionDbGuard({ environment, git }) {
  const errors = [];
  if (environment.PRICE_DM_PRODUCTION_RELEASE !== "1") {
    errors.push("PRICE_DM_PRODUCTION_RELEASE=1 is required for a production release session.");
  }
  if (git.status.trim()) errors.push("Working tree must be clean.");
  if (git.branch !== "main") errors.push("Production DB operations require the main branch.");
  if (git.head !== git.remoteHead) errors.push("HEAD must exactly match price-dm/main.");
  if (normalizeRemoteUrl(git.remoteUrl) !== normalizeRemoteUrl(EXPECTED_REMOTE)) {
    errors.push("price-dm must point to the Price_DM repository.");
  }
  return errors;
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function currentGitState(repoRoot) {
  return {
    status: git(repoRoot, "status", "--porcelain"),
    branch: git(repoRoot, "branch", "--show-current"),
    head: git(repoRoot, "rev-parse", "HEAD"),
    remoteHead: git(repoRoot, "rev-parse", "price-dm/main"),
    remoteUrl: git(repoRoot, "remote", "get-url", "price-dm"),
  };
}

export function assertProductionDbRelease(repoRoot, environment = process.env) {
  const errors = validateProductionDbGuard({ environment, git: currentGitState(repoRoot) });
  if (errors.length) throw new Error(`Production DB guard refused to run:\n- ${errors.join("\n- ")}`);
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const options = parseProductionDbArguments(process.argv.slice(2));
  assertProductionDbRelease(repoRoot);

  const args = ["--yes", "supabase@latest", "db", "push", "--linked"];
  if (options.mode === "--dry-run") args.push("--dry-run");
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
