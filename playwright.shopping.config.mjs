import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/shopping", workers:1, timeout:60_000,
  outputDir:".local/shopping-browser-results", reporter:"list",
  use:{baseURL:"http://localhost:3000",actionTimeout:15_000,trace:"retain-on-failure",screenshot:"only-on-failure"},
  webServer:[
    {command:"node scripts/shopping-sharing-fixture.mjs",url:"http://127.0.0.1:55441/__health",reuseExistingServer:false},
    {command:"npm run dev",url:"http://localhost:3000",reuseExistingServer:false,timeout:120_000,
      env:{NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:55441",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"isolated-public-key",NEXT_PUBLIC_CARD_IMAGE_BASE_URL:""}},
  ],
});
