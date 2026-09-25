import { GUIDE_VERSION } from "@toolgraft/agent-core";
export const mcpArchive = `toolgraft-mcp-${GUIDE_VERSION}.tgz`;
export function managedServer(
  packagePath = `./packages/brand/assets/${mcpArchive}`,
) {
  return {
    command: "npx",
    args: ["-y", `--package=${packagePath}`, "toolgraft-mcp"],
  };
}
export function managedJson(packagePath?: string) {
  return (
    JSON.stringify(
      { mcpServers: { toolgraft: managedServer(packagePath) } },
      null,
      2,
    ) + "\n"
  );
}
export function managedCodex(packagePath?: string) {
  return `[mcp_servers.toolgraft]\ncommand = "npx"\nargs = ${JSON.stringify(managedServer(packagePath).args)}\nstartup_timeout_sec = 120\ntool_timeout_sec = 150\n`;
}
