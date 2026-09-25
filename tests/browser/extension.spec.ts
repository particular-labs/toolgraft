import { serverArgs } from "@toolgraft/agent-setup";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from "@playwright/test";
import { resolve } from "node:path";
import { checkExtensionLayout, checkLongContentLayout } from "./layout";
let context: BrowserContext, worker: Worker, id: string, options: Page;
test.beforeAll(async () => {
  const path = resolve("apps/extension/.output/chrome-mv3");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !process.env.TG_HEADED,
    args: [
      `--disable-extensions-except=${path}`,
      `--load-extension=${path}`,
      "--enable-features=WebMCP,WebMCPTesting",
      "--remote-debugging-port=9226",
    ],
  });
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  id = worker.url().split("/")[2]!;
  expect(
    await worker.evaluate(
      () => chrome.runtime.getManifest().options_ui?.open_in_tab,
    ),
  ).toBe(true);
  options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
});
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await context?.close();
});
async function enableScripts() {
  const settings = await context.newPage();
  await settings.goto(`chrome://extensions/?id=${id}`);
  const developer = settings.locator("#devMode");
  await developer.waitFor();
  if ((await developer.getAttribute("aria-pressed")) === "false")
    await developer.click();
  const toggle = settings.locator("#allow-user-scripts").locator("cr-toggle");
  await toggle.waitFor();
  if ((await toggle.getAttribute("aria-pressed")) === "false")
    await toggle.click();
  await settings.close();
  await options.getByRole("tab", { name: "Settings", exact: true }).click();
  await options.getByRole("button", { name: "Recheck browser setup" }).click();
  await options.getByRole("tab", { name: "Installed", exact: true }).click();
  await expect(
    options.getByText("User Scripts is disabled.", { exact: false }),
  ).toHaveCount(0);
}
async function grant(hosts: string[]) {
  const setup = await context.newPage();
  await setup.goto("chrome://extensions/?id=" + id);
  for (const host of hosts)
    await setup.evaluate(
      async ({ id, host }) => {
        await (chrome as any).developerPrivate.addHostPermission(id, host);
      },
      { id, host },
    );
  await setup.close();
}
async function install(slug: string) {
  await options
    .locator("#package-file")
    .setInputFiles(resolve(`adapters/${slug}/dist/adapter.tgz`));
  await expect(options.getByRole("dialog")).toBeVisible();
  await options
    .getByRole("button", { name: "Approve site access and install" })
    .click();
  try {
    await expect(options.getByRole("dialog")).toHaveCount(0, {
      timeout: 60000,
    });
  } catch (e) {
    console.log("OPTIONS", await options.locator("body").innerText());
    console.log(
      "PERMISSIONS",
      await worker.evaluate(() => chrome.permissions.getAll()),
    );
    throw e;
  }
  await expect(
    options.getByText("Installed. Reload matching tabs"),
  ).toBeVisible();
}
async function tools(page: Page) {
  return page.evaluate(async () => {
    const ctx = (document as any).modelContext;
    return ctx ? (await ctx.getTools()).map((t: any) => t.name) : [];
  });
}
async function call(page: Page, name: string, input: unknown = {}) {
  return page.evaluate(
    async ({ name, input }) => {
      const ctx = (document as any).modelContext;
      const tool = (await ctx.getTools()).find((t: any) => t.name === name);
      return JSON.parse(await ctx.executeTool(tool, JSON.stringify(input)));
    },
    { name, input },
  );
}
test("actual extension: enablement, installation, native tool read/write, navigation, removal", async () => {
  await expect(
    options.getByRole("heading", { name: "Your adapters" }),
  ).toBeVisible();
  await enableScripts();
  if (!process.env.TG_HEADED) await grant(["http://localhost/*"]);
  await install("playground");
  const registered = await worker.evaluate(async () =>
    chrome.userScripts.getScripts(),
  );
  expect(registered).toHaveLength(1);
  expect(registered[0]!.world).toBe("USER_SCRIPT");
  const page = await context.newPage();
  await page.goto("http://localhost:4274/tasks");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  const read = await call(page, "playground_list_tasks");
  expect(JSON.parse(read.content[0].text)).toHaveLength(3);
  const confirmationOpened = context.waitForEvent("page");
  const deniedCall = call(page, "playground_create_task", {
    title: "Should never be created",
  });
  const confirmation = await confirmationOpened;
  await confirmation.waitForLoadState();
  await expect(
    confirmation.getByRole("heading", { name: "Approve this operation?" }),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Deny", exact: true }).click();
  expect((await deniedCall).isError).toBe(true);
  await expect(page.locator("[data-task-id]")).toHaveCount(3);
  const approvalOpened = context.waitForEvent("page");
  const approvedCall = call(page, "playground_create_task", {
    title: "Created through native WebMCP",
  });
  const approval = await approvalOpened;
  await approval.waitForLoadState();
  await approval
    .getByRole("button", { name: "Approve once", exact: true })
    .click();
  expect((await approvedCall).isError).not.toBe(true);
  await expect(
    page.getByText("Created through native WebMCP", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect.poll(() => tools(page)).not.toContain("playground_list_tasks");
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  await page.goto("http://localhost:4274/tasks?shape=broken");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  expect((await call(page, "playground_list_tasks")).content[0].text).toContain(
    "PAGE_SHAPE_CHANGED",
  );
  await options
    .getByRole("button", { name: "Remove ToolGraft playground", exact: true })
    .click();
  await expect(
    options.getByText("No adapters installed.", { exact: false }),
  ).toBeVisible();
  await page.goto("http://localhost:4274/tasks");
  expect(await tools(page)).not.toContain("playground_list_tasks");
  expect(
    await worker.evaluate(() =>
      chrome.permissions.contains({ origins: ["http://localhost/*"] }),
    ),
  ).toBe(false);
});

test("empty, delayed, logged-out, wrong-domain and invalid-input boundaries", async () => {
  await grant(["http://localhost/*"]);
  await install("playground");
  const page = await context.newPage();
  await page.goto("http://localhost:4274/tasks?empty=1");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  expect(
    JSON.parse((await call(page, "playground_list_tasks")).content[0].text),
  ).toEqual([]);
  expect(
    (await call(page, "playground_create_task", { title: 22 })).content[0].text,
  ).toContain("VALIDATION_ERROR");
  expect(
    context.pages().filter((p) => p.url().includes("confirmation.html")),
  ).toHaveLength(0);
  await page.goto("http://localhost:4274/tasks?delay=1500");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  await expect(page.locator("[data-toolgraft-tasks]")).toBeVisible();
  expect((await call(page, "playground_list_tasks")).isError).not.toBe(true);
  await page.getByRole("button", { name: "Sign out of demo" }).click();
  const opened = context.waitForEvent("page");
  const pending = call(page, "playground_create_task", { title: "Logged out" });
  const confirm = await opened;
  await confirm.waitForLoadState();
  await confirm
    .getByRole("button", { name: "Approve once", exact: true })
    .click();
  expect((await pending).content[0].text).toContain("AUTH_REQUIRED");
  await page.goto("http://127.0.0.1:5273");
  expect(await tools(page)).not.toContain("playground_list_tasks");
  await page.close();
});

test("closing confirmation and duplicate calls fail closed", async () => {
  const page = await context.newPage();
  await page.goto("http://localhost:4274/tasks");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  const opened = context.waitForEvent("page");
  const pending = call(page, "playground_reset");
  const dialog = await opened;
  await dialog.waitForLoadState();
  const duplicate = await call(page, "playground_reset");
  expect(duplicate.content[0].text).toContain("ADAPTER_NOT_READY");
  await dialog.close();
  expect((await pending).content[0].text).toContain("CONFIRMATION_DENIED");
  await page.close();
});

test("revocation suppresses registration and corrupt bodies do not run", async () => {
  const existingPage = await context.newPage();
  await existingPage.goto("http://localhost:4274/tasks");
  await expect
    .poll(() => tools(existingPage))
    .toContain("playground_list_tasks");
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      revocations: {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        revoked: [
          {
            id: "community.playground",
            version: "0.1.0",
            reason: "Test revocation",
          },
        ],
      },
    });
  });
  expect(
    (await call(existingPage, "playground_list_tasks")).content[0].text,
  ).toContain("ADAPTER_NOT_READY");
  await existingPage.close();
  await options.getByRole("tab", { name: "Settings", exact: true }).click();
  await options.getByRole("button", { name: "Recheck browser setup" }).click();
  await options.getByRole("tab", { name: "Installed", exact: true }).click();
  await expect(
    options.locator(".adapter-state").filter({ hasText: "Revoked" }),
  ).toBeVisible();
  expect(
    await worker.evaluate(() => chrome.userScripts.getScripts()),
  ).toHaveLength(0);
  await worker.evaluate(async () => {
    const s = await chrome.storage.local.get(null);
    const key = "adapter:community.playground:0.1.0";
    s[key].payload += "\ncorruption";
    await chrome.storage.local.set({
      [key]: s[key],
      revocations: {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        revoked: [],
      },
    });
  });
  await options.getByRole("tab", { name: "Settings", exact: true }).click();
  await options.getByRole("button", { name: "Recheck browser setup" }).click();
  await options.getByRole("tab", { name: "Installed", exact: true }).click();
  await expect(
    options.getByText("Needs repair", { exact: true }),
  ).toBeVisible();
  expect(
    await worker.evaluate(() => chrome.userScripts.getScripts()),
  ).toHaveLength(0);
  await options
    .getByRole("button", { name: "Remove ToolGraft playground", exact: true })
    .click();
  await expect(
    options.getByText("No adapters installed.", { exact: false }),
  ).toBeVisible();
});

