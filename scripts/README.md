# Repository scripts

- release.mts assembles the audited extension, static site/registry, playground,
  licenses, adapter packages and checksums under dist/release/.
- check-immutable.mts rejects changes/deletions of published package paths against
  IMMUTABLE_BASE; CI uses the PR base or previous push commit.
- dev-browser.mts launches the real extension in a dedicated Chrome profile with
  native WebMCP flags and a loopback debugging endpoint for Chrome DevTools MCP.

- check-reproducible.mts clones committed source into a temporary directory,
  installs cached dependencies independently, verifies all archive bytes, and
  proves a changed existing artifact is refused. Run after committing source.

Run through the root pnpm scripts on Node 24.21.0.

- agent-config.mts prepares matching Codex/Claude Code/Cursor project files and
  refuses to replace unrelated configuration.
- doctor-agent.mts verifies discovery and read calls through the actual MCP server
  connected to the local demo browser; no model account is needed.
- test-mcp-package.mts verifies the standalone archive outside the repository,
  using a fresh npm cache and independent MCP processes.

- clasificados-adapter.mts compiles the local keyword-search example through the
  managed MCP builder, without executing its source on Node. release.mts includes
  the archive and editable source in the local candidate, outside the public registry.
