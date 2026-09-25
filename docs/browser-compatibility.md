# Browser compatibility evidence

Verified September 23, 2026 with Chrome for Testing **153.0.8010.12**, Playwright
1.63.0, Chrome DevTools MCP 1.10.1, Node 24.21.0. Enable native features with
`--enable-features=WebMCP,WebMCPTesting` and Allow User Scripts in extension Details.
The extension manifest's Chrome 138 minimum describes User Scripts support, not a
promise of native WebMCP availability on that release. Managed adapters additionally
use the User Script extension connection and work with native flags disabled, as
proved by the authoring browser test. Native-only v0.1 packages report missing
WebMCP as blocked. No MAIN-world injection or WebMCP polyfill is used.

USER_SCRIPT tools are visible to page-native `document.modelContext`. In this
verified build navigator.modelContext is absent. The shared wrapper prefers the
document API and keeps a navigator fallback. `executeTool(tool, "{}")` works;
passing an object fails with `UnknownError: Failed to parse input arguments`.
The native ABI is kept in one compatibility package. Never retry writes under an
alternative ABI, since a failed response need not imply a failed mutation.

The actual official MCP server is spawned by the integration suite, connects to
the test browser, and successfully invokes `list_webmcp_tools` and
`execute_webmcp_tool` for the installed playground package. Enable its experimental
WebMCP category explicitly; the generic preconfigured DevTools connection does
not necessarily expose it. See README for the exact launch command.

The SDK's native registration is owned by an AbortController. SPA routes are
checked every 250 ms because USER_SCRIPT cannot wrap MAIN-world history methods.
Per-call route/installation checks stop calls during the polling interval. Tool
listings from removed packages disappear when matching pages reload; new calls
fail immediately through local authorization checks.

References: [WebMCP draft](https://github.com/webmachinelearning/webmcp),
[User Scripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts),
[Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp),
[Playwright extension testing](https://playwright.dev/docs/chrome-extensions).

An actual Claude Code model-driven discovery/read receipt and the distinction from
protocol-only tests are recorded in [agent setup](agent-setup.md). Project setup
uses one shared browser connector for all matching open tabs.
