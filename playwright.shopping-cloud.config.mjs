import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests/shopping", testMatch:"cloud.spec.mjs", workers:1, timeout:120_000,
  outputDir:".local/cloud-validation/browser-results",reporter:"list",
  use:{baseURL:process.env.SHOPPING_CLOUD_BASE_URL || "http://127.0.0.1:3000",actionTimeout:15_000,trace:"retain-on-failure",screenshot:"only-on-failure"},
});
