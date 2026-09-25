import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { canonical, sha256 } from "@toolgraft/adapter-schema";
import { checkExtensionLayout } from "./layout";

test("version history, scheduled detection, reviewed update and explicit rollback through UI and MCP", async () => {
  test.setTimeout(120000);
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<title>Version fixture</title><h1>Version fixture</h1>");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://localhost:${(server.address() as { port: number }).port}/versions?fixture=1`;
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
  const data = await mkdtemp(join(tmpdir(), "toolgraft-versions-"));
  const client = new Client({ name: "version-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve("packages/mcp/dist/index.js"),
      "--port",
      "17838",
      "--data-dir",
      data,
    ],
    stderr: "pipe",
  });
  const invoke = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args }, undefined, {
      timeout: 60000,
    });
    const value = JSON.parse((r.content as { text: string }[])[0]!.text);
    if (r.isError) throw new Error(JSON.stringify(value));
    return value;
  };
  try {
    await client.connect(transport);
    const pair = await invoke("toolgraft_pair");
    const connect = await context.newPage();
    await connect.goto(`chrome-extension://${id}/connect.html`);
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
    await settings.goto(`chrome://extensions/?id=${id}`);
    if (
      (await settings.locator("#devMode").getAttribute("aria-pressed")) ===
      "false"
    )
      await settings.locator("#devMode").click();
    const toggle = settings.locator("#allow-user-scripts cr-toggle");
    await toggle.waitFor();
    if ((await toggle.getAttribute("aria-pressed")) === "false")
      await toggle.click();
    await settings.evaluate(async (id) => {
      await (chrome as any).developerPrivate.addHostPermission(
        id,
        "http://localhost/*",
      );
    }, id);
    await settings.close();
    const session = await invoke("toolgraft_begin_authoring", {
      url,
      intent: "Read the active adapter version",
    });
    const draft = await invoke("toolgraft_scaffold", {
      sessionId: session.sessionId,
      url,
      adapterId: "local.version-proof",
      title: "Version proof",
      description: "Synthetic fixture for version lifecycle testing",
    });
    let revision = draft.revision;
    const candidates: Record<string, any> = {};
    const archives: Record<string, number[]> = {};
    const entries: any[] = [];
    for (const version of ["1.0.0", "1.2.0", "1.10.0", "1.11.0", "1.12.0"]) {
      const next = await invoke("toolgraft_patch", {
        draftId: draft.draftId,
        revision,
        version,
        tools: [
          {
            name: "read_version",
            description: "Read fixture title and actual running version",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: `()=>textResult({title:document.title,runningVersion:${JSON.stringify(version)}})`,
          },
        ],
      });
      revision = next.revision;
      const candidate = await invoke("toolgraft_validate", {
        draftId: draft.draftId,
        revision,
      });
      candidates[version] = candidate;
      const exported = await invoke("toolgraft_export", {
        draftId: draft.draftId,
      });
      const path = `packages/local.version-proof/${version}/adapter.tgz`;
      archives[path] = [...(await readFile(exported.archive))];
      entries.push({
        id: "local.version-proof",
        version,
        title: "Version proof",
        runtime: "script",
        matches: candidate.manifest.matches,
        manifestSha256: await sha256(canonical(candidate.manifest)),
        artifact: path,
        sourceCommit: "a".repeat(40),
        review: version === "1.11.0" ? "experimental" : "reviewed",
        publishedAt: new Date().toISOString(),
      });
      if (version === "1.0.0") {
        const request = await invoke("toolgraft_request_install", {
          candidateId: candidate.candidateId,
        });
        const page = await reviewPage(context, request.requestId);
        await page
          .getByRole("button", { name: "Approve site access and install" })
          .click();
        await expect(
          page.getByText("Installed. Your agent can now test the tools."),
        ).toBeVisible();
      }
    }
    const safety = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      revoked: [
        {
          id: "local.version-proof",
          version: "1.12.0",
          reason: "Synthetic revoked fixture",
        },
      ],
    };
    // Only HTTP transport is supplied by fixtures. The actual service worker runs
    // its scheduled refresh, schema/hash checks, storage, approval and user scripts.
    await worker.evaluate(
      ({ entries, archives, safety }) => {
        const base = "https://particular-labs.github.io/toolgraft/registry/";
        const original = globalThis.fetch;
        (globalThis as any).versionFixtureOffline = false;
        globalThis.fetch = async (input, init) => {
          const url = String(input);
          if (!url.startsWith(base)) return original(input, init);
          if ((globalThis as any).versionFixtureOffline)
            throw new Error("Fixture offline");
          const path = url.slice(base.length);
          if (path === "index.v1.json")
            return new Response(JSON.stringify({ schemaVersion: 1, entries }));
          if (path === "revocations.v1.json")
            return new Response(JSON.stringify(safety));
          const bytes = archives[path];
          return bytes
            ? new Response(new Uint8Array(bytes))
            : new Response("Missing", { status: 404 });
        };
      },
      { entries, archives, safety },
    );
    await worker.evaluate(() =>
      chrome.alarms.create("safety-refresh", { when: Date.now() + 150 }),
    );
    await expect
      .poll(async () => (await invoke("toolgraft_versions")).refreshedAt)
      .toBeTruthy();
    const catalog = await invoke("toolgraft_versions", {
      adapterId: "local.version-proof",
    });
    expect(catalog.adapters[0].updateVersion).toBe("1.10.0");
    expect(catalog.adapters[0].installedVersion).toBe("1.0.0");
    const running = async () => {
      const out = await invoke("toolgraft_call", {
        adapterId: "local.version-proof",
        tool: "read_version",
      });
      expect(out.result.isError ?? false).toBe(false);
      return JSON.parse(out.result.content[0].text).runningVersion;
    };
    expect(await running()).toBe("1.0.0"); // Refresh never activates an update.
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html`);
    await expect(
      options.getByText("Update available: 1.10.0", { exact: true }),
    ).toBeVisible();
    await options.getByText("Version history (5)", { exact: true }).click();
    await expect(options.getByText("Revoked", { exact: true })).toBeVisible();
    await expect(
      options.getByText("Not publicly reviewed", { exact: true }),
    ).toBeVisible();
    await options
      .getByText("Source and identity", { exact: true })
      .first()
      .click();
    await checkExtensionLayout(options, "versions-update-available");
    await options
      .getByRole("button", { name: "Review update 1.10.0", exact: true })
      .first()
      .click();
    await expect(
      options.getByRole("dialog").getByRole("heading", { level: 2 }),
    ).toHaveText("Update Version proof to 1.10.0?");
    await options.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await running()).toBe("1.0.0");
    const update = await invoke("toolgraft_request_version", {
      adapterId: "local.version-proof",
      version: "1.10.0",
    });
    const updatePage = await reviewPage(context, update.requestId);
    await expect(
      updatePage.getByText("1.0.0 → 1.10.0", { exact: true }),
    ).toBeVisible();
    await updatePage
      .getByRole("button", { name: "Approve site access and install" })
      .click();
    await expect(
      updatePage.getByText("Installed. Your agent can now test the tools."),
    ).toBeVisible();
    expect(await running()).toBe("1.10.0");
    await options.reload();
    await options.getByText("Version history (5)", { exact: true }).click();
    await options
      .getByRole("button", { name: "Review rollback to 1.0.0", exact: true })
      .click();
    await expect(
      options.getByRole("dialog").getByRole("heading", { level: 2 }),
    ).toHaveText("Roll back Version proof to 1.0.0?");
    await checkExtensionLayout(options, "versions-rollback-review");
    await options.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(await running()).toBe("1.10.0");
    // Local rollback must work with the catalog offline.
    await worker.evaluate(() => {
      (globalThis as any).versionFixtureOffline = true;
    });
    const rollback = await invoke("toolgraft_request_version", {
      adapterId: "local.version-proof",
      version: "1.0.0",
    });
    const rollbackPage = await reviewPage(context, rollback.requestId);
    await checkExtensionLayout(rollbackPage, "versions-mcp-rollback");
    await expect(
      rollbackPage.getByText("1.10.0 → 1.0.0", { exact: true }),
    ).toBeVisible();
    await rollbackPage
      .getByRole("button", { name: "Approve rollback to 1.0.0", exact: true })
      .click();
    await expect(
      rollbackPage.getByText("Installed. Your agent can now test the tools."),
    ).toBeVisible();
    expect(await running()).toBe("1.0.0");
    // Roll forward from retained history using the UI, then reload the matching tab.
    await options.reload();
    await options
      .getByRole("button", { name: "Review update 1.10.0", exact: true })
      .first()
      .click();
    await options
      .getByRole("button", {
        name: "Approve site access and install",
        exact: true,
      })
      .click();
    await expect(options.getByRole("dialog")).toHaveCount(0);
    for (const p of context.pages()) if (p.url() === url) await p.reload();
    expect(await running()).toBe("1.10.0");
    await expect(
      invoke("toolgraft_versions", { refresh: true }),
    ).rejects.toThrow("offline");
    const offline = await invoke("toolgraft_versions");
    expect(offline.refreshError).toContain("offline");
    expect(offline.adapters[0].installedVersion).toBe("1.10.0");
    await options.reload();
    await options.getByRole("tab", { name: "Catalog", exact: true }).click();
    await expect(options.getByText(/Last check failed:/)).toBeVisible();
    await checkExtensionLayout(options, "versions-offline");
    // Revoke the retained old version; local availability must not bypass safety.
    await worker.evaluate(
      async (safety) =>
        chrome.storage.local.set({
          revocations: {
            ...safety,
            revoked: [
              ...safety.revoked,
              {
                id: "local.version-proof",
                version: "1.0.0",
                reason: "Synthetic local revocation",
              },
            ],
          },
        }),
      safety,
    );
    await expect(
      invoke("toolgraft_request_version", {
        adapterId: "local.version-proof",
        version: "1.0.0",
      }),
    ).rejects.toThrow("revoked");
    expect(await running()).toBe("1.10.0");
  } finally {
    await client.close();
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await rm(data, { recursive: true, force: true });
  }
});
async function reviewPage(context: BrowserContext, id: string) {
  await expect
    .poll(() => context.pages().some((p) => p.url().includes("request=" + id)))
    .toBe(true);
  return context.pages().find((p) => p.url().includes("request=" + id))!;
}
