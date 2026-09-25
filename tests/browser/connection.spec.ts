import { createServer } from "node:http";
import { test, expect, chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compileDraft } from "../../packages/mcp/src/builder";
import { checkExtensionLayout, checkLongContentLayout } from "./layout";

test("private connection link, explicit browser approval and agent-delivered local adapter", async () => {
  test.setTimeout(180000);
  const dir = await mkdtemp(join(tmpdir(), "tg-connect-"));
  const extension = join(dir, "extension");
  await cp(resolve("apps/extension/.output/chrome-mv3"), extension, {
    recursive: true,
  });
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
  let client = new Client({ name: "connection-proof", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      resolve("packages/mcp/dist/index.js"),
      "--port",
      "17841",
      "--data-dir",
      dir,
    ],
    stderr: "pipe",
  });
  const invoke = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args }, undefined, {
      timeout: 60000,
    });
    const text = (r.content as { text: string }[])[0]!.text;
    // SDK schema errors use MCP text; application results use JSON.
    if (r.isError) throw new Error(text);
    return JSON.parse(text);
  };
  const slowServer = createServer((req, res) => {
    if (req.url === "/never-finish.png") return;
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<title>Ready content</title><h1>Ready before ads</h1><ul><li>First</li><li>Second</li><li>Third</li></ul><img src="/never-finish.png">',
    );
  });
  await new Promise<void>((r) => slowServer.listen(0, "127.0.0.1", r));
  const slowUrl = `http://localhost:${(slowServer.address() as { port: number }).port}`;
  try {
    await client.connect(transport);
    const connection = await invoke("toolgraft_connect");
    const page = await context.newPage();
    await page.goto(connection.url);
    expect((await invoke("toolgraft_status")).connected).toBe(false);
    await expect(
      page.getByRole("heading", { name: "Connect your agent." }),
    ).toBeVisible();
    await checkExtensionLayout(page, "connection-invitation");
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
    // Test harness supplies localhost access; a real toolbar click supplies activeTab.
    await settings.evaluate(async (id) => {
      await (chrome as any).developerPrivate.addHostPermission(
        id,
        "http://127.0.0.1/*",
      );
      await (chrome as any).developerPrivate.addHostPermission(
        id,
        "http://localhost/*",
      );
    }, id);
    await settings.close();
    const permissionPage = await context.newPage();
    await permissionPage.goto(`chrome-extension://${id}/options.html`);
    expect(
      await permissionPage.evaluate(() =>
        chrome.permissions.request({
          origins: ["http://127.0.0.1/*", "http://localhost/*"],
        }),
      ),
    ).toBe(true);
    await permissionPage.close();
    await page.bringToFront();
    await worker.evaluate(async (connectionUrl) => {
      const tabs = await chrome.tabs.query({});
      const target = tabs.find((t) => t.url === connectionUrl);
      if (!target?.id) throw new Error("Missing invitation test tab");
      await chrome.tabs.update(target.id, { active: true });
    }, connection.url);
    const popupPromise = context.waitForEvent("page");
    // Playwright does not expose Chrome toolbar popup targets. Load its real UI
    // in an inactive tab so its activeTab lookup still sees the invitation.
    await worker.evaluate(() =>
      chrome.tabs.create({
        url: chrome.runtime.getURL("/popup.html"),
        active: false,
      }),
    );
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(
      popup.getByRole("button", { name: "Connect this agent", exact: true }),
    ).toBeVisible();
    await checkExtensionLayout(popup, "connection-approval");
    expect((await invoke("toolgraft_status")).connected).toBe(false);
    await popup
      .getByRole("button", { name: "Connect this agent", exact: true })
      .click();
    await expect(
      popup.getByText(
        "Connected. Return to your agent and ask for a website task.",
        { exact: true },
      ),
    ).toBeVisible();
    expect((await invoke("toolgraft_status")).connected).toBe(true);
    await expect(page).toHaveURL(connection.url.split("#")[0]);
    await popup.close();
    // Optional connection links open extension review in the SAME tab, never pair automatically.
    const preferences = await context.newPage();
    await preferences.goto(`chrome-extension://${id}/options.html`);
    await preferences
      .getByRole("tab", { name: "Settings", exact: true })
      .click();
    await preferences
      .getByRole("button", { name: "Enable one-tab connections", exact: true })
      .click();
    await preferences.goto(`chrome-extension://${id}/connect.html`);
    await expect(
      preferences.getByRole("button", { name: "Copy setup instructions" }),
    ).toBeHidden();
    await preferences
      .getByRole("button", { name: "Add agent", exact: true })
      .click();
    await expect(
      preferences.getByRole("button", { name: "Copy setup instructions" }),
    ).toBeVisible();
    await preferences
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    expect((await invoke("toolgraft_status")).connected).toBe(false);
    const nextLink = await invoke("toolgraft_connect");
    const invitation = await context.newPage();
    await invitation
      .goto(nextLink.url, { waitUntil: "domcontentloaded" })
      .catch(() => {});
    await expect(invitation).toHaveURL(`chrome-extension://${id}/connect.html`);
    await expect(
      invitation.getByRole("button", {
        name: "Connect this agent",
        exact: true,
      }),
    ).toBeVisible();
    await invitation
      .getByRole("button", { name: "Not now", exact: true })
      .click();
    await expect(
      invitation.getByRole("heading", {
        name: "Your agents",
        exact: true,
      }),
    ).toBeVisible();
    expect((await invoke("toolgraft_status")).connected).toBe(false);
    const approvedLink = await invoke("toolgraft_connect");
    await invitation
      .goto(approvedLink.url, { waitUntil: "domcontentloaded" })
      .catch(() => {});
    await expect(
      invitation.getByRole("button", {
        name: "Connect this agent",
        exact: true,
      }),
    ).toBeVisible();
    expect((await invoke("toolgraft_status")).connected).toBe(false);
    await invitation
      .getByRole("button", { name: "Connect this agent", exact: true })
      .click();
    await expect(
      invitation.getByText(
        "Connected. Return to your agent and ask for a website task.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect
      .poll(async () => (await invoke("toolgraft_status")).connected)
      .toBe(true);
    await preferences.close();
    await invitation.close();
    // Slow subresources must not block DOM inspection; automatic cleanup stays scoped
    // to untouched background tabs created by this session.

    const userTab = await context.newPage();
    await userTab.goto(`${slowUrl}/slow-content?user`, {
      waitUntil: "domcontentloaded",
    });
    const first = await invoke("toolgraft_begin_authoring", {
      url: `${slowUrl}/slow-content?keep`,
      intent: "Read",
    });
    expect(first.state).toBe("ready");
    await expect
      .poll(() =>
        context.pages().some((p) => p.url().endsWith("slow-content?keep")),
      )
      .toBe(true);
    const kept = context
      .pages()
      .find((p) => p.url().endsWith("slow-content?keep"))!;
    await kept.bringToFront();
    await page.bringToFront();
    for (let i = 0; i < 10; i++) {
      const session = await invoke("toolgraft_begin_authoring", {
        url: `${slowUrl}/slow-content?n=${i}`,
        intent: "Read",
      });
      expect(session.state).toBe("ready");
      const info = await invoke("toolgraft_inspect", {
        sessionId: session.sessionId,
      });
      expect(info.bodyText).toContain("Ready before ads");
    }
    const cleanup = await invoke("toolgraft_release_pages");
    expect(cleanup.released).toBeGreaterThan(0);
    expect(userTab.isClosed()).toBe(false);
    expect(kept.isClosed()).toBe(false);
    await userTab.close();
    await kept.close();
    const draft = {
      id: "local.connection-proof",
      version: "0.1.0",
      title: "Connection proof",
      description: "Read the live playground title",
      url: `${slowUrl}/tasks`,
      tools: [
        {
          name: "read_title",
          description: "Read the document title",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: "()=>textResult({title:document.title})",
        },
      ],
    };
    const built = await compileDraft(
      draft,
      await readFile("packages/mcp/dist/runtime.js", "utf8"),
      await readFile("LICENSE", "utf8"),
    );
    const archive = join(dir, "adapter.tgz");
    await writeFile(archive, built.bytes);
    await expect(
      invoke("toolgraft_request_package_install", {
        path: archive,
        url: "https://example.com",
      }),
    ).rejects.toThrow("does not match");
    const request = await invoke("toolgraft_request_package_install", {
      path: archive,
      url: draft.url,
    });
    await expect
      .poll(() =>
        context
          .pages()
          .some((p) => p.url().includes("request=" + request.requestId)),
      )
      .toBe(true);
    const review = context
      .pages()
      .find((p) => p.url().includes("request=" + request.requestId))!;
    await expect(
      review.getByRole("heading", { name: "Install Connection proof?" }),
    ).toBeVisible();
    expect((await invoke("toolgraft_status")).browser.installed).toHaveLength(
      0,
    );
    await checkExtensionLayout(review, "connection-package-review");
    await checkLongContentLayout(review, "connection-package-review");
    await review
      .getByRole("button", { name: "Approve site access and install" })
      .click();
    await expect(
      review.getByText("Installed. Your agent can now test the tools."),
    ).toBeVisible();
    expect(
      (
        await invoke("toolgraft_install_status", {
          requestId: request.requestId,
        })
      ).state,
    ).toBe("installed");
    // A consumer outside the repo can discover the route without reading files.
    const definitions = await invoke("toolgraft_find_tools", {
      query: "connection-proof",
    });
    expect(definitions).toHaveLength(1);
    expect(
      await invoke("toolgraft_find_tools", {
        query: "document title something",
      }),
    ).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      adapterId: draft.id,
      name: "read_title",
      matches: ["http://localhost/tasks"],
      launchUrl: draft.url,
    });
    // Misspelled MCP fields must not silently turn an intended input into {}.
    await expect(
      invoke("toolgraft_call", {
        adapterId: draft.id,
        tool: "read_title",
        arguments: '{"keyword":"Arecibo"}',
      }),
    ).rejects.toThrow(/arguments|unrecognized/i);
    const result = await invoke("toolgraft_call", {
      adapterId: draft.id,
      tool: "read_title",
    });
    expect(result.result.isError ?? false).toBe(false);
    expect(JSON.parse(result.result.content[0].text).title).toBeTruthy();
    // A missing or stale saved route is explicit metadata, never a guessed URL.
    await worker.evaluate(async (adapterId) => {
      await chrome.storage.local.set({
        [`agent-launch:${adapterId}`]: "https://example.com/wrong-site",
      });
    }, draft.id);
    expect((await invoke("toolgraft_find_tools"))[0].launchUrl).toBeNull();
    await worker.evaluate(async (adapterId) => {
      await chrome.storage.local.remove(`agent-launch:${adapterId}`);
    }, draft.id);
    expect((await invoke("toolgraft_find_tools"))[0].launchUrl).toBeNull();
    await expect(
      invoke("toolgraft_call", { adapterId: draft.id, tool: "read_title" }),
    ).rejects.toThrow(/toolgraft_find_tools/);
    const explicit = await invoke("toolgraft_call", {
      adapterId: draft.id,
      tool: "read_title",
      url: draft.url,
    });
    expect(explicit.result.isError ?? false).toBe(false);
    expect((await invoke("toolgraft_find_tools"))[0].launchUrl).toBe(draft.url);
    expect(
      (
        await invoke("toolgraft_call", {
          adapterId: draft.id,
          tool: "read_title",
        })
      ).result.isError ?? false,
    ).toBe(false);
    // Browser URL serialization adds the root slash; this is not a redirect.
    const rootInspection = await invoke("toolgraft_inspect", {
      url: slowUrl,
    });
    expect(rootInspection.url).toBe(`${slowUrl}/`);
    expect(JSON.stringify(rootInspection)).toContain("Ready before ads");
    const directInspection = await invoke("toolgraft_inspect", {
      url: draft.url,
      selector: "h1",
    });
    expect(directInspection.sessionId).toBeTruthy();
    expect(directInspection.bodyText).toBeTruthy();
    await expect(
      invoke("toolgraft_inspect", {
        url: draft.url,
        sessionId: directInspection.sessionId,
      }),
    ).rejects.toThrow("either url or sessionId");
    const access = await invoke("toolgraft_inspect", {
      url: "https://ungranted.example/",
    });
    expect(access.state).toBe("awaiting_site_access");
    expect(
      (await invoke("toolgraft_inspect", { url: "https://ungranted.example/" }))
        .requestId,
    ).toBe(access.requestId);
    await expect
      .poll(() =>
        context
          .pages()
          .some((p) => p.url().includes(`request=${access.requestId}`)),
      )
      .toBe(true);
    const accessReview = context
      .pages()
      .find((p) => p.url().includes(`request=${access.requestId}`))!;
    await accessReview
      .getByRole("button", { name: "Decline", exact: true })
      .click();
    expect(
      (await invoke("toolgraft_inspect", { url: "https://ungranted.example/" }))
        .state,
    ).toBe("declined");
    // The archive was imported, so this MCP has no saved source draft.
    expect((await invoke("toolgraft_status")).drafts).toHaveLength(0);
    await expect(
      invoke("toolgraft_edit_adapter", {
        adapterId: draft.id,
        intent: "Improve the title reader",
        url: "https://example.com/wrong",
      }),
    ).rejects.toThrow("matching authoring URL");
    const edit = await invoke("toolgraft_edit_adapter", {
      adapterId: draft.id,
      intent: "Improve the title reader",
      url: draft.url,
    });
    expect(edit.draft.version).toBe("0.1.1");
    expect(edit.draft.tools.map((t: any) => t.name)).toEqual(["read_title"]);
    const inspect = await invoke("toolgraft_inspect", {
      sessionId: edit.sessionId,
    });
    expect(inspect.bodyText).toBeTruthy();
    const focused = await invoke("toolgraft_inspect", {
      sessionId: edit.sessionId,
      selector: "body",
      selectors: ["h1", ".missing-class", "["],
      limit: 2,
    });
    expect(focused.elements).toHaveLength(2);
    expect(focused.nextOffset).toBe(2);
    expect(focused.selectorChecks[0].count).toBeGreaterThan(0);
    expect(focused.selectorChecks[0].samples[0].selector).toBeTruthy();
    expect(focused.selectorChecks[1].count).toBe(0);
    expect(focused.selectorChecks[2].error).toBeTruthy();
    const taskTab = context.pages().find((p) => p.url() === draft.url)!;
    await taskTab.evaluate(() => {
      const d = document.createElement("div");
      d.id = "inspection-privacy";
      d.innerHTML =
        '<input value="PRIVATE-FORM-VALUE"><textarea>PRIVATE-TEXTAREA</textarea><div style="display:none">PRIVATE-HIDDEN</div><p>Visible example</p>';
      document.body.append(d);
    });
    const privateInspect = await invoke("toolgraft_inspect", {
      sessionId: edit.sessionId,
      selector: "#inspection-privacy",
    });
    expect(JSON.stringify(privateInspect)).not.toContain("PRIVATE-");
    expect(privateInspect.bodyText).toContain("Visible example");
    const concurrent = await invoke("toolgraft_edit_adapter", {
      adapterId: draft.id,
      intent: "A competing edit",
      url: draft.url,
    });
    const competing = await invoke("toolgraft_patch", {
      draftId: concurrent.draftId,
      revision: concurrent.revision,
      version: "0.1.2",
      tools: concurrent.draft.tools,
    });
    const competingCandidate = await invoke("toolgraft_validate", {
      draftId: concurrent.draftId,
      revision: competing.revision,
    });
    const extra = {
      ...edit.draft.tools[0],
      name: "read_address",
      description: "Read the page URL",
      execute: "() => textResult({url:location.href})",
    };
    await expect(
      invoke("toolgraft_patch", {
        draftId: edit.draftId,
        revision: edit.revision,
        tools: [extra],
      }),
    ).rejects.toThrow("removeTools");
    const change = await invoke("toolgraft_update_tools", {
      draftId: edit.draftId,
      revision: edit.revision,
      add: [extra],
    });
    expect(change.preserved).toEqual(["read_title"]);
    const unchanged = await invoke("toolgraft_get_draft", {
      draftId: edit.draftId,
    });
    expect(unchanged.draft.tools[0]).toEqual(edit.draft.tools[0]);
    const candidate = await invoke("toolgraft_validate", {
      draftId: edit.draftId,
      revision: change.revision,
    });
    const trialArgs = {
      candidateId: candidate.candidateId,
      tests: [
        { tool: "read_title", input: {} },
        { tool: "read_address", input: {} },
      ],
    };
    const declined = await invoke("toolgraft_request_trial", trialArgs);
    await expect
      .poll(() =>
        context.pages().some((p) => p.url().includes(declined.requestId)),
      )
      .toBe(true);
    const declinedPage = context
      .pages()
      .find((p) => p.url().includes(declined.requestId))!;
    await declinedPage
      .getByRole("button", { name: "Decline", exact: true })
      .click();
    expect(
      (await invoke("toolgraft_wait", { requestId: declined.requestId })).state,
    ).toBe("declined");
    expect((await invoke("toolgraft_find_tools"))[0].version).toBe("0.1.0");
    const update = await invoke("toolgraft_request_trial", trialArgs);
    const peer = new Client({ name: "connection-proof", version: "1" });
    try {
      await peer.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [
            resolve("packages/mcp/dist/index.js"),
            "--port",
            "17841",
            "--data-dir",
            dir,
          ],
          stderr: "pipe",
        }),
      );
      const foreign = await peer.callTool({
        name: "toolgraft_install_status",
        arguments: { requestId: update.requestId },
      });
      expect(foreign.isError).toBe(true);
      expect(JSON.stringify(foreign.content)).toContain(
        "another agent session",
      );
    } finally {
      await peer.close();
    }

    await expect
      .poll(() =>
        context.pages().some((p) => p.url().includes(update.requestId)),
      )
      .toBe(true);
    const updatePage = context
      .pages()
      .find((p) => p.url().includes(update.requestId))!;
    await expect(
      updatePage.getByRole("heading", { name: "Try Connection proof" }),
    ).toBeVisible();
    expect(
      (
        await invoke("toolgraft_wait", {
          requestId: update.requestId,
          timeoutSeconds: 1,
        })
      ).state,
    ).toBe("awaiting_approval");
    await checkExtensionLayout(updatePage, "trial-approval");
    // No trial executes and the live adapter is unchanged before explicit approval.
    expect((await invoke("toolgraft_find_tools"))[0].version).toBe("0.1.0");
    await updatePage
      .getByRole("button", { name: "Try update", exact: true })
      .click();
    const tested = await invoke("toolgraft_wait", {
      requestId: update.requestId,
    });
    expect(tested.state, JSON.stringify(tested)).toBe("tested");
    expect(tested.results).toHaveLength(2);
    expect(tested.results.every((r: any) => r.passed)).toBe(true);
    expect(JSON.parse(tested.results[1].result.content[0].text).url).toBe(
      draft.url,
    );
    expect((await invoke("toolgraft_find_tools"))[0].version).toBe("0.1.0");
    expect(
      await worker.evaluate(
        async () => (await chrome.storage.session.get("trialTabs")).trialTabs,
      ),
    ).toEqual([]);
    await expect(
      updatePage.getByRole("button", { name: "Keep update", exact: true }),
    ).toBeVisible();
    await checkExtensionLayout(updatePage, "trial-results");
    // A second approved trial must not overwrite a base changed by the first.
    const competingTrial = await invoke("toolgraft_request_trial", {
      candidateId: competingCandidate.candidateId,
      tests: [{ tool: "read_title", input: {} }],
    });
    await expect
      .poll(() =>
        context.pages().some((p) => p.url().includes(competingTrial.requestId)),
      )
      .toBe(true);
    const competingPage = context
      .pages()
      .find((p) => p.url().includes(competingTrial.requestId))!;
    await competingPage
      .getByRole("button", { name: "Try update", exact: true })
      .click();
    expect(
      (await invoke("toolgraft_wait", { requestId: competingTrial.requestId }))
        .state,
    ).toBe("tested");
    // Hold the new document pending: Chrome reports pendingUrl before url.
    // The agent must wait for this new version, not choose an old matching tab.
    let releaseNavigation!: () => void;
    const navigationGate = new Promise<void>((resolve) => {
      releaseNavigation = resolve;
    });
    await context.route(draft.url, async (route) => {
      await navigationGate;
      await route.continue();
    });
    const keptPromise = invoke("toolgraft_wait", {
      requestId: update.requestId,
      until: "installed",
    });
    await updatePage
      .getByRole("button", { name: "Keep update", exact: true })
      .click();
    expect((await keptPromise).state).toBe("installed");
    const pendingReady = invoke("toolgraft_ensure_page", {
      adapterId: draft.id,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    releaseNavigation();
    expect((await pendingReady).version).toBe("0.1.1");
    await context.unroute(draft.url);

    await competingPage
      .getByRole("button", { name: "Keep update", exact: true })
      .click();
    expect(
      (
        await invoke("toolgraft_wait", {
          requestId: competingTrial.requestId,
          until: "installed",
        })
      ).state,
    ).toBe("failed");
    // Reordering an old same-URL tab must not select its stale adapter runtime.
    await taskTab.evaluate(() => {
      document.title = "Old task tab";
    });
    await expect
      .poll(() =>
        worker.evaluate(async () =>
          (await chrome.tabs.query({})).some((t) => t.title === "Old task tab"),
        ),
      )
      .toBe(true);
    await worker.evaluate(async (target) => {
      const tabs = await chrome.tabs.query({});
      const old = tabs.find(
        (t) => t.url === target && t.title === "Old task tab",
      );
      if (old?.id === undefined)
        throw new Error("Missing old task tab for reorder regression");
      await chrome.tabs.move(old.id, { index: -1 });
    }, draft.url);
    for (const name of ["read_title", "read_address"]) {
      const called = await invoke("toolgraft_call", {
        adapterId: draft.id,
        tool: name,
      });
      expect(called.version).toBe("0.1.1");
      expect(called.result.isError ?? false).toBe(false);
    }
    // If the new task tab closes, leave stale user tabs alone and open a fresh
    // task tab running the installed version instead of waiting on the old code.
    const updatedTask = context
      .pages()
      .filter((p) => p.url() === draft.url)
      .at(-1)!;
    await updatedTask.close();
    expect(
      (
        await invoke("toolgraft_call", {
          adapterId: draft.id,
          tool: "read_address",
        })
      ).version,
    ).toBe("0.1.1");
    await expect(
      invoke("toolgraft_request_install", {
        candidateId: competingCandidate.candidateId,
      }),
    ).rejects.toThrow("changed since editing began");
    const broken = await invoke("toolgraft_edit_adapter", {
      adapterId: draft.id,
      intent: "Test explicit failure recovery",
    });
    const brokenChange = await invoke("toolgraft_update_tools", {
      draftId: broken.draftId,
      revision: broken.revision,
      add: [
        {
          ...extra,
          name: "broken_read",
          execute:
            '()=>{throw new ToolGraftError("PAGE_SHAPE_CHANGED","Expected listing missing")}',
        },
      ],
    });
    const brokenCandidate = await invoke("toolgraft_validate", {
      draftId: broken.draftId,
      revision: brokenChange.revision,
    });
    const brokenTrial = await invoke("toolgraft_request_trial", {
      candidateId: brokenCandidate.candidateId,
      tests: [{ tool: "broken_read", input: {} }],
    });
    await expect
      .poll(() =>
        context.pages().some((p) => p.url().includes(brokenTrial.requestId)),
      )
      .toBe(true);
    const brokenPage = context
      .pages()
      .find((p) => p.url().includes(brokenTrial.requestId))!;
    await brokenPage
      .getByRole("button", { name: "Try update", exact: true })
      .click();
    const failure = await invoke("toolgraft_wait", {
      requestId: brokenTrial.requestId,
    });
    expect(failure.state).toBe("failed");
    expect(failure.results[0].passed).toBe(false);
    await expect(
      brokenPage.getByRole("button", { name: "Keep update", exact: true }),
    ).toHaveCount(0);
    expect((await invoke("toolgraft_find_tools"))[0].version).toBe("0.1.1");
    await expect(
      invoke("toolgraft_request_trial", {
        candidateId: brokenCandidate.candidateId,
        tests: [
          {
            tool: "broken_read",
            input: {},
            expectedError: "PAGE_SHAPE_CHANGED",
          },
        ],
      }),
    ).rejects.toThrow("at least one successful");
    const expectedTrial = await invoke("toolgraft_request_trial", {
      candidateId: brokenCandidate.candidateId,
      tests: [
        { tool: "read_title", input: {} },
        { tool: "broken_read", input: {}, expectedError: "PAGE_SHAPE_CHANGED" },
      ],
    });
    await expect
      .poll(() =>
        context.pages().some((p) => p.url().includes(expectedTrial.requestId)),
      )
      .toBe(true);
    const expectedPage = context
      .pages()
      .find((p) => p.url().includes(expectedTrial.requestId))!;
    await expect(
      expectedPage.getByText("Expected rejection: PAGE_SHAPE_CHANGED", {
        exact: true,
      }),
    ).toBeVisible();
    await expectedPage
      .getByRole("button", { name: "Try update", exact: true })
      .click();
    const expectedResult = await invoke("toolgraft_wait", {
      requestId: expectedTrial.requestId,
    });
    expect(expectedResult.state).toBe("tested");
    expect(expectedResult.results.map((r: any) => r.passed)).toEqual([
      true,
      true,
    ]);
    await expectedPage
      .getByRole("button", { name: "Discard update", exact: true })
      .click();
    // Resume gives a new inspection session while preserving all saved tool source.
    let resumed = await invoke("toolgraft_resume_draft", {
      draftId: broken.draftId,
    });
    expect(resumed.revision).toBe(brokenChange.revision + 1);
    expect(resumed.sessionId).not.toBe(broken.sessionId);
    expect(resumed.draft.tools).toHaveLength(3);
    // A new actual MCP process recovers the same draft and remembered pairing.
    const savedTools = resumed.draft.tools;
    await client.close();
    client = new Client({ name: "connection-proof", version: "1" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          resolve("packages/mcp/dist/index.js"),
          "--port",
          "17841",
          "--data-dir",
          dir,
        ],
        stderr: "pipe",
      }),
    );
    expect((await invoke("toolgraft_status")).connected).toBe(true);
    resumed = await invoke("toolgraft_resume_draft", {
      draftId: broken.draftId,
    });
    expect(resumed.draft.tools).toEqual(savedTools);
    expect(
      (await invoke("toolgraft_inspect", { sessionId: resumed.sessionId }))
        .bodyText,
    ).toBeTruthy();

    const removal = await invoke("toolgraft_edit_adapter", {
      adapterId: draft.id,
      intent: "Deliberately remove the URL tool",
    });
    const removed = await invoke("toolgraft_patch", {
      draftId: removal.draftId,
      revision: removal.revision,
      tools: removal.draft.tools.filter((t: any) => t.name === "read_title"),
      removeTools: ["read_address"],
      version: "0.1.1",
    });
    expect(removed.draft.tools).toHaveLength(1);
    await expect(
      invoke("toolgraft_validate", {
        draftId: removal.draftId,
        revision: removed.revision,
      }),
    ).rejects.toThrow("newer than its installed base");
    // An uninstalled edit does not remove the live tool.
    expect(
      await invoke("toolgraft_find_tools", { query: "read_address" }),
    ).toHaveLength(1);
    for (const panel of ["popup", "options", "connect"]) {
      const tab = await context.newPage();
      await tab.goto(`chrome-extension://${id}/${panel}.html`);
      await expect(tab.locator("body")).not.toContainText(
        /undefined|Cannot read properties/,
      );
      await expect(tab.locator("[role=alert]")).toHaveCount(0);
      await checkExtensionLayout(tab, `connection-${panel}`);
      if (panel === "connect") {
        const slowChange = await invoke("toolgraft_update_tools", {
          draftId: resumed.draftId,
          revision: resumed.revision,
          remove: ["broken_read"],
          add: [
            {
              ...extra,
              name: "slow_read",
              execute:
                "async()=>{await new Promise(r=>setTimeout(r,15000));return textResult({title:document.title})}",
            },
          ],
        });
        const slowCandidate = await invoke("toolgraft_validate", {
          draftId: resumed.draftId,
          revision: slowChange.revision,
        });
        const slowTrial = await invoke("toolgraft_request_trial", {
          candidateId: slowCandidate.candidateId,
          tests: [{ tool: "slow_read", input: {} }],
        });
        await expect
          .poll(() =>
            context.pages().some((p) => p.url().includes(slowTrial.requestId)),
          )
          .toBe(true);
        const slowPage = context
          .pages()
          .find((p) => p.url().includes(slowTrial.requestId))!;
        await slowPage
          .getByRole("button", { name: "Try update", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              await worker.evaluate(
                async () =>
                  (
                    ((await chrome.storage.session.get("trialTabs"))
                      .trialTabs as number[]) ?? []
                  ).length,
              ),
          )
          .toBe(1);

        await expect(
          tab.getByRole("button", { name: "Disconnect", exact: true }),
        ).toBeVisible();
        await tab
          .getByRole("button", { name: "Disconnect", exact: true })
          .click();
        await expect(
          tab.getByText("Disconnected", { exact: true }),
        ).toBeVisible();
        expect((await invoke("toolgraft_status")).connected).toBe(false);
        await expect
          .poll(
            async () =>
              await worker.evaluate(
                async () =>
                  (
                    ((await chrome.storage.session.get("trialTabs"))
                      .trialTabs as number[]) ?? []
                  ).length,
              ),
          )
          .toBe(0);
        await expect(
          slowPage.getByText("Expired · ask your agent to resume", {
            exact: true,
          }),
        ).toBeVisible();
      }
      await tab.close();
    }
  } finally {
    slowServer.closeAllConnections();
    slowServer.close();
    await client.close();
    await context.close();
    await rm(dir, { recursive: true, force: true });
  }
});
