import { it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  serverArgs,
  serverConfig,
  jsonConfig,
  codexConfig,
  SERVER_NAME,
  MCP_VERSION,
  discoveryTools,
} from "@toolgraft/agent-setup";
import {
  managedJson,
  managedCodex,
} from "@toolgraft/agent-setup/managed-config";
it("ships the same managed connection to both JSON-based agents", async () => {
  for (const path of [".mcp.json", ".cursor/mcp.json"])
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(
      JSON.parse(managedJson()),
    );
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  expect(packageJson.devDependencies["chrome-devtools-mcp"]).toBe(MCP_VERSION);
  expect(serverConfig().args).toContain("--categoryExperimentalWebmcp=true");
  expect(serverConfig().args).toContain("--browserUrl=http://127.0.0.1:9227");
});
it("keeps Codex project configuration in sync and exposes the discovery tools", async () => {
  expect(await readFile(".codex/config.toml", "utf8")).toBe(managedCodex());
  expect(codexConfig()).toContain(`[mcp_servers.${SERVER_NAME}]`);
  expect(codexConfig()).toContain(
    `enabled_tools = ${JSON.stringify(discoveryTools)}`,
  );
});
it("refuses credentialed, remote, or non-debugging browser URLs", () => {
  for (const url of [
    "https://127.0.0.1:9227",
    "http://evil.test:9227",
    "http://user:secret@localhost:9227",
    "http://localhost:9227/other",
    "http://localhost:9227/?key=x",
  ])
    expect(() => serverArgs(url)).toThrow("local browser");
  expect(serverArgs("http://localhost:9226")[0]).toBe(
    "--browserUrl=http://localhost:9226",
  );
});
