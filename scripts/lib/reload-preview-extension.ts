import type { BrowserContext } from "@playwright/test";

/** Unpacked extensions can retain cached worker code across browser launches. */
export async function reloadPreviewExtension(context: BrowserContext) {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = worker.url().split("/")[2]!;
  // Chrome's extension manager acknowledges completion of the reload. Waiting
  // for a new Playwright worker event is unreliable when its target is reused.
  const settings = await context.newPage();
  try {
    await settings.goto(`chrome://extensions/?id=${id}`);
    const developerMode = settings.locator("#devMode");
    if ((await developerMode.getAttribute("aria-pressed")) === "false")
      await developerMode.click();
    await settings.evaluate(async (id) => {
      await (chrome as any).developerPrivate.reload(id);
    }, id);
  } finally {
    await settings.close();
  }
  return id;
}