test("restores registrations, retains old pinned versions, rejects newer storage schemas", async () => {
  await grant(["http://localhost/*"]);
  await install("playground");
  await worker.evaluate(() => chrome.userScripts.unregister());
  await options.getByRole("tab", { name: "Settings", exact: true }).click();
  await options.getByRole("button", { name: "Recheck browser setup" }).click();
  await options.getByRole("tab", { name: "Installed", exact: true }).click();
  await expect
    .poll(() => worker.evaluate(() => chrome.userScripts.getScripts()))
    .toHaveLength(1);
  const before = await worker.evaluate(() =>
    chrome.storage.local.get("installIndex"),
  );
  await options.reload();
  expect(
    await worker.evaluate(() => chrome.storage.local.get("installIndex")),
  ).toEqual(before);
  await worker.evaluate(() => chrome.storage.local.set({ schemaVersion: 999 }));
  await options.getByRole("tab", { name: "Settings", exact: true }).click();
  await options.getByRole("button", { name: "Recheck browser setup" }).click();
  await expect(options.getByRole("alert")).toContainText(
    "Unreadable local storage",
  );
  expect(
    await worker.evaluate(() => chrome.userScripts.getScripts()),
  ).toHaveLength(0);
  await worker.evaluate(() => chrome.storage.local.clear());
  await options.reload();
  await options.getByRole("tab", { name: "Installed", exact: true }).click();
  await expect(
    options.getByText("No adapters installed.", { exact: false }),
  ).toBeVisible();
});

