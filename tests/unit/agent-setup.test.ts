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
  managedServer,
  localDevPackage,
} from "@toolgraft/agent-setup/managed-config";
import { GUIDE_VERSION } from "@toolgraft/agent-core";
it("ships the same managed connection to both JSON-based agents", async () => {
  for (const path of [".mcp.json", ".cursor/mcp.json"])
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(
      JSON.parse(managedJson(localDevPackage)),
    );
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  expect(packageJson.devDependencies["chrome-devtools-mcp"]).toBe(MCP_VERSION);
  expect(serverConfig().args).toContain("--categoryExperimentalWebmcp=true");
  expect(serverConfig().args).toContain("--browserUrl=http://127.0.0.1:9227");
});
it("gives users the pinned npm package and repo checkouts the local build", () => {
  expect(managedServer().args).toEqual([
    "-y",
    `@particular-labs/toolgraft-mcp@${GUIDE_VERSION}`,
  ]);
  expect(managedServer(localDevPackage).args).toEqual([
    "-y",
    `--package=./packages/brand/assets/toolgraft-mcp-${GUIDE_VERSION}.tgz`,
    "toolgraft-mcp",
  ]);
});
it("keeps Codex project configuration in sync and exposes the discovery tools", async () => {
  expect(await readFile(".codex/config.toml", "utf8")).toBe(
    managedCodex(localDevPackage),
  );
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
