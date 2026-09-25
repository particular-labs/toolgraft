# One connection for every site's tools

The local developer preview now includes **ToolGraft MCP**. One agent connection
provides instructions, browser inspection, source scaffolding, validation,
installation requests and calls across locally installed managed adapters.
ToolGraft contains no model, model key entry or AI subscription. Your agent uses
its normal model access. Site content returned to that agent is subject to the
agent provider's data settings.

## Install and connect

1. Load the unpacked extension from the local release's `extension/` directory in
   Chrome's Developer mode. Enable **Allow User Scripts** in extension Details.
2. Open **Connect your agent** in ToolGraft or the website's Get started page.
   Choose **Copy setup instructions** and paste them into your existing agent.
   The instructions ask it to obtain permission before changing local settings,
   download the actual package, preserve existing MCP entries and verify startup.
   **Set up manually** retains package download, path and client configuration.
   Node 24+ must be on that agent's PATH. The package bundles the bridge, builder
   and runtime; npm installs pinned dependencies. No separate helper or checkout
   is needed.
3. Restart the agent connection. Ask it to call `toolgraft_connect`, then open its
   private link in the browser where ToolGraft is installed. Click ToolGraft in
   the extensions menu and approve **Connect this agent**. The link expires after
   five minutes and works once; opening it alone grants nothing. No API key or
   typed code is needed. Both processes must run on the same computer.
4. Ask, for example, “Create tools for this website so I can read its book titles.”
   The agent reads core instructions, opens the page, inspects it and creates a
   draft. Approve the site's permission prompt and review generated source/tools
   before installing. The agent then calls the installed tool and reports results.

For an existing package, ask the agent to call `toolgraft_request_package_install`
with its absolute file path and matching website URL. The extension opens a review;
you approve its source, tools and site access. No manual file picker is required.
`toolgraft_pair` remains under **Use a pairing code instead** for troubleshooting.

If a panel reports a mismatched or missing background response, reload ToolGraft in
`chrome://extensions`, close old ToolGraft panels and reopen them. Saved adapters
remain local. See [analytics choices and data exclusions](privacy-analytics.md).

The project-scoped `.mcp.json`, `.cursor/mcp.json` and `.codex/config.toml` use the
locally built package. Run `pnpm build` first and start the client from this repo.
Global agent settings are not modified by the repo. Version 0.3.0 automatically
starts or reuses a shared local bridge, so multiple MCP processes can coexist.
Each agent/project identity needs its own browser approval; repeat sessions for
that identity reuse it. **Connect your agent → Connected agents** shows individual
Disconnect controls. Disconnecting one leaves the others connected and cancels
its pending write confirmations and installation reviews.

An identity uses the MCP client's reported name and working directory. Names are
labels, not verified publisher identities. All approved agents use the same
browser's installed adapters and site grants; their authoring sessions and pending
reviews remain separate. Changing the client name or working directory requires a
new approval. Saved drafts are scoped to the identity. In-flight sessions expire
when their MCP session ends; restart authoring rather than replaying a write.

The bridge is bundled in the MCP archive and runs only on loopback. It chooses a
free port if an old preview or another program holds the preferred one. Users do
not need to change ports, install a helper, or stop another agent. It exits after
all MCP sessions have stopped and the idle grace period has elapsed. Approval
credentials stay local; bridge RPC uses a private machine-generated credential,
not a key the user must obtain or paste.

For existing installations, reuse the current configuration and correct package
path. Update each agent's MCP package to 0.6.0 and restart/reconnect that MCP once.
An already-running 0.2.2 process cannot gain the fix until restarted, but it need
not be killed to start the new bridge. Reload the updated extension and close/reopen
old panels. Existing adapters remain installed. Legacy single-agent connections
are retained as “Previous agent connection”; approve a fresh link from each updated
agent, then disconnect the obsolete entry when no longer needed.

Extension download links only work in the browser profile with ToolGraft. If an
agent controls another browser, download the package from the extension and give
it that local path, and open its connection link in the correct browser yourself.
The shared copyable prompt now explicitly describes this fallback.

