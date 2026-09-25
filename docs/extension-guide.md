# Using the extension

ToolGraft 0.6.0 keeps the toolbar useful for quick checks and opens longer tasks in
normal browser tabs. It keeps the same branding and instructions as the website.

## Quick checks

The toolbar popup is wider and has three keyboard-accessible tabs:

- **This page** shows live tools reported by the active page and a setup warning
  when User Scripts is disabled. Installed adapters alone do not mean tools are
  running on this page.
- **Adapters** searches the installed names and sites and shows version/tool counts.
- **Agents** lists approved agents, whether each is connected or waiting for its
  client, and an individual Disconnect action. Agent names are client-provided,
  not verified publisher identities. The list refreshes while the panel is open.

**Open full view** opens the responsive library in a browser tab. Chrome limits
its toolbar popup to 800 by 600 pixels; full pages can use the available window.
ToolGraft's popup uses 560 pixels when available and adapts down to 320 pixels.

## Adapter library

Installed adapters appear as cards with their description, sites, version, state,
updates and tool count. Search names, sites or tools; filter Ready, Needs attention
or Updates available. Tools, permissions, source identity and version history stay
available in disclosures. Local imports remain explicit reviewed installations.

**Catalog** contains registry checks, availability and failure status.
**Settings** contains browser checks, setup, optional one-tab connections and
opt-in extension analytics. Switching tabs works with arrow keys, Home and End.

Site initials are rendered locally. Opening the library does not fetch site icons
or send an installed-adapter list to a third-party image service.

## Connect in the same tab

Choose **Enable one-tab connections** in onboarding or Settings and approve Chrome's
optional permission for `http://127.0.0.1/*`. ToolGraft then recognizes only its
strict local connection URL format and replaces that tab with an extension-owned
approval screen. Choose **Connect this agent** or **Not now**. Opening the URL
alone never pairs an agent. No ordinary page gets adapter-management access.

This opt-in is off initially. Without it, open the private link and click ToolGraft
in the extensions menu. The private invitation still expires after five minutes.
Turn the feature off in Settings to remove its loopback host grant. No website
password, model key or ToolGraft account is involved.

## Setup and documentation

**Your agents** shows a short setup flow when no agent is approved. Once an agent
is approved, the list takes its place; **Add agent** reveals setup again. **Trouble
connecting?** keeps the optional pairing-code fallback out of the normal flow.
Disconnected state is neutral; green indicates a live connection.

**Documentation** opens bundled help that works without the website. The website's
`docs.html` uses the same topic content, navigation and renderer. Manual MCP client
configuration and the native WebMCP developer connection live in those docs.
The machine-readable instructions remain available to agents through MCP.

## Background task pages

The MCP waits for the main document to be ready instead of waiting for all page
resources. Slow advertisements or images need not block inspection or trials.
Dynamic content may still need time or a focused follow-up inspection; a ready
DOM does not prove a site's results have loaded.

Agents can inspect a website directly by URL. ToolGraft requests site access when
needed and returns a session they can reuse for focused inspection. Equivalent
browser URL spellings (such as a homepage with or without its final slash) are
normalized. Real redirects still require checking the new address. A successful
explicit adapter call remembers its matching launch URL for later requests.

Before opening more than eight task tabs for one agent session, ToolGraft releases
eligible idle background tabs it created. User-created tabs and tabs the user
activates or navigates are preserved, as are active/pinned/audible tabs, running
calls and live reviews. Cleanup never navigates or closes those protected tabs.
Agents can call `toolgraft_release_pages` when finished. After an extension restart,
old ownership is forgotten, so unknown tabs are preserved rather than reclaimed.

Installed script initialization is guarded per version/document. An on-demand
call may initialize the already-approved package after DOM readiness, through the
User Scripts API with a pinned document ID. Later idle registration cannot start
that same package twice. Tool calls and write approvals keep their existing rules.

## Trial expectations

A trial can combine normal successful reads and negative tests with an exact
`expectedError` application code. At least one successful case is required.
Timeouts, navigation failures and transport errors never qualify as an expected
application rejection. Review shows the expectation and the actual outcome.
Large arrays show item counts and structured details stay behind **Full test
result**, so long results do not bury the Keep/Discard actions. Read the contents
with your agent before keeping: passing execution is not a guarantee of accuracy.

These changes improve the workflow; they do not establish accuracy on every site
or guarantee how every external model follows instructions. See [project status](project-status.md)
for the current acceptance evidence.

Chrome references: [action popup limits](https://developer.chrome.com/docs/extensions/reference/api/action)
and [User Scripts execution](https://developer.chrome.com/docs/extensions/reference/api/userScripts).
