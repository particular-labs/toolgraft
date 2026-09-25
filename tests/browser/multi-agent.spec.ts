import { test, expect, chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { compileDraft } from "../../packages/mcp/src/builder";
import { checkExtensionLayout } from "./layout";

test("two real MCP processes share one bridge with separate approval, requests, restart and disconnect", async () => {
  test.setTimeout(120000);
  const dir = await mkdtemp(join(tmpdir(), "tg-multi-"));
  // Simulate an old preview or unrelated program occupying the preferred port.
  const occupied = createServer((s) => s.end());
  await new Promise<void>((r) => occupied.listen(0, "127.0.0.1", r));
  const preferred = (occupied.address() as { port: number }).port;
  const extension = resolve("apps/extension/.output/chrome-mv3");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      "--disable-features=WebMCP,WebMCPTesting",
    ],
  });
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  const id = worker.url().split("/")[2]!;
  const clients: Client[] = [];
  async function start(name: string) {
    const client = new Client({ name, version: "1" });
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          resolve("packages/mcp/dist/index.js"),
          "--data-dir",
          dir,
          "--port",
          String(preferred),
        ],
        stderr: "pipe",
      }),
    );
    return client;
  }
  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const r = await client.callTool({ name, arguments: args }, undefined, {
      timeout: 60000,
    });
    const result = JSON.parse((r.content as { text: string }[])[0]!.text);
    if (r.isError) throw new Error(result.error ?? JSON.stringify(result));
    return result;
  }
  const status = (client: Client) => call(client, "toolgraft_status");
  async function pair(client: Client) {
    const pairing = await call(client, "toolgraft_pair");
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/connect.html`);
    await page.getByText("Trouble connecting?", { exact: true }).click();
    await page.getByText("Use a pairing code instead", { exact: true }).click();
    await page.getByLabel("Pairing code", { exact: true }).fill(pairing.code);
    await page.getByText("Connection settings", { exact: true }).click();
    await page.getByLabel("Local MCP port").fill(String(pairing.port));
    await page.getByLabel("Agent ID", { exact: true }).fill(pairing.agentId);
    await page
      .getByRole("button", { name: "Pair browser", exact: true })
      .click();
    await expect.poll(async () => (await status(client)).connected).toBe(true);
    await page.close();
  }
  try {
    let [a, b] = await Promise.all([start("Codex test"), start("Claude test")]);
    const [as, bs] = await Promise.all([status(a), status(b)]);
    expect(as.port).toBe(bs.port);
    expect(as.port).not.toBe(preferred);
    expect(as.agentId).not.toBe(bs.agentId);
    expect(as.connected).toBe(false);
    expect(bs.connected).toBe(false);
    const endpointPath = join(dir, "bridge-v2/endpoint.json");
    const firstHost = JSON.parse(await readFile(endpointPath, "utf8"));
    expect(
      (
        await fetch(`http://127.0.0.1:${as.port}/rpc`, {
          method: "POST",
          body: '{"operation":"register"}',
        })
      ).status,
    ).toBe(403);
    await pair(a);
    expect((await status(b)).connected).toBe(false);
    await pair(b);
    expect((await status(a)).connected).toBe(true);
    const settings = await context.newPage();
    await settings.goto(`chrome://extensions/?id=${id}`);
    if (
      (await settings.locator("#devMode").getAttribute("aria-pressed")) ===
      "false"
    )
      await settings.locator("#devMode").click();
    const toggle = settings.locator("#allow-user-scripts cr-toggle");
    if ((await toggle.getAttribute("aria-pressed")) === "false")
      await toggle.click();
    await settings.evaluate(async (id) => {
      await (chrome as any).developerPrivate.addHostPermission(
        id,
        "http://localhost/*",
      );
    }, id);
    await settings.close();
    const source = {
      id: "local.multi-agent",
      version: "0.1.0",
      title: "Multi agent proof",
      description: "Read and write on the playground",
      url: "http://localhost:4274/tasks",
      tools: [
        {
          name: "read_title",
          description: "Read this page title",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: "()=>textResult({title:document.title})",
        },
        {
          name: "write_marker",
          description: "Set a test marker",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            untrustedContentHint: true,
          },
          execute:
            "()=>{document.body.dataset.multiAgentWrite='yes';return textResult('written')}",
        },
      ],
    };
    const built = await compileDraft(
      source,
      await readFile("packages/mcp/dist/runtime.js", "utf8"),
      await readFile("LICENSE", "utf8"),
    );
    const archive = join(dir, "adapter.tgz");
    await writeFile(archive, built.bytes);
    const request = await call(a, "toolgraft_request_package_install", {
      path: archive,
      url: source.url,
    });
    await expect(
      call(b, "toolgraft_install_status", { requestId: request.requestId }),
    ).rejects.toThrow("another agent session");
    await expect
      .poll(() =>
        context.pages().some((p) => p.url().includes(request.requestId)),
      )
      .toBe(true);
    const review = context
      .pages()
      .find((p) => p.url().includes(request.requestId))!;
    await expect(
      review.getByText("Requested by Codex test", { exact: true }),
    ).toBeVisible();
    await review
      .getByRole("button", { name: "Approve site access and install" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await call(a, "toolgraft_install_status", {
              requestId: request.requestId,
            })
          ).state,
      )
      .toBe("installed");
    const session = await call(a, "toolgraft_begin_authoring", {
      url: source.url,
      intent: "Read title",
    });
    await expect(
      call(b, "toolgraft_inspect", { sessionId: session.sessionId }),
    ).rejects.toThrow("another agent session");
    const draft = await call(a, "toolgraft_scaffold", {
      sessionId: session.sessionId,
      url: source.url,
      adapterId: "local.private-draft",
      title: "Private draft",
      description: "Agent scoped draft",
    });
    await expect(
      call(b, "toolgraft_get_draft", { draftId: draft.draftId }),
    ).rejects.toThrow("Draft not found");

    for (const c of [a, b])
      expect(
        (
          await call(c, "toolgraft_call", {
            adapterId: source.id,
            tool: "read_title",
          })
        ).result.isError ?? false,
      ).toBe(false);
    const opened = context.waitForEvent("page");
    const writing = call(a, "toolgraft_call", {
      adapterId: source.id,
      tool: "write_marker",
    });
    const confirmation = await opened;
    await expect(
      confirmation.getByRole("button", { name: "Deny", exact: true }),
    ).toBeVisible();
    await expect(
      call(b, "toolgraft_call", { adapterId: source.id, tool: "write_marker" }),
    ).rejects.toThrow("Another operation");
    await confirmation
      .getByRole("button", { name: "Deny", exact: true })
      .click();
    expect((await writing).result.isError).toBe(true);
    const approvalOpened = context.waitForEvent("page");
    const approvedWrite = call(a, "toolgraft_call", {
      adapterId: source.id,
      tool: "write_marker",
    });
    const approval = await approvalOpened;
    await expect(
      approval.getByText("Requested by Codex test", { exact: true }),
    ).toBeVisible();
    await approval
      .getByRole("button", { name: "Approve once", exact: true })
      .click();
    expect((await approvedWrite).result.isError ?? false).toBe(false);
    await a.close();
    expect((await status(b)).connected).toBe(true);
    a = await start("Codex test");
    expect((await status(a)).connected).toBe(true);
    expect(
      (await call(a, "toolgraft_get_draft", { draftId: draft.draftId })).draft
        .id,
    ).toBe("local.private-draft");
    expect(JSON.parse(await readFile(endpointPath, "utf8")).pid).toBe(
      firstHost.pid,
    );
    await expect(
      call(a, "toolgraft_inspect", { sessionId: session.sessionId }),
    ).rejects.toThrow(/expired|another agent session/);
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${id}/connect.html`);
    await expect(
      panel.getByRole("button", { name: "Disconnect Codex test", exact: true }),
    ).toBeVisible();
    await checkExtensionLayout(panel, "multi-agent-connections");
    const cancelledOpened = context.waitForEvent("page");
    const cancelledWrite = call(a, "toolgraft_call", {
      adapterId: source.id,
      tool: "write_marker",
    }).catch((error) => ({ error: String(error) }));
    const cancelled = await cancelledOpened;
    await expect(
      cancelled.getByRole("button", { name: "Approve once", exact: true }),
    ).toBeVisible();
    await panel
      .getByRole("button", { name: "Disconnect Codex test", exact: true })
      .click();
    await expect.poll(() => cancelled.isClosed()).toBe(true);
    expect(await cancelledWrite).toHaveProperty("error");
    await expect.poll(async () => (await status(a)).connected).toBe(false);
    expect((await status(b)).connected).toBe(true);
    expect(
      (
        await call(b, "toolgraft_call", {
          adapterId: source.id,
          tool: "read_title",
        })
      ).result.isError ?? false,
    ).toBe(false);
    // Restart the shared host too: retained approvals reconnect, revoked ones do not.
    process.kill(firstHost.pid, "SIGKILL");
    await expect
      .poll(async () => {
        try {
          process.kill(firstHost.pid, 0);
          return false;
        } catch {
          return true;
        }
      })
      .toBe(true);
    const restarted = await Promise.all([status(a), status(b)]);
    expect(restarted[0].port).toBe(restarted[1].port);
    expect(JSON.parse(await readFile(endpointPath, "utf8")).pid).not.toBe(
      firstHost.pid,
    );
    await expect
      .poll(async () => (await status(b)).connected, { timeout: 40000 })
      .toBe(true);
    expect((await status(a)).connected).toBe(false);
  } finally {
    await Promise.all(clients.map((c) => c.close().catch(() => {})));
    await context.close();
    try {
      const e = JSON.parse(
        await readFile(join(dir, "bridge-v2/endpoint.json"), "utf8"),
      );
      process.kill(e.pid, "SIGTERM");
    } catch {}
    occupied.close();
    await rm(dir, { recursive: true, force: true });
  }
});
