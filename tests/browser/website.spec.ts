import { test, expect } from "@playwright/test";
import { EXTENSION_VERSION } from "../../packages/adapter-schema/src/index";
test("homepage demo, clipboard recovery, keyboard semantics, and responsive layout", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("http://127.0.0.1:5273");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Give web apps",
  );
  await page
    .getByRole("button", { name: "Run mail.get_current_email", exact: true })
    .click();
  await expect(page.locator("#runStatus")).toHaveText("message returned");
  await page.locator("[data-tool=search]").click();
  await page
    .getByRole("button", { name: "Run mail.search", exact: true })
    .click();
  await expect(page.locator("#runStatus")).toHaveText("1 match");
  await page.locator("[data-tool=create_draft]").click();
  await page
    .getByRole("button", { name: "Run mail.create_draft", exact: true })
    .click();
  await expect(page.locator("#runStatus")).toHaveText("draft saved");
  for (const link of await page
    .getByRole("link", { name: "Get started", exact: true })
    .all())
    await expect(link).toHaveAttribute("href", "./get-started.html");
  await expect(page.getByText("We're building")).toHaveCount(0);
  expect(errors).toEqual([]);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `.cache/screenshots/${name}.png`,
      fullPage: true,
    });
  }
});

test("agent setup supports selection, clipboard, download and mobile layout", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("http://127.0.0.1:5273/docs.html#developers");
  await page
    .getByText("Native WebMCP developer connection", { exact: true })
    .click();
  await expect(page.locator("#agent-config")).toContainText(
    "[mcp_servers.toolgraft-browser]",
  );
  await page.getByLabel("Your agent", { exact: true }).selectOption("cursor");
  const text = await page.locator("#agent-config").innerText();
  expect(JSON.parse(text).mcpServers["toolgraft-browser"].command).toBe("npx");
  await page
    .getByRole("button", { name: "Copy configuration", exact: true })
    .click();
  await expect(page.locator(".copy-status")).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download configuration", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("toolgraft-cursor.json");
  await page
    .getByRole("button", { name: "Copy test prompt", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "playground_list_tasks",
  );
  for (const [name, width] of [
    ["desktop", 1440],
    ["mobile", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `.cache/screenshots/web-connect-${name}.png`,
      fullPage: true,
    });
  }
});

test("setup offers the extension download, configures the pinned npm MCP and shares the live agent guide", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("http://127.0.0.1:5273/get-started.html");
  const extensionLink = page.getByRole("link", {
    name: "Download ToolGraft for Chrome",
    exact: true,
  });
  await expect(extensionLink).toBeVisible();
  // The dev server has no ZIP; release.mts copies this exact name into the site.
  await expect(extensionLink).toHaveAttribute(
    "href",
    `./toolgraft-${EXTENSION_VERSION}-chrome.zip`,
  );
  await page
    .getByRole("link", { name: "Set up manually", exact: true })
    .click();
  await expect(page.getByLabel("Downloaded package path")).toHaveCount(0);
  await page
    .getByLabel("Agent client", { exact: true })
    .selectOption("Claude Code");
  const config = JSON.parse(await page.locator("#managed-config").innerText());
  expect(Object.keys(config.mcpServers)).toEqual(["toolgraft"]);
  expect(config.mcpServers.toolgraft).toEqual({
    command: "npx",
    args: ["-y", `@particular-labs/toolgraft-mcp@${EXTENSION_VERSION}`],
  });
  await page
    .getByRole("button", { name: "Copy ToolGraft configuration", exact: true })
    .click();
  expect(
    JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
  ).toEqual(config);
  await page.goto("http://127.0.0.1:5273/agent-guide.html");
  await expect(
    page.getByText(
      "Generated scripts are trusted within approved hosts; validation and prompts are not a sandbox.",
    ),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.cache/screenshots/agent-guide-${width}.png`,
      fullPage: true,
    });
  }
});

test("setup instructions copy the pinned npm package and extension URL and provide a clipboard fallback", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("http://127.0.0.1:5273/get-started.html");
  await page
    .getByRole("button", { name: "Copy setup instructions", exact: true })
    .click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(
    `@particular-labs/toolgraft-mcp@${EXTENSION_VERSION}`,
  );
  expect(copied).toContain(
    `http://127.0.0.1:5273/toolgraft-${EXTENSION_VERSION}-chrome.zip`,
  );
  expect(copied).not.toContain(".tgz");
  expect(copied).toContain("toolgraft_connect");
  expect(copied).toContain("obtain my permission");
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: () => Promise.reject(new Error("denied")),
    }),
  );
  await page
    .getByRole("button", { name: "Copy setup instructions", exact: true })
    .click();
  await expect(page.locator("#setup-prompt-status")).toContainText(
    "Select and copy",
  );
  await expect(page.locator("#setup-prompt")).toBeVisible();
  for (const width of [320, 390, 768, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 320 || width === 1100)
      await page.screenshot({
        path: `.cache/screenshots/setup-instructions-${width}.png`,
        fullPage: true,
      });
  }
});
