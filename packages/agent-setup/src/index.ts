/** One connection contract for website, extension, project configs, and MCP verification. */
export const SERVER_NAME = "toolgraft-browser";
export const MCP_VERSION = "1.10.1";
export const BROWSER_URL = "http://127.0.0.1:9227";
export const discoveryTools = [
  "list_pages",
  "list_webmcp_tools",
  "execute_webmcp_tool",
];
export function serverArgs(browserUrl = BROWSER_URL) {
  const url = new URL(browserUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use a local browser debugging address, such as http://127.0.0.1:9227.",
    );
  return [
    `--browserUrl=${url.origin}`,
    "--categoryExperimentalWebmcp=true",
    "--usageStatistics=false",
    "--performanceCrux=false",
  ];
}
export function serverConfig() {
  return {
    type: "stdio",
    command: "npx",
    args: ["-y", `chrome-devtools-mcp@${MCP_VERSION}`, ...serverArgs()],
  };
}
export const jsonConfig = () =>
  JSON.stringify({ mcpServers: { [SERVER_NAME]: serverConfig() } }, null, 2) +
  "\n";
export const codexConfig = () =>
  `[mcp_servers.${SERVER_NAME}]\ncommand = "npx"\nargs = ${JSON.stringify(serverConfig().args)}\nstartup_timeout_sec = 60\ntool_timeout_sec = 150\nenabled_tools = ${JSON.stringify(discoveryTools)}\n`;
export const testPrompt =
  "Use toolgraft-browser to find my open ToolGraft playground tab at http://localhost:4174/tasks (without failure-scenario query parameters), discover its WebMCP tools, and call playground_list_tasks. Report the task titles returned by the tool. Do not use screenshots, DOM evaluation, or shell commands, and do not change anything.";
export const agents = [
  {
    id: "codex",
    label: "Codex",
    file: ".codex/config.toml",
    filename: "toolgraft-codex.toml",
    config: codexConfig,
    help: "Merge this entry into .codex/config.toml in your trusted project, then start a new Codex session. In Codex, /mcp shows the server status.",
    source: "https://developers.openai.com/codex/mcp/",
  },
  {
    id: "claude",
    label: "Claude Code",
    file: ".mcp.json",
    filename: "toolgraft-claude.json",
    config: jsonConfig,
    help: "Merge this server into .mcp.json at your project root. Start Claude Code there, approve the project MCP server when asked, then check /mcp.",
    source: "https://code.claude.com/docs/en/mcp",
  },
  {
    id: "cursor",
    label: "Cursor",
    file: ".cursor/mcp.json",
    filename: "toolgraft-cursor.json",
    config: jsonConfig,
    help: "Merge this server into .cursor/mcp.json in your project. Enable it in Cursor's MCP settings and start a new agent chat.",
    source: "https://cursor.com/docs/mcp",
  },
  {
    id: "other",
    label: "Other local MCP client",
    file: "your client's MCP settings",
    filename: "toolgraft-mcp.json",
    config: jsonConfig,
    help: "Add this stdio server to a local MCP-compatible client. The client must run on the same computer as this browser. Field names can vary by client.",
    source: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
  },
] as const;
