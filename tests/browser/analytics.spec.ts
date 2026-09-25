import { test, expect, chromium } from "@playwright/test";
import { resolve } from "node:path";
import { analyticsConfig } from "../../packages/analytics/src/index";
import { checkExtensionLayout } from "./layout";
import { EXTENSION_VERSION } from "../../packages/adapter-schema/src/index";

const publicSite = "https://particular-labs.github.io/toolgraft/";
test("website sends only fixed fields and persists opt-out; privacy signals and previews suppress collection", async ({
  browser,
}) => {
  for (const mode of ["normal", "dnt", "gpc", "preview"]) {
    const context = await browser.newContext();
    const payloads: any[] = [];
    await context.route(analyticsConfig.endpoint, async (route) => {
      expect(route.request().headers()["referer"]).toBeUndefined();
      expect(route.request().headers()["cookie"]).toBeUndefined();
      payloads.push(route.request().postDataJSON());
      await route.fulfill({ json: {} });
    });
    await context.route(
      "https://particular-labs.github.io/**",
      async (route) => {
        const url = new URL(route.request().url());
        const response = await context.request.get(
          "http://127.0.0.1:5273" +
            url.pathname.replace(/^\/toolgraft\//, "/") +
            url.search,
        );
        await route.fulfill({ response });
      },
    );
    if (mode === "dnt" || mode === "gpc")
      await context.addInitScript(
        (mode) =>
          Object.defineProperty(
            navigator,
            mode === "dnt" ? "doNotTrack" : "globalPrivacyControl",
            { value: mode === "dnt" ? "1" : true },
          ),
        mode,
      );
    const page = await context.newPage();
    await page.goto(
      (mode === "preview" ? "http://127.0.0.1:5273/" : publicSite) +
        "privacy.html?secret=PRIVATE_QUERY#PRIVATE_FRAGMENT",
    );
    await expect(
      page.getByRole("button", {
        name:
          mode === "preview"
            ? "Analytics disabled on this preview"
            : mode === "normal"
              ? "Turn off website analytics"
              : "Opt out of website analytics",
      }),
    ).toBeVisible();
    if (mode === "normal") {
      await expect.poll(() => payloads.length).toBe(1);
      expect(payloads[0]).toEqual({
        type: "event",
        payload: {
          website: analyticsConfig.website,
          hostname: "particular-labs.github.io",
          url: "/website/privacy",
          data: { release: EXTENSION_VERSION, surface: "website" },
        },
      });
      await page
        .getByRole("button", { name: "Turn off website analytics" })
        .click();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Allow website analytics" }),
      ).toBeVisible();
      expect(payloads).toHaveLength(1);
      await page
        .getByRole("button", { name: "Allow website analytics" })
        .click();
      await page.reload();
      await expect.poll(() => payloads.length).toBe(2);
    } else expect(payloads).toHaveLength(0);
    await context.close();
  }
});

test("production extension requires opt-in, persists opt-out, suppresses private signals and recovers from stale panels", async () => {
  const extension = resolve("apps/extension/.output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const id = worker.url().split("/")[2]!;
    // Intercept only the transport. Shipping UI, consent, permissions and serializer run unchanged.
    await worker.evaluate((endpoint) => {
      const original = fetch;
      (globalThis as any).__receipts = [];
      globalThis.fetch = async (input, init) => {
        if (String(input) === endpoint) {
          (globalThis as any).__receipts.push({
            body: JSON.parse(String(init?.body)),
            credentials: init?.credentials,
            referrerPolicy: init?.referrerPolicy,
          });
          return new Response("{}", { status: 200 });
        }
        return original(input, init);
      };
    }, analyticsConfig.endpoint);
    const receipts = () =>
      worker.evaluate(() => (globalThis as any).__receipts);
    const page = await context.newPage();
    for (const panel of ["popup", "connect", "options"]) {
      await page.goto(`chrome-extension://${id}/${panel}.html`);
      await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
    }
    expect(await receipts()).toHaveLength(0);
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await checkExtensionLayout(page, "analytics-off");
    const settings = await context.newPage();
    await settings.goto(`chrome://extensions/?id=${id}`);
    // Avoid automating Chrome's native permission bubble; approval is supplied by the harness.
    await settings.evaluate(
      async ({ id, origin }) =>
        (chrome as any).developerPrivate.addHostPermission(id, origin),
      { id, origin: new URL(analyticsConfig.endpoint).origin + "/*" },
    );
    await settings.close();
    await page
      .getByRole("button", { name: "Allow optional extension analytics" })
      .click();
    await expect(
      page.getByRole("button", { name: "Turn off extension analytics" }),
    ).toBeVisible();
    await page.reload();
    await expect.poll(async () => (await receipts()).length).toBe(1);
    expect((await receipts())[0]).toEqual({
      body: {
        type: "event",
        payload: {
          website: analyticsConfig.extension,
          hostname: "toolgraft-extension",
          url: "/extension/options",
          name: "panel_opened",
          data: { release: EXTENSION_VERSION, surface: "extension" },
        },
      },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    await checkExtensionLayout(page, "analytics-on");
    const privatePage = await context.newPage();
    await privatePage.addInitScript(() =>
      Object.defineProperty(navigator, "globalPrivacyControl", { value: true }),
    );
    await privatePage.goto(`chrome-extension://${id}/options.html`);
    await privatePage
      .getByRole("tab", { name: "Settings", exact: true })
      .click();
    await expect(
      privatePage.getByText("Your browser’s privacy signal blocks analytics.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await receipts()).toHaveLength(1);
    await privatePage.close();
    await page
      .getByRole("button", { name: "Turn off extension analytics" })
      .click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Allow optional extension analytics" }),
    ).toBeVisible();
    expect(await receipts()).toHaveLength(1);
    // Reproduce an older worker replying successfully without the current panel protocol.
    await page.addInitScript(() => {
      chrome.runtime.sendMessage = (async () => ({
        ok: true,
        value: {},
      })) as any;
    });
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("chrome://extensions");
    await expect(page.locator("body")).not.toContainText("undefined");
    await checkExtensionLayout(page, "panel-recovery");
  } finally {
    await context.close();
  }
});
