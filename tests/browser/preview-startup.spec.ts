import { test, expect, chromium } from "@playwright/test";
import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { reloadPreviewExtension } from "../../scripts/lib/reload-preview-extension";

test("preview reload replaces an old worker without deleting saved data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tg-preview-"));
  const extension = join(dir, "extension");
  await cp(resolve("apps/extension/.output/chrome-mv3"), extension, {
    recursive: true,
  });
  const background = join(extension, "background.js");
  const current = await readFile(background, "utf8");
  // Emulate the older response format in the same unpacked extension path.
  expect(current).toContain("panelProtocol:");
  await writeFile(
    background,
    current.replaceAll("panelProtocol:", "oldProtocol:"),
  );
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
    const before = await context.newPage();
    await before.goto(`chrome-extension://${id}/options.html`);
    await expect(
      before.getByText("ToolGraft could not load this panel.", {
        exact: false,
      }),
    ).toBeVisible();
    await worker.evaluate(() =>
      chrome.storage.local.set({ previewMarker: "preserved" }),
    );
    await writeFile(background, current);
    expect(await reloadPreviewExtension(context)).toBe(id);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await expect(
      options.getByRole("heading", { name: "Your adapters", exact: true }),
    ).toBeVisible();
    expect(
      await options.evaluate(
        async () =>
          (await chrome.storage.local.get("previewMarker")).previewMarker,
      ),
    ).toBe("preserved");
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(
      popup.getByRole("heading", { name: "Tools on this page", exact: true }),
    ).toBeVisible();
    await expect(
      popup.getByRole("button", { name: "Manage adapters", exact: true }),
    ).toBeVisible();
    // Exercise Chrome's actual popup and options entry point. The full-tab
    // options page can reuse an existing tab rather than creating a second view.
    await options.evaluate(() => chrome.action.openPopup());
    await expect
      .poll(() =>
        options.evaluate(() =>
          chrome.extension
            .getViews({ type: "popup" })
            .some(
              (view) =>
                view.document.querySelector("h1")?.textContent ===
                  "Tools on this page" &&
                !view.document.querySelector(".error"),
            ),
        ),
      )
      .toBe(true);
    await before.close();
    await options.close();
    const opened = context.waitForEvent("page");
    await popup.evaluate(() => chrome.runtime.openOptionsPage());
    const optionsFromChrome = await opened;
    await expect(optionsFromChrome).toHaveURL(
      `chrome-extension://${id}/options.html`,
    );
    await expect(
      optionsFromChrome.getByRole("heading", {
        name: "Your adapters",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
});
