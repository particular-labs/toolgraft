import { chromium } from "@playwright/test";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { reloadPreviewExtension } from "./lib/reload-preview-extension.ts";
import { PANEL_PROTOCOL } from "@toolgraft/agent-core";
await access("apps/extension/.output/chrome-mv3/manifest.json").catch(() => {
  throw new Error("Run pnpm adapters:build && pnpm build first.");
});
let server: ReturnType<typeof spawn> | undefined;
try {
  await fetch("http://localhost:4174", { signal: AbortSignal.timeout(1500) });
} catch {
  server = spawn("pnpm", ["dev:playground"], { stdio: "inherit" });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch("http://localhost:4174");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
}
const extension = resolve("apps/extension/.output/chrome-mv3");
const context = await chromium.launchPersistentContext(
  resolve(".browser-profile"),
  {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--enable-features=WebMCP,WebMCPTesting",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=9227",
    ],
  },
);
// Chrome may reuse the previous build's cached service worker in this profile.
// Reload before opening panels so their protocol and the worker agree.
const id = await reloadPreviewExtension(context);
const setup = await context.newPage();
await setup.goto(`chrome-extension://${id}/onboarding.html`);
const options = await context.newPage();
await options.goto(`chrome-extension://${id}/options.html`);
const status = await options.evaluate(() =>
  chrome.runtime.sendMessage({ type: "status" }),
);
if (!status?.ok || status.panelProtocol !== PANEL_PROTOCOL)
  throw new Error("ToolGraft worker did not load the current panel protocol.");
await options
  .getByRole("heading", { name: "Your adapters", exact: true })
  .waitFor();
const page = await context.newPage();
await page.goto("http://localhost:4174/tasks");
console.log(
  `ToolGraft loaded in dedicated profile. Extension ID: ${id}\nEnable Allow User Scripts and install adapters/playground/dist/adapter.tgz in the adapter manager.\nBrowser debugging address for MCP: http://127.0.0.1:9227\nClose this browser or press Ctrl-C to stop.`,
);
async function stop() {
  await context.close().catch(() => {});
  server?.kill();
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
context.on("close", () => {
  server?.kill();
  process.exit(0);
});
await new Promise(() => {});
