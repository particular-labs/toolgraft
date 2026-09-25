import { test, expect, chromium } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { clasificadosDraft } from "../../scripts/clasificados-adapter.mts";

for (const live of [false, true])
  test(`ClasificadosOnline managed MCP search: ${live ? "live site" : "deterministic boundaries"}`, async () => {
    test.skip(
      live && !process.env.TG_LIVE,
      "Set TG_LIVE=1 for live site requests",
    );
    test.setTimeout(live ? 300000 : 180000);
    const requests: string[] = [];
    const fixture = createServer((req, res) => {
      requests.push(req.url!);
      const u = new URL(req.url!, "http://localhost");
      const keyword = u.searchParams.get("keyword");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (keyword === "empty") {
        res.writeHead(302, { Location: "/NoAdID.asp" });
        res.end();
        return;
      }
      if (u.pathname === "/NoAdID.asp") {
        res.end(
          '<h1>ESTE NO ESTA DISPONIBLE... Aquí hay otros.</h1><a href="/UDMiscDetail.asp?MiscIdNumber=99">Unrelated promoted item</a>',
        );
        return;
      }
      if (keyword === "broken") {
        res.end("<h1>Challenge or changed layout</h1>");
        return;
      }
      if (keyword === "http-error") {
        res.writeHead(503);
        res.end("Unavailable");
        return;
      }
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const html = `<h1>Buscando</h1><p>${offset + 1} al ${offset + 2} de 32</p><a href="/ss/dmclisting.asp?SecID=24&keyword=Toyota">Accesorios (2)</a><div class="custom-wrap-text"><a href="/advertisement">Not a result</a></div><table><tr><td><a class="link-blue-color-nound" href="/UDTransDetail.asp?AutoNumAnuncio=${offset + 1}">Toyota &amp; café</a><span class="colorGray">Autos</span><table><tr><td><span class="colorGrayO">$20,995</span><span class="colorGray">Bayamón</span></td></tr></table><img alt="Destacado"></td><td><a class="Tahoma14BrownNound">Example seller</a></td></tr><tr><td><a class="link-blue-color-nound" href="${keyword === "bad-link" ? "https://example.org/trap" : "/UDMiscDetail.asp?MiscIdNumber=" + (offset + 2)}">Toyota part</a><span class="colorGray">Accesorios</span><table><tr><td><span class="colorGray">Ponce</span></td></tr></table></td></tr></table>`;
      if (keyword === "latin") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          Buffer.from(
            '<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"><meta charset="UTF-8">' +
              html,
            "latin1",
          ),
        );
      } else res.end(html);
    });
    await new Promise<void>((r) => fixture.listen(0, "127.0.0.1", r));
    const draft = await clasificadosDraft();
    if (!live)
      draft.url = `http://localhost:${(fixture.address() as { port: number }).port}/ss/dmclisting.asp?keyword=Toyota&SecID=PR`;
    const host = new URL(draft.url).origin + "/*";
    // Chrome match patterns exclude the localhost port.
    const grantHost = live ? host : "http://localhost/*";
    const data = await mkdtemp(join(tmpdir(), "toolgraft-classifieds-"));
    const extension = resolve("apps/extension/.output/chrome-mv3");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: !live,
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
    const client = new Client({ name: "clasificados-test", version: "1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve("packages/mcp/dist/index.js"),
        "--data-dir",
        data,
        "--port",
        "17836",
      ],
      stderr: "pipe",
    });
    const invoke = async (name: string, args: Record<string, unknown> = {}) => {
      const response = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: 90000 },
      );
      const value = JSON.parse(
        (response.content as { text: string }[])[0]!.text,
      );
      if (response.isError) throw new Error(JSON.stringify(value));
      return value;
    };
    try {
      await client.connect(transport);
      const pairing = await invoke("toolgraft_pair");
      const connect = await context.newPage();
      await connect.goto(`chrome-extension://${id}/connect.html`);
      await connect.getByText("Trouble connecting?", { exact: true }).click();
      await connect
        .getByText("Use a pairing code instead", { exact: true })
        .click();
      await connect
        .getByLabel("Pairing code", { exact: true })
        .fill(pairing.code);
      await connect.getByText("Connection settings", { exact: true }).click();
      await connect.getByLabel("Local MCP port").fill(String(pairing.port));
      await connect
        .getByLabel("Agent ID", { exact: true })
        .fill(pairing.agentId);
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
      await settings.evaluate(
        async ({ id, host }) => {
          await (chrome as any).developerPrivate.addHostPermission(id, host);
        },
        { id, host: grantHost },
      );
      await settings.close();
      const session = await invoke("toolgraft_begin_authoring", {
        url: draft.url,
        intent: "Search all classifieds categories by keyword, read only",
      });
      const scaffold = await invoke("toolgraft_scaffold", {
        sessionId: session.sessionId,
        url: draft.url,
        adapterId: draft.id,
        title: draft.title,
        description: draft.description,
      });
      const patched = await invoke("toolgraft_patch", {
        draftId: scaffold.draftId,
        revision: scaffold.revision,
        tools: draft.tools,
      });
      const candidate = await invoke("toolgraft_validate", {
        draftId: scaffold.draftId,
        revision: patched.revision,
      });
      const pending = await invoke("toolgraft_request_install", {
        candidateId: candidate.candidateId,
      });
      await expect
        .poll(() =>
          context
            .pages()
            .find((p) => p.url().includes("request=" + pending.requestId))
            ?.url(),
        )
        .toBeTruthy();
      const review = context
        .pages()
        .find((p) => p.url().includes("request=" + pending.requestId))!;
      // This is a disposable test browser; the test acts as its consenting user.
      await review
        .getByRole("button", { name: "Approve site access and install" })
        .click();
      await expect(
        review.getByText("Installed. Your agent can now test the tools."),
      ).toBeVisible();
      for (const page of context.pages())
        if (page.url().startsWith(new URL(draft.url).origin))
          await page.close();
      const readRetries: Record<string, string | number>[] = [];
      const call = async (input: Record<string, string | number>) => {
        const run = async () =>
          (
            await invoke("toolgraft_call", {
              adapterId: draft.id,
              tool: "search_classifieds",
              input,
            })
          ).result;
        let result = await run();
        // The live site's read endpoint intermittently times out. Retry this
        // known read once, record it, and still fail if the second attempt fails.
        if (
          live &&
          result.isError &&
          result.content?.[0]?.text.includes("SEARCH_UNAVAILABLE")
        ) {
          readRetries.push(input);
          result = await run();
        }
        return result;
      };
      const parse = (r: any) => {
        expect(r.isError ?? false, JSON.stringify(r)).toBe(false);
        return JSON.parse(r.content[0].text);
      };
      const first = parse(await call({ keyword: "Toyota" }));
      expect(first.status).toBe("ok");
      await expect
        .poll(async () =>
          Object.values(
            await worker.evaluate(() => chrome.storage.session.get(null)),
          ).some(
            (d: any) =>
              d.tools?.includes("search_classifieds") && d.state === "active",
          ),
        )
        .toBe(true);
      expect(first.results.length).toBeGreaterThan(0);
      expect(first.results.length).toBeLessThanOrEqual(30);
      expect(first.category).toBe("PR");
      expect(first.nextPage).toBe(2);
      const second = parse(await call({ keyword: "Toyota", page: 2 }));
      expect(second.range.from).toBe(31);
      expect(second.results[0].url).not.toBe(first.results[0].url);
      const empty = parse(
        await call({ keyword: live ? "toolgraftzznomatch927419" : "empty" }),
      );
      expect(empty.status).toBe("no_matches_or_unavailable");
      expect(empty.results).toEqual([]);
      if (live) {
        const narrowed = parse(
          await call({ keyword: "Toyota", category: "24" }),
        );
        expect(narrowed.results.length).toBeGreaterThan(0);
        const housing = parse(await call({ keyword: "apartamento" }));
        expect(housing.results.length).toBeGreaterThan(0);
        expect(
          JSON.stringify([first, second, narrowed, housing]),
        ).not.toContain("\ufffd");
        await mkdir(".cache", { recursive: true });
        await writeFile(
          ".cache/clasificados-live.json",
          JSON.stringify(
            {
              at: new Date().toISOString(),
              nativeWebMCP: false,
              digest: candidate.digest,
              adapterId: draft.id,
              version: draft.version,
              first,
              second,
              narrowed,
              housing,
              empty,
            },
            null,
            2,
          ),
        );
        // Exercise the new trial lifecycle on the real site, preserving search.
        // This test adds only a page-title reader, not an unverified generic detail parser.
        const listingUrl = first.results[0].url;
        const inspectSession = await invoke("toolgraft_begin_authoring", {
          url: listingUrl,
          intent:
            "Inspect a returned listing title for a read-only browser trial",
        });
        const inspected = await invoke("toolgraft_inspect", {
          sessionId: inspectSession.sessionId,
          limit: 10,
        });
        expect(inspected.title).toBeTruthy();
        const edit = await invoke("toolgraft_edit_adapter", {
          adapterId: draft.id,
          intent: "Keep keyword search and add listing page titles",
        });
        const addition = await invoke("toolgraft_update_tools", {
          draftId: edit.draftId,
          revision: edit.revision,
          add: [
            {
              name: "listing_page_title",
              description: "Read the title of a returned classified listing",
              inputSchema: {
                type: "object",
                properties: { url: { type: "string" } },
                required: ["url"],
                additionalProperties: false,
              },
              annotations: { readOnlyHint: true, untrustedContentHint: true },
              execute: `async ({url}) => {
            const u=new URL(url); if(u.origin!==location.origin || u.username || u.password || !/^\\/(?:UD[^/]*Detail\\.asp|AutoAcc\\/Detail\\.asp)$/i.test(u.pathname)) throw new ToolGraftError("INVALID_INPUT","Use a listing URL returned by search");
            const response=await fetch(u,{credentials:"omit",mode:"same-origin",signal:AbortSignal.timeout(20000)});
            if(!response.ok || response.url!==u.href) throw new ToolGraftError("PAGE_SHAPE_CHANGED","Listing is unavailable");
            const reader=response.body.getReader();const chunks=[];let size=0;
            while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024){await reader.cancel();throw new ToolGraftError("PAGE_SHAPE_CHANGED","Listing too large");}chunks.push(value);}
            const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
            const prefix=new TextDecoder("windows-1252").decode(bytes.slice(0,4096));
            const encoding=response.headers.get("content-type")?.match(/charset\\s*=\\s*["']?([\\w-]+)/i)?.[1] ?? prefix.match(/<meta\\b[^>]*charset\\s*=\\s*["']?([\\w-]+)/i)?.[1] ?? "windows-1252";
            const doc=new DOMParser().parseFromString(new TextDecoder(encoding).decode(bytes),"text/html");
            const title=doc.title.trim();if(!title)throw new ToolGraftError("PAGE_SHAPE_CHANGED","Listing title missing");
            return textResult({title,url:u.href});
          }`,
            },
          ],
        });
        expect(addition.preserved).toEqual(["search_classifieds"]);
        const trialCandidate = await invoke("toolgraft_validate", {
          draftId: edit.draftId,
          revision: addition.revision,
        });
        const trial = await invoke("toolgraft_request_trial", {
          candidateId: trialCandidate.candidateId,
          tests: [
            { tool: "search_classifieds", input: { keyword: "Toyota" } },
            { tool: "listing_page_title", input: { url: listingUrl } },
          ],
        });
        await expect
          .poll(() =>
            context.pages().some((p) => p.url().includes(trial.requestId)),
          )
          .toBe(true);
        const trialPage = context
          .pages()
          .find((p) => p.url().includes(trial.requestId))!;
        await trialPage
          .getByRole("button", { name: "Try update", exact: true })
          .click();
        let tested = await invoke("toolgraft_wait", {
          requestId: trial.requestId,
          timeoutSeconds: 40,
        });
        if (tested.waiting)
          tested = await invoke("toolgraft_wait", {
            requestId: trial.requestId,
            timeoutSeconds: 40,
          });
        expect(tested.state, JSON.stringify(tested)).toBe("tested");
        expect(parse(tested.results[1].result).title).toBe(inspected.title);
        expect(
          (
            await invoke("toolgraft_find_tools", {
              query: "search_classifieds",
            })
          )[0].version,
        ).toBe("0.1.0");
        await trialPage
          .getByRole("button", { name: "Keep update", exact: true })
          .click();
        expect(
          (
            await invoke("toolgraft_wait", {
              requestId: trial.requestId,
              until: "installed",
            })
          ).state,
        ).toBe("installed");
        const installedTitle = await invoke("toolgraft_call", {
          adapterId: draft.id,
          tool: "listing_page_title",
          input: { url: listingUrl },
        });
        expect(parse(installedTitle.result).title).toBe(inspected.title);
        expect(
          parse(await call({ keyword: "Toyota" })).results.length,
        ).toBeGreaterThan(0);
        await writeFile(
          ".cache/clasificados-trial-live.json",
          JSON.stringify(
            {
              at: new Date().toISOString(),
              version: installedTitle.version,
              candidate: trialCandidate.digest,
              listingUrl,
              inspectedTitle: inspected.title,
              results: tested.results,
              kept: true,
              readRetries,
            },
            null,
            2,
          ),
        );
      } else {
        expect(first.results).toHaveLength(2);
        expect(first.results[0]).toMatchObject({
          title: "Toyota & café",
          price: 20995,
          town: "Bayamón",
          category: "Autos",
          seller: "Example seller",
          featured: true,
        });
        expect(first.results[1]).toMatchObject({
          price: null,
          currency: null,
          category: "Accesorios",
          town: "Ponce",
        });
        expect(first.categories).toEqual([
          { id: "24", label: "Accesorios (2)" },
        ]);
        const narrowed = parse(
          await call({ keyword: "Toyota", category: "24" }),
        );
        expect(narrowed.sourceUrl).toContain("SecID=24");
        const latin = parse(await call({ keyword: "latin" }));
        expect(latin.results[0]).toMatchObject({
          title: "Toyota & café",
          town: "Bayamón",
        });
        for (const [input, code] of [
          [{ keyword: "broken" }, "PAGE_SHAPE_CHANGED"],
          [{ keyword: "bad-link" }, "PAGE_SHAPE_CHANGED"],
          [{ keyword: "http-error" }, "SEARCH_UNAVAILABLE"],
          [{ keyword: "Toyota", page: 1.5 }, "INVALID_INPUT"],
          [{ keyword: " " }, "INVALID_INPUT"],
          [{ keyword: "Toyota", category: "PR&evil=1" }, "INVALID_INPUT"],
        ] as const) {
          const result = await call(input);
          expect(result.isError).toBe(true);
          expect(result.content[0].text).toContain(code);
        }
        expect(requests.some((r) => r.includes("offset=30"))).toBe(true);
      }
    } catch (error) {
      console.error(
        "Browser pages",
        await Promise.all(
          context.pages().map(async (page) => ({
            url: page.url(),
            title: await page.title().catch(() => "unavailable"),
            ready: await page
              .evaluate(() => document.readyState)
              .catch(() => "unavailable"),
          })),
        ),
      );
      console.error(
        "Diagnostics",
        await worker.evaluate(() => chrome.storage.session.get(null)),
      );
      console.error(
        "Scripts",
        await worker.evaluate(() => chrome.userScripts.getScripts()),
      );
      throw error;
    } finally {
      await client.close();
      await context.close();
      fixture.closeAllConnections();
      await new Promise<void>((r) => fixture.close(() => r()));
      await rm(data, { recursive: true, force: true });
    }
  });