[Generated agent instructions](generated-agent-instructions.md) are sourced from
`packages/agent-core`. The MCP help tool, extension, website and optional
`skills/toolgraft-authoring/SKILL.md` consume the same instructions. No skill
installation is required. Run `pnpm docs:generate` after editing that source.
Client configuration generation lives in `packages/agent-setup`.

## Updates and rollback

The 0.3.0 package exposes `toolgraft_versions` and `toolgraft_request_version`.
Restart the agent connection after changing its package path. Review and approve
updates or older versions in the extension, then verify the actual tool result.
See [version history, offline behavior and storage migration](adapter-versions.md).

## Readiness and limits

Normal adapter creation and repair use the MCP tools, including when the agent
starts inside this repository. Repository edits and contribution work require a
separate request. `toolgraft_find_tools` exposes tool schemas, `matches` and the
saved `launchUrl`, so agents need no checkout to find a site's route. A null
`launchUrl` means the agent must supply an actual matching URL. Pass tool values
in the `input` object of `toolgraft_call`; unknown MCP fields are rejected instead
of silently discarded. Discovery describes installed definitions, not live page
readiness. When disconnected, browser installation state is unknown.

For installed managed-script adapters, use `toolgraft_edit_adapter` with the
adapter ID and desired change. It returns a new agent-scoped draft containing all
tools, an authoring session, installed-version provenance and a proposed patch
version. It also works for imported archives with no saved draft. Inspect, patch,
validate and request the user's normal installation approval. The extension still
owns site grants and activation. Explicitly list intentional removals in
`removeTools`; accidental omission fails. Changed installed bases require a new
edit. Existing draft workflows remain available.

Recovery is static and only succeeds when recompilation reproduces the installed
code and manifest exactly. API, native-only and foreign/incompatible bundles fail
with `EDIT_SOURCE_UNAVAILABLE`; no generic JavaScript decompiler or host execution
is used. See [editing guarantees and limitations](editing-adapters.md). Respect a
user's ToolGraft-only constraint; missing details do not authorize another browser
connector.

Installed definitions can be searched while tabs are closed. `toolgraft_call`
opens or reuses the saved site route and waits for actual tool registration.
Ambiguous existing tabs produce a diagnostic. The browser must remain running;
login and site background behavior can require user action. A repair installs a
new version in a new task tab, preserving unrelated tabs and their unsaved work.
Never automatically repeat a write whose result became uncertain after disconnect.

Managed adapters work without native WebMCP flags. Where available, the same SDK
also registers native WebMCP tools. Existing immutable v0.1 registry packages are
native-only: use the **Native WebMCP developer connection** section in setup, or
create a managed adapter. Its historical project configuration is retained at
`config/native-webmcp.mcp.json`. `pnpm doctor:agent` exercises that native developer
path through Chrome DevTools MCP on port 9227.

`pnpm test:browser` tests the actual extension and MCP protocol without a model.
Cursor, Hermes and OpenClaw setup examples are documented but their applications
have not been exercised here. No subscription tier guarantees MCP support.

Browser-hosted ChatGPT, Claude and remote/VPS agents cannot reach local stdio or
loopback directly. This preview has no cloud relay. Their separately configured
remote/tunnel solutions are outside the verified flow. Gmail and Microsoft 365
adapters are not verified; login would remain in the user's browser.
See [authenticated sites and cloud clients](authenticated-sites-and-cloud.md).

## Ordinary requests and browser trials

Ask for the website task directly. For read-only changes, the agent handles
inspection, individual tool edits, compilation and proposed browser tests. Choose
Try update, review results, then Keep update. The agent can wait for approval and
continue; clients that end the turn can resume from saved drafts. See
[Ask, try, and keep](guided-trials.md). Setup should explain its configuration
scope: project-only settings do not follow you into another folder.

For same-tab connection approval, agent status, adapter cards and popup navigation,
see the [extension guide](extension-guide.md). One-tab connections require an explicit
optional loopback permission; toolbar approval remains available without it.