test("API and script runtimes coexist on a real browser transport", async () => {
  await grant([
    "https://news.ycombinator.com/*",
    "https://hacker-news.firebaseio.com/*",
  ]);
  await install("hacker-news");
  await install("hacker-news-api");
  const page = await context.newPage();
  await page.route("https://news.ycombinator.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<table><tr class="athing" id="123"><td class="titleline"><a href="https://example.com/story">Transport fixture story</a></td></tr></table>',
    }),
  );
  await page.route("https://hacker-news.firebaseio.com/**", (r) =>
    r.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        id: 123,
        title: "API transport fixture",
        kids: [7, 8],
      }),
    }),
  );
  await page.goto("https://news.ycombinator.com/");
  await expect.poll(() => tools(page)).toContain("hn_front_page");
  await expect.poll(() => tools(page)).toContain("hn_get_item");
  expect(
    (await call(page, "hn_front_page", { limit: 5 })).content[0].text,
  ).toContain("Transport fixture story");
  expect(
    (await call(page, "hn_get_item", { itemId: "123" })).content[0].text,
  ).toContain("API transport fixture");
  await page.close();
});

test("one MCP connection discovers separate pages and brokers a confirmed write", async () => {
  await grant(["http://localhost/*"]);
  await install("playground");
  const page = await context.newPage();
  await page.goto("http://localhost:4274/tasks?mcp-proof=1");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  const hnPage = await context.newPage();
  await hnPage.route("https://news.ycombinator.com/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<title>MCP HN fixture</title><table><tr class="athing" id="123"><td class="titleline"><a href="https://example.com/story">One connection, another site</a></td></tr></table>',
    }),
  );
  await hnPage.goto("https://news.ycombinator.com/?mcp-proof=1");
  await expect.poll(() => tools(hnPage)).toContain("hn_front_page");
  const client = new Client({ name: "toolgraft-acceptance", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve(
        "node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js",
      ),
      ...serverArgs("http://127.0.0.1:9226"),
    ],
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const list = await client.callTool({ name: "list_pages", arguments: {} });
    const content = JSON.stringify(list);
    const match = content.match(
      /(\d+): ToolGraft playground \(http:\/\/localhost:4274\/tasks\?mcp-proof=1\)/,
    );
    expect(match, content).not.toBeNull();
    const pageId = Number(match![1]);
    const discovery = await client.callTool({
      name: "list_webmcp_tools",
      arguments: { pageId },
    });
    expect(JSON.stringify(discovery)).toContain("playground_list_tasks");
    const read = await client.callTool({
      name: "execute_webmcp_tool",
      arguments: { pageId, toolName: "playground_list_tasks", input: "{}" },
    });
    expect(read.isError).not.toBe(true);
    expect(JSON.stringify(read)).toContain("Try a read tool");
    const hnMatch = content.match(
      /(\d+): MCP HN fixture \(https:\/\/news.ycombinator.com\/\?mcp-proof=1\)/,
    );
    expect(hnMatch, content).not.toBeNull();
    const hnId = Number(hnMatch![1]);
    expect(
      JSON.stringify(
        await client.callTool({
          name: "list_webmcp_tools",
          arguments: { pageId: hnId },
        }),
      ),
    ).toContain("hn_front_page");
    const hnRead = await client.callTool({
      name: "execute_webmcp_tool",
      arguments: {
        pageId: hnId,
        toolName: "hn_front_page",
        input: '{"limit":1}',
      },
    });
    expect(JSON.stringify(hnRead)).toContain("One connection, another site");
    for (const approved of [false, true]) {
      const opened = context.waitForEvent("page");
      const pending = client.callTool({
        name: "execute_webmcp_tool",
        arguments: {
          pageId,
          toolName: "playground_create_task",
          input: JSON.stringify({
            title: approved
              ? "Approved through MCP"
              : "Must not be created through MCP",
          }),
        },
      });
      const dialog = await opened;
      await dialog.waitForLoadState();
      await dialog
        .getByRole("button", {
          name: approved ? "Approve once" : "Deny",
          exact: true,
        })
        .click();
      const response = JSON.stringify(await pending);
      if (approved) {
        expect(response).toContain("Approved through MCP");
        await expect(
          page.getByText("Approved through MCP", { exact: true }),
        ).toBeVisible();
      } else {
        expect(response).toContain("CONFIRMATION_DENIED");
        await expect(
          page.getByText("Must not be created through MCP", { exact: true }),
        ).toHaveCount(0);
      }
    }
    await page.getByRole("link", { name: "About", exact: true }).click();
    await expect.poll(() => tools(page)).not.toContain("playground_list_tasks");
    const gone = await client.callTool({
      name: "list_webmcp_tools",
      arguments: { pageId },
    });
    expect(JSON.stringify(gone)).not.toContain(
      '"name":"playground_list_tasks"',
    );
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  } finally {
    await client.close();
    await hnPage.close();
    await page.close();
  }
});

