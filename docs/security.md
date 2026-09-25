# Security model

Script adapters are trusted JavaScript on approved sites. They can read and change
those pages. ToolGraft's review labels, capabilities, and SDK confirmation cannot
sandbox a malicious installed script. Do not install code you do not trust.

## Implemented controls

- Exact HTTPS hosts (HTTP localhost for development), explicit optional grants,
  bounded packages/input/output, SHA-256 identity, immutable versions, manual updates.
- Downloaded executable code runs only through `chrome.userScripts` in USER_SCRIPT.
  API packages are data interpreted by the fixed bundled WebMCP Today engine.
- Normal navigation matches locally. Registry requests use one compiled-in HTTPS
  origin/path, omit credentials, reject redirects, and bound response size/time.
  Failed refreshes preserve the last good safety list; older lists are rejected.
- Revoked, corrupt, incompatible, or ungranted adapters do not register. SDK calls
  recheck active installation and grants locally, including in existing pages.
  Reload matching pages to remove already-created native tool listings.
- Approved version identities persist across updates, history eviction and removal.
  Updates and explicit rollbacks recheck package integrity, cached revocations,
  compatibility and the installation that was reviewed. Saved history supports
  offline rollback with cached safety data; see [version controls](adapter-versions.md).
- SDK writes/destructive operations open a dedicated extension confirmation window
  displaying the site, tool, and bounded input preview. Approval is single-use,
  expires after two minutes, and fails closed on window/port/tab closure or worker
  restart. Duplicate simultaneous calls to the same tool are refused.
- Native tools win name collisions. Registration is abort-owned; route changes
  stop old registrations and in-flight confirmations cannot cross routes.
- User input and adapter text are rendered with textContent, not HTML. Extension
  pages use bundled scripts/fonts; no remotely loaded executable UI dependencies.

No accounts or server-side tool execution. Minimal website analytics and opt-in extension analytics follow the [shared privacy contract](privacy-analytics.md). Browser permissions and
package records stay local. API requests go directly to declared sites and may
use that site's browser session as the package specifies. Diagnostics remain in
session storage. Removing the extension clears its local data.

## Review requirements

Public packages require source/license review, exact permission/tool inspection,
read/write annotation verification, and wired browser evidence. Watch for hidden
writes, cross-origin requests, obfuscation, token capture, unrestricted selectors,
unsafe interpolation, and misleading output. Never treat annotations as enforcement
against malicious JavaScript. Review the fixed upstream engine when upgrading it.

Enable and verify GitHub private vulnerability reporting before public launch.
Do not send sensitive reports through public issues. No unverified reporting email
or response-time promise is listed here.

## Local agent bridge and generated adapters

The MCP binds WebSocket transport to 127.0.0.1 and checks Host and extension Origin.
A five-minute, single-use 256-bit connection link provisions a per-profile token after explicit approval from the extension toolbar. Its secret stays in the URL fragment and is removed after connection; the static loopback landing page has no JavaScript or analytics. A rate-limited pairing code remains an advanced fallback. A web page
cannot use management messages; extension review screens are separate trusted UI.
The packaged `scripting` permission inspects only a user-approved authoring origin.
Generated functions are parsed and bundled without executing on the Node host.
Candidates are unpacked and validated again in the extension; installation requires
explicit UI review of their source, tools, origin, version and archive SHA-256.
Managed tools preserve existing per-call write approvals and installation checks.
Disconnects and timeouts report uncertain outcomes rather than retrying writes.

This does not make generated code a sandbox. Source and inspected content pass to
the chosen external agent; do not embed credentials or private content in adapters.
The MCP keeps agent-scoped drafts in `~/.toolgraft/drafts/<identity>` and bridge
state/approval credentials in `~/.toolgraft/bridge-v2`, with owner-only file modes.
An explicit data-directory override changes that root. Older preview data may
remain in its historical location. Removing the extension does not remove those
separate directories. Installed-adapter editing reads a verified package and
requires lossless static recovery; source is returned to the user's agent,
and an edit still requires explicit browser installation approval.

## Community registry readiness

The [registry security audit](extension-registry-audit.md#security-findings-before-community-submissions)
records open findings: legacy CLI host execution, unsigned metadata, incomplete
metadata freshness and build/publish privilege separation. The legacy
CLI imports trusted repository adapters while extracting descriptors; do not use
that build path as a trusted boundary for unreviewed community code. The new local
authoring compiler does not import generated code. These controls and distinctions
must be addressed before calling the community publishing workflow ready.
