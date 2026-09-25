import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer: [
    {
      command:
        "pnpm --filter @toolgraft/playground preview --port 4274 --strictPort",
      url: "http://localhost:4274",
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @toolgraft/web preview --port 5273 --strictPort",
      url: "http://127.0.0.1:5273",
      reuseExistingServer: false,
    },
  ],
  use: { trace: "retain-on-failure" },
});