test("reload restores real registered user scripts from the persisted store", async () => {
  const before = await worker.evaluate(() => chrome.userScripts.getScripts());
  expect(before.length).toBeGreaterThan(0);
  const settings = await context.newPage();
  await settings.goto("chrome://extensions/?id=" + id);
  await settings.evaluate(async (id) => {
    const result = await (chrome as any).developerPrivate.reload(id);
    if (result) throw new Error(JSON.stringify(result));
  }, id);
  options = await context.newPage();
  await expect(async () => {
    await options.goto(`chrome-extension://${id}/options.html`);
  }).toPass({ timeout: 10000 });
  await expect(
    options.getByRole("heading", { name: "Your adapters" }),
  ).toBeVisible();
  worker =
    context.serviceWorkers().find((w) => w.url().includes(id)) ??
    (await context.waitForEvent("serviceworker"));
  await expect
    .poll(() => worker.evaluate(() => chrome.userScripts.getScripts()))
    .toHaveLength(before.length);
  await settings.close();
});

test("captures extension surfaces and local playground", async () => {
  await options.reload();
  await options.setViewportSize({ width: 1100, height: 900 });
  await options.screenshot({
    path: ".cache/screenshots/extension-options.png",
    fullPage: true,
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`chrome-extension://${id}/onboarding.html`);
  await checkExtensionLayout(page, "onboarding-current");
  await page.screenshot({
    path: ".cache/screenshots/extension-onboarding-mobile.png",
    fullPage: true,
  });
  await page.goto("http://localhost:4274/tasks");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  await page.screenshot({
    path: ".cache/screenshots/playground-mobile.png",
    fullPage: true,
  });
  const opened = context.waitForEvent("page");
  const pending = call(page, "playground_reset");
  const confirmation = await opened;
  await confirmation.waitForLoadState();
  await expect(
    confirmation.getByRole("button", { name: "Approve once" }),
  ).toBeVisible();
  await checkExtensionLayout(confirmation, "confirmation-current");
  await checkLongContentLayout(confirmation, "confirmation-current");
  await confirmation.screenshot({
    path: ".cache/screenshots/extension-confirmation.png",
    fullPage: true,
  });
  await confirmation.getByRole("button", { name: "Deny", exact: true }).click();
  await pending;
  await page.close();
});

test("a pending write expires after two minutes without mutating the page", async () => {
  test.setTimeout(150000);
  const page = await context.newPage();
  await page.goto("http://localhost:4274/tasks");
  await expect.poll(() => tools(page)).toContain("playground_list_tasks");
  const before = await call(page, "playground_list_tasks");
  const opened = context.waitForEvent("page");
  const pending = call(page, "playground_create_task", {
    title: "Expired write",
  });
  const confirmation = await opened;
  await confirmation.waitForLoadState();
  expect((await pending).content[0].text).toContain("CONFIRMATION_DENIED");
  expect(await call(page, "playground_list_tasks")).toEqual(before);
  await page.close();
});

test("live public read-only examples", async () => {
  test.skip(
    !process.env.TG_LIVE,
    "Opt-in live canary; network and public site availability are external dependencies.",
  );
  await grant(["https://en.wikipedia.org/*"]);
  await install("wikipedia");
  const page = await context.newPage();
  await page.goto("https://news.ycombinator.com/");
  await expect.poll(() => tools(page)).toContain("hn_front_page");
  const hn = await call(page, "hn_front_page", { limit: 3 });
  expect(hn.isError).not.toBe(true);
  expect(JSON.parse(hn.content[0].text)).toHaveLength(3);
  const api = await call(page, "hn_get_item", { itemId: "8863" });
  expect(api.isError).not.toBe(true);
  expect(JSON.parse(api.content[0].text).id).toBe(8863);
  await page.goto("https://en.wikipedia.org/wiki/Web_browser");
  await expect.poll(() => tools(page)).toContain("wikipedia_current_page");
  const wiki = await call(page, "wikipedia_current_page");
  expect(wiki.isError).not.toBe(true);
  expect(JSON.parse(wiki.content[0].text).title).toContain("Web browser");
  expect(JSON.parse(wiki.content[0].text).summary).toMatch(/web browser/i);
  expect(JSON.parse(wiki.content[0].text).summary.length).toBeGreaterThan(100);
  const section = await call(page, "wikipedia_section_text", {
    section: "History",
  });
  expect(section.isError).not.toBe(true);
  expect(JSON.parse(section.content[0].text).text.length).toBeGreaterThan(100);
  const search = await call(page, "wikipedia_search", { query: "WebMCP" });
  expect(search.isError).not.toBe(true);
  await page.close();
});

test("extension agent setup exports the same connection for each client", async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/connect.html`);
  await expect(
    page.getByRole("heading", { name: "Your agents", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Pairing code", { exact: true })).toBeHidden();
  await page.getByText("Trouble connecting?", { exact: true }).click();
  await page.getByText("Use a pairing code instead", { exact: true }).click();
  await expect(page.getByLabel("Pairing code", { exact: true })).toBeVisible();
  await page.goto(`chrome-extension://${id}/help.html#developers`);
  await page
    .getByText("Native WebMCP developer connection", { exact: true })
    .click();
  await expect(page.locator("#agent-config")).toContainText(
    "[mcp_servers.toolgraft-browser]",
  );
  await page.getByLabel("Your agent", { exact: true }).selectOption("claude");
  const config = JSON.parse(await page.locator("#agent-config").innerText());
  expect(config.mcpServers["toolgraft-browser"].args).toContain(
    "--browserUrl=http://127.0.0.1:9227",
  );
  for (const [name, width] of [
    ["desktop", 1100],
    ["mobile", 390],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `.cache/screenshots/extension-connect-${name}.png`,
      fullPage: true,
    });
  }
  await page.close();
});
