import { mcpArchive } from "../packages/agent-setup/src/managed-config.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "toolgraft-package-"));
const archive = resolve(`packages/brand/assets/${mcpArchive}`);
const client = new Client({ name: "standalone-package-proof", version: "1" });
const transport = new StdioClientTransport({
  command: "npx",
  args: [
    "--yes",
    "--cache",
    join(directory, "cache"),
    `--package=${archive}`,
    "toolgraft-mcp",
    "--port",
    "17838",
    "--data-dir",
    join(directory, "data"),
  ],
  cwd: directory,
  stderr: "pipe",
});
const second = new Client({ name: "second-package-agent", version: "1" });
let stderr = "";
transport.stderr?.on("data", (d) => (stderr += String(d)));
try {
  await client.connect(transport, { timeout: 120000 });
  const listing = await client.listTools();
  for (const name of [
    "toolgraft_connect",
    "toolgraft_request_package_install",
    "toolgraft_get_instructions",
    "toolgraft_patch",
    "toolgraft_edit_adapter",
    "toolgraft_update_tools",
    "toolgraft_request_trial",
    "toolgraft_wait",
    "toolgraft_resume_draft",
    "toolgraft_release_pages",
    "toolgraft_request_install",
    "toolgraft_versions",
    "toolgraft_request_version",
    "toolgraft_call",
  ])
    if (!listing.tools.some((t) => t.name === name))
      throw new Error("Missing " + name);
  const result = await client.callTool({
    name: "toolgraft_status",
    arguments: {},
  });
  const status = JSON.parse(
    (result.content as Array<{ text: string }>)[0]!.text,
  );
  if (result.isError || status.connected !== false)
    throw new Error("Unexpected standalone status");
  await second.connect(
    new StdioClientTransport({
      command: "npx",
      args: [
        "--yes",
        "--cache",
        join(directory, "cache"),
        `--package=${archive}`,
        "toolgraft-mcp",
        "--data-dir",
        join(directory, "data"),
      ],
      cwd: directory,
      stderr: "pipe",
    }),
    { timeout: 120000 },
  );
  const secondResult = await second.callTool({
    name: "toolgraft_status",
    arguments: {},
  });
  const secondStatus = JSON.parse(
    (secondResult.content as Array<{ text: string }>)[0]!.text,
  );
  if (
    secondResult.isError ||
    secondStatus.port !== status.port ||
    secondStatus.agentId === status.agentId
  )
    throw new Error("Standalone agents did not share the bridge independently");
  const invitation = await client.callTool({
    name: "toolgraft_connect",
    arguments: {},
  });
  const url = JSON.parse(
    (invitation.content as Array<{ text: string }>)[0]!.text,
  ).url;
  const landing = await fetch(url);
  if (!landing.ok || !(await landing.text()).includes("Connect your agent."))
    throw new Error("Missing packaged connection page");
  const css = await fetch(new URL("/connect-assets/connection.css", url));
  if (!css.ok) throw new Error("Missing connection styles");
  await mkdir(".cache/agent-proof", { recursive: true });
  await writeFile(
    ".cache/agent-proof/package-summary.json",
    JSON.stringify(
      {
        passed: true,
        archive,
        tools: listing.tools.length,
        isolatedCwd: true,
        emptyNpmCache: true,
        sharedBridgeTwoProcesses: true,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS: downloaded MCP archive starts with npx outside the repository and with a fresh npm cache; two processes share one bridge.",
  );
} catch (e) {
  console.error(stderr.slice(-1500));
  throw e;
} finally {
  await Promise.all([client.close(), second.close()]);
  try {
    const host = JSON.parse(
      await readFile(join(directory, "data/bridge-v2/endpoint.json"), "utf8"),
    );
    process.kill(host.pid, "SIGTERM");
  } catch {}
  await rm(directory, { recursive: true, force: true });
}
