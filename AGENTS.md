# ToolGraft project guidance

Read `docs/project-status.md` first. `DESIGN.md` and `PRODUCT.md` describe the
current product direction. If the original local `ToolGraft-engineering-handoff.md`
is present, read it for historical context; it is not required in a fresh clone.

- This is a free, open-source Particular Labs project. The intended GitHub path is
  `particular-labs/toolgraft`; the default project license is MIT.
- Preserve any local handoff. Keep research, session notes and run receipts in
  ignored local paths; keep maintained product and contributor guidance in `docs/`.
- ToolGraft provides no internal AI. Creation and repair use the user's existing
  external agent and its normal subscription or model setup. Do not add model
  API calls, model credentials, token billing, or a hosted inference service to
  ToolGraft. MCP supplies tools and instructions; the external agent reasons and
  generates code. See `docs/guided-authoring-design.md`.
- Target setup is the browser extension plus one MCP package in the existing
  agent. Bundle local bridge/build dependencies into that package; do not require
  a separate helper installer, repo checkout, CLI installation or mandatory skill
  for normal users. Distinguish local and remote agent connectivity explicitly.
- Expose versioned agent instructions and adapter management as core ToolGraft
  MCP tools, independent of site adapters. A skill is optional distribution of
  those instructions. The extension validates and approves local installation;
  ordinary page scripts must never gain access to management operations.
- Requests to use, create or edit an installed website adapter use ToolGraft MCP
  by default, even when the conversation starts in this checkout. Core repository
  changes require a repository-development request. Use `toolgraft_edit_adapter`
  for supported installed managed scripts; preserve tools and never silently
  substitute shell scraping or a different browser connector for MCP-only use.
- Guided use should resolve and open/reuse the required site tab on demand.
  Distinguish installed capability metadata from live WebMCP registration; verify
  page/session readiness before calls and never blindly retry uncertain writes.
- Build against the current scope in `docs/project-status.md`. Each implementation
  milestone needs its own evidence.
- Keep milestone completion separate from compilation and unit-test success.
- The website reference is imported in `apps/web`. Preserve its visual direction
  during implementation. Marketing and the deterministic playground are separate
  apps. See `DESIGN.md` for the shared visual direction.
- Use Node 24 and pinned pnpm, TypeScript, WXT, Vitest, and Playwright.
- Keep runtime compatibility in `packages/runtime-webmcp` and product contracts in
  their shared packages. The original v0.1 excluded a custom MCP bridge; the owner
  has now authorized the guided-authoring milestone and its local bridge. No
  database, account service, hosted inference or public relay is in this milestone.
- Never execute fetched adapter code outside Chrome's User Scripts API. No `eval`,
  `Function`, remote script tags, remote WebAssembly, or packed dynamic imports.
- Host grants must be optional and explicit. Match locally, pin versions and hashes,
  deny corrupt state, and require manual adapter updates.
- Never describe script capabilities or confirmation prompts as a sandbox.
- Verify upstream licenses and preserve notices before copying or vendoring code.
- Add meaningful tests with runtime behavior; do not manufacture green placeholder
  tests. Browser and live tool receipts are required by the handoff.
- Use `pnpm check` for the preparation baseline. Add unit and browser suites to CI
  when the corresponding functionality exists.
