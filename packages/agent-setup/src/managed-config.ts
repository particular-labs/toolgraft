import { GUIDE_VERSION } from "@toolgraft/agent-core";
export const mcpArchive = `toolgraft-mcp-${GUIDE_VERSION}.tgz`;
/** Pinned npm spec users run; the version moves with every release. */
export const mcpPackage = `@particular-labs/toolgraft-mcp@${GUIDE_VERSION}`;
/** Repository checkouts run the locally built archive instead of npm. */
export const localDevPackage = `./packages/brand/assets/${mcpArchive}`;
export function managedServer(packagePath?: string) {
  return {
    command: "npx",
    args: packagePath
      ? ["-y", `--package=${packagePath}`, "toolgraft-mcp"]
      : ["-y", mcpPackage],
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
const launch = () => `npx ${managedServer().args.join(" ")}`;
/** One-line installs for clients with an `mcp add` CLI; others merge managedJson(). */
export const cliInstalls = () => [
  {
    client: "Claude Code",
    command: `claude mcp add --scope user toolgraft -- ${launch()}`,
  },
  { client: "Codex", command: `codex mcp add toolgraft -- ${launch()}` },
];
