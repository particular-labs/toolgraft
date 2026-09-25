import { checkExtensionLayout } from "./layout";
import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";

for (const native of [false, true])
  test(`one local MCP creates, installs, opens, executes and repairs an adapter (native WebMCP ${native ? "enabled" : "disabled"})`, async () => {
    test.setTimeout(100000);
    const data = await mkdtemp(join(tmpdir(), "toolgraft-core-"));
    const extension = resolve("apps/extension/.output/chrome-mv3");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        native
          ? "--enable-features=WebMCP,WebMCPTesting"
          : "--disable-features=WebMCP,WebMCPTesting",
      ],
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = worker.url().split("/")[2]!;
    const client = new Client({ name: "toolgraft-core-test", version: "1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve("packages/mcp/dist/index.js"),
        "--data-dir",
        data,
        "--port",
        "17835",
      ],
      stderr: "pipe",
    });
    let errors = "";
    transport.stderr?.on("data", (d) => (errors += String(d)));
    const invoke = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args }, undefined, {
        timeout: 150000,
      });
      const v = JSON.parse((r.content as Array<{ text: string }>)[0]!.text);
      if (r.isError) throw new Error(JSON.stringify(v));
      return v;
    };
    let broken = false;
    const fixture = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<title>Authoring fixture</title><main><h1>My reading list</h1><ul><li ${broken ? "data-renamed" : "data-book"}="1">The Left Hand of Darkness</li><li ${broken ? "data-renamed" : "data-book"}="2">A Wizard of Earthsea</li></ul><output id="writes">0</output></main>`,
      );
    });
    await new Promise<void>((resolve) =>
      fixture.listen(0, "127.0.0.1", resolve),
    );
    const url = `http://localhost:${(fixture.address() as { port: number }).port}/toolgraft-fixture`;
    try {
      await client.connect(transport);
      expect((await invoke("toolgraft_get_instructions")).guide).toContain(
        "No ToolGraft AI",
      );
      expect((await invoke("toolgraft_status")).connected).toBe(false);
      const audit = async (page: Page, name: string) => {
        if (!native) await checkExtensionLayout(page, name);
      };
      if (!native) {
        const surface = await context.newPage();
        for (const name of ["popup", "onboarding", "options", "connect"]) {
          await surface.goto(`chrome-extension://${extensionId}/${name}.html`);
          await audit(surface, name + "-initial");
        }
        await surface.goto(`chrome-extension://${extensionId}/agent.html`);
        await audit(surface, "agent-error");
        await surface.goto(
          `chrome-extension://${extensionId}/confirmation.html`,
        );
        await audit(surface, "confirmation-expired");
        await surface.close();
      }
      const pair = await invoke("toolgraft_pair");
      const connect = await context.newPage();
      await connect.goto(`chrome-extension://${extensionId}/connect.html`);
      await connect.getByText("Trouble connecting?", { exact: true }).click();
      await connect
        .getByText("Use a pairing code instead", { exact: true })
        .click();
      await connect.getByLabel("Pairing code", { exact: true }).fill(pair.code);
      await connect.getByText("Connection settings", { exact: true }).click();
      await connect.getByLabel("Local MCP port").fill(String(pair.port));
      await connect.getByLabel("Agent ID", { exact: true }).fill(pair.agentId);
      await connect
        .getByRole("button", { name: "Pair browser", exact: true })
        .click();
      await expect(
        connect.getByText("Connected to your agent", { exact: true }),
      ).toBeVisible();
      const settings = await context.newPage();
      await settings.goto(`chrome://extensions/?id=${extensionId}`);
      const dev = settings.locator("#devMode");
      if ((await dev.getAttribute("aria-pressed")) === "false")
        await dev.click();
      const toggle = settings
        .locator("#allow-user-scripts")
        .locator("cr-toggle");
      await toggle.waitFor();
      if ((await toggle.getAttribute("aria-pressed")) === "false")
        await toggle.click();
      // Seed the actual Chrome host grant, as in the native extension suite. Approval UI still runs.
      const begin = await invoke("toolgraft_begin_authoring", {
        url,
        intent: "Read the book titles",
      });
      expect(begin.state).toBe("awaiting_site_access");
      await settings.evaluate(async (id) => {
        await (chrome as any).developerPrivate.addHostPermission(
          id,
          "http://localhost/*",
        );
      }, extensionId);
      await settings.close();
      const access = context
        .pages()
        .find((p) =>
          p.url().includes("agent.html?request=" + begin.requestId),
        )!;
      await audit(access, "agent-access-pending");
      await access
        .getByRole("button", { name: "Allow site inspection" })
        .click();
      await expect(
        access.getByText("Site access granted. Your agent can continue."),
      ).toBeVisible();
      await audit(access, "agent-access-approved");
      const inspection = await invoke("toolgraft_inspect", {
        sessionId: begin.sessionId,
      });
      expect(inspection.bodyText).toContain("A Wizard of Earthsea");
      expect(context.pages().filter((p) => p.url() === url)).toHaveLength(1);
      const draft = await invoke("toolgraft_scaffold", {
        sessionId: begin.sessionId,
        url,
        adapterId: "local.reading-list",
        title: "Reading list",
        description: "Read book titles from the selected page",
      });
      const readTool = (selector: string) => ({
        name: "reading_list",
        description: "Read the visible book titles",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: `() => { const rows = [...document.querySelectorAll('${selector}')]; if (!rows.length) throw new ToolGraftError('PAGE_SHAPE_CHANGED','Book list was not found'); return textResult(rows.map(e=>e.textContent)); }`,
      });
      const writeTool = {
        name: "increment_count",
        description: "Increment the visible test counter",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute:
          "() => { const e = document.querySelector('#writes'); e.textContent = String(Number(e.textContent)+1); return textResult(e.textContent); }",
      };
      let patched = await invoke("toolgraft_patch", {
        draftId: draft.draftId,
        revision: 1,
        tools: [readTool("[data-book]"), writeTool],
      });
      const first = await invoke("toolgraft_validate", {
        draftId: draft.draftId,
        revision: patched.revision,
      });
      const denied = await invoke("toolgraft_request_install", {
        candidateId: first.candidateId,
      });
      const deniedPage = await reviewPage(context, denied.requestId);
      await audit(deniedPage, "agent-install-pending");
      await deniedPage
        .getByText("Review generated source", { exact: true })
        .click();
      await audit(deniedPage, "agent-install-source-expanded");
      await deniedPage
        .getByRole("button", { name: "Decline", exact: true })
        .click();
      expect(
        (
          await invoke("toolgraft_install_status", {
            requestId: denied.requestId,
          })
        ).state,
      ).toBe("declined");
      await audit(deniedPage, "agent-install-declined");
      expect(
        await invoke("toolgraft_find_tools", { query: "reading_list" }),
      ).toHaveLength(0);
      const install = await invoke("toolgraft_request_install", {
        candidateId: first.candidateId,
      });
      const review = await reviewPage(context, install.requestId);
      await review
        .getByRole("button", { name: "Approve site access and install" })
        .click();
      await expect(
        review.getByText("Installed. Your agent can now test the tools."),
      ).toBeVisible();
      const installed = await invoke("toolgraft_install_status", {
        requestId: install.requestId,
      });
      expect(installed.state).toBe("installed");
      expect(installed.digest).toBe(first.digest);
      await audit(review, "agent-installed");
      if (!native) {
        const manager = await context.newPage();
        await manager.goto(`chrome-extension://${extensionId}/options.html`);
        await audit(manager, "options-installed");
        await manager.close();
      }

      for (const page of context.pages())
        if (page.url() === url) await page.close();
      const out = await invoke("toolgraft_call", {
        adapterId: "local.reading-list",
        tool: "reading_list",
      });
      expect(out.result.content[0].text).toContain("The Left Hand of Darkness");
      const page = context.pages().find((p) => p.url() === url)!;
      expect(
        await page.evaluate(() => typeof (document as any).modelContext),
      ).toBe(native ? "object" : "undefined");
      expect(
        (
          await invoke("toolgraft_call", {
            adapterId: "local.reading-list",
            tool: "reading_list",
          })
        ).tabId,
      ).toBe(out.tabId);
      for (const approved of [false, true]) {
        const opened = context.waitForEvent("page");
        const pending = invoke("toolgraft_call", {
          adapterId: "local.reading-list",
          tool: "increment_count",
        });
        const confirmation = await opened;
        if (!approved) await audit(confirmation, "confirmation-pending");
        await confirmation
          .getByRole("button", {
            name: approved ? "Approve once" : "Deny",
            exact: true,
          })
          .click();
        const result = await pending;
        expect(result.result.isError ?? false).toBe(!approved);
      }
      expect(await page.locator("#writes").innerText()).toBe("1");
      broken = true;
      await page.reload();
      const failure = await invoke("toolgraft_call", {
        adapterId: "local.reading-list",
        tool: "reading_list",
      });
      expect(failure.result.isError).toBe(true);
      expect(failure.result.content[0].text).toContain("PAGE_SHAPE_CHANGED");
      patched = await invoke("toolgraft_patch", {
        draftId: draft.draftId,
        revision: patched.revision,
        version: "0.1.1",
        tools: [readTool("[data-book], [data-renamed]"), writeTool],
      });
      const stale = await client.callTool({
        name: "toolgraft_request_install",
        arguments: { candidateId: first.candidateId },
      });
      expect(stale.isError).toBe(true);
      const repaired = await invoke("toolgraft_validate", {
        draftId: draft.draftId,
        revision: patched.revision,
      });
      if (!native) {
        const exported = await invoke("toolgraft_export", {
          draftId: draft.draftId,
        });
        const manager = await context.newPage();
        await manager.goto(`chrome-extension://${extensionId}/options.html`);
        await manager
          .getByLabel("Install a local adapter (.tgz)", { exact: true })
          .setInputFiles(exported.archive);
        await expect(manager.getByRole("dialog")).toBeVisible();
        await expect(
          manager.getByRole("dialog").getByRole("heading", { level: 2 }),
        ).toBeInViewport();
        await audit(manager, "options-update-review");
        await manager
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await manager.close();
      }
      const update = await invoke("toolgraft_request_install", {
        candidateId: repaired.candidateId,
      });
      const updatePage = await reviewPage(context, update.requestId);
      await audit(updatePage, "agent-update-pending");
      await updatePage
        .getByRole("button", { name: "Approve site access and install" })
        .click();
      await expect(
        updatePage.getByText("Installed. Your agent can now test the tools."),
      ).toBeVisible();
      const verified = await invoke("toolgraft_verify", {
        adapterId: "local.reading-list",
        tool: "reading_list",
      });
      expect(verified.version).toBe("0.1.1");
      expect(verified.result.content[0].text).toContain("A Wizard of Earthsea");
      await audit(connect, "connect-paired");
      await connect.goto(
        `chrome-extension://${extensionId}/help.html#developers`,
      );
      await connect
        .getByText("Native WebMCP developer connection", { exact: true })
        .click();
      await audit(connect, "connect-expanded");
      for (const [name, width] of [
        ["desktop", 1100],
        ["mobile", 390],
      ] as const) {
        await connect.setViewportSize({ width, height: 900 });
        expect(
          await connect.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await connect.screenshot({
          path: `.cache/screenshots/agent-pair-${name}.png`,
          fullPage: true,
        });
      }
      await updatePage.screenshot({
        path: ".cache/screenshots/agent-install.png",
        fullPage: true,
      });
    } catch (e) {
      console.error(errors);
      throw e;
    } finally {
      await client.close();
      await context.close();
      await new Promise<void>((resolve) => fixture.close(() => resolve()));
      await rm(data, { recursive: true, force: true });
    }
  });
async function reviewPage(context: BrowserContext, id: string): Promise<Page> {
  await expect
    .poll(() =>
      context.pages().some((p) => p.url().includes("agent.html?request=" + id)),
    )
    .toBe(true);
  return context
    .pages()
    .find((p) => p.url().includes("agent.html?request=" + id))!;
}
