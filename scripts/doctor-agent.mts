import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import {
  BROWSER_URL,
  serverArgs,
  discoveryTools,
} from "@toolgraft/agent-setup";
const browserUrl = process.env.TOOLGRAFT_BROWSER_URL ?? BROWSER_URL;
const args = serverArgs(browserUrl);
const text = (result: any) =>
  result.content
    ?.filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n") ?? "";
const client = new Client({
  name: "toolgraft-connection-check",
  version: "0.1.0",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    resolve(
      "node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js",
    ),
    ...args,
  ],
  stderr: "pipe",
});
try {
  await fetch(new URL("/json/version", browserUrl), {
    signal: AbortSignal.timeout(3000),
  }).then((r) => {
    if (!r.ok) throw new Error("Browser debugging endpoint is not ready");
  });
  await client.connect(transport);
  const protocolTools = await client.listTools();
  if (
    !discoveryTools.every((name) =>
      protocolTools.tools.some((t) => t.name === name),
    )
  )
    throw new Error(
      "Server is missing WebMCP discovery tools. Check its version and flags.",
    );
  const listing = text(
    await client.callTool({ name: "list_pages", arguments: {} }),
  );
  const pages = [
    ...listing.matchAll(/^(\d+): .*?\((https?:\/\/[^\s]+)\)/gm),
  ].map((m) => ({ id: Number(m[1]), url: new URL(m[2]!) }));
  const targets = [
    {
      host: "localhost",
      path: "/tasks",
      tool: "playground_list_tasks",
      input: {},
      check: (value: any) => Array.isArray(value),
    },
    {
      host: "news.ycombinator.com",
      path: "/",
      tool: "hn_front_page",
      input: { limit: 1 },
      check: (value: any) => Array.isArray(value) && value.length > 0,
    },
    {
      host: "en.wikipedia.org",
      path: "/wiki/",
      tool: "wikipedia_current_page",
      input: {},
      check: (value: any) =>
        typeof value.title === "string" && value.summary?.length > 100,
    },
  ];
  let checked = 0;
  for (const target of targets) {
    const page = pages.find(
      (p) =>
        p.url.hostname === target.host &&
        p.url.pathname.startsWith(target.path) &&
        (target.host !== "localhost" || !p.url.search),
    );
    if (!page) {
      console.log(
        `Not checked: ${target.host} (open a matching tab to include it).`,
      );
      continue;
    }
    const discovered = text(
      await client.callTool({
        name: "list_webmcp_tools",
        arguments: { pageId: page.id },
      }),
    );
    if (!discovered.includes(target.tool))
      throw new Error(
        `${target.host}: ${target.tool} is missing. Install its adapter, enable User Scripts, and reload the tab.`,
      );
    const response = await client.callTool({
      name: "execute_webmcp_tool",
      arguments: {
        pageId: page.id,
        toolName: target.tool,
        input: JSON.stringify(target.input),
      },
    });
    const body = text(response);
    const envelope = JSON.parse(body.slice(body.indexOf("{")));
    let output = envelope.output;
    if (typeof output === "string") output = JSON.parse(output);
    if (response.isError || envelope.status !== "Completed" || output?.isError)
      throw new Error(`${target.tool} returned a failure`);
    const value = JSON.parse(output.content[0].text);
    if (!target.check(value))
      throw new Error(`${target.tool} returned an unexpected data shape`);
    console.log(
      `PASS: ${target.host} → discover → ${target.tool} → validated result`,
    );
    checked++;
  }
  if (!checked)
    throw new Error(
      "Open the ToolGraft playground tab at http://localhost:4174/tasks and try again.",
    );
  console.log(
    `One MCP server verified ${checked} page(s). This checks the connection and real read tools; it does not run a language model.`,
  );
} catch (e) {
  console.error(
    `Connection check failed: ${e instanceof Error ? e.message : String(e)}. Start pnpm dev:browser and check the agent setup guide.`,
  );
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
