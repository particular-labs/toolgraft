# Adapter updates and rollback

Available in the local 0.2.1 developer preview. Nothing is published by these
controls, and detecting an update never installs it.

## Use the extension

Open **Manage adapters**. Each installed adapter shows its current version, an
available-update action when eligible, and grouped **Version history**. History
distinguishes installed, saved local, catalog and unavailable versions. Expand a
version's provenance to inspect its manifest hash and source commit.

**Check registry and updates** refreshes catalog and safety metadata immediately.
The existing Chrome alarm also checks every six hours while Chrome runs. The page
shows the last successful check and any refresh failure; reopen it or check again
to see changes detected in the background. A cached catalog cannot establish that
you have the latest release. This local preview has no verified public catalog.

Choose **Review update** or a previous version's rollback action. The review shows
the exact version direction, source, hosts, tools and permission changes. Cancel
leaves the installed version alone. Approval activates that exact package. Older
versions require an explicit **Approve rollback** action. Rollback restores code;
it does not undo changes already made on a website. Reload existing site tabs to
refresh their native WebMCP listings. Agent-driven activation opens a fresh task tab.

## Use one MCP connection

Restart the agent with the 0.2.1 MCP package to expose the new tools:

1. Call `toolgraft_versions` with optional `adapterId` and `refresh: true` to check
   the catalog now. Without refresh, it reads local history and cached metadata.
2. Call `toolgraft_request_version` with `adapterId` and an exact `version`.
   Provide `url` when the adapter has no saved, unambiguous matching launch URL.
3. Ask the user to review the extension prompt. Poll `toolgraft_install_status`
   using the returned request ID. The MCP cannot approve its own request.
4. Verify the activated adapter with `toolgraft_call` and report the actual result.

The MCP exposes the same browser-owned history and approval rules as the extension.
It has no independent installation database. Locally generated new code still uses
the existing scaffold, patch, validate and request-install flow with a version bump.

## Version and storage contract

- Stable `major.minor.patch` versions compare numerically (`1.10.0` > `1.2.0`).
  Prerelease/build suffixes are outside the current manifest schema.
- An approved adapter ID/version pins its manifest SHA-256, including its payload
  hashes. Changed code or permissions require a new version. Identity pins remain
  after archive eviction and adapter removal; clearing extension data removes them.
- Every activation revalidates package integrity, compatibility and cached
  revocations. It also checks that the installed manifest still matches the one
  reviewed. A stale review must be restarted.
- Current packages remain stored. Up to three previous packages per adapter are
  retained within a shared 4 MiB history-body budget. Metadata and pins survive
  eviction. Chrome's overall storage quota still applies; storage failures surface
  as errors. The implementation submits package and activation metadata in one
  storage write; quota failure coverage currently uses a storage mock.
- A retained package can be restored offline using the last cached safety list.
  This cannot discover new revocations while offline. A missing archive requires
  the exact local package to be imported again, or a fresh catalog/safety fetch and
  reviewed registry download. Failed remote refresh never falls back to a stale
  catalog to authorize a download.
- Local approved archives remain local/experimental; saving them does not confer
  public review. Unreviewed catalog entries, known identity conflicts and revoked
  versions are blocked. Compatibility is checked before approval; the catalog
  alone does not include every package's minimum extension requirement.
- Extension storage migrates from schema 1 to schema 2 on first use, preserving
  current installed packages. It cannot recover archives already deleted by older
  builds. **Older extension builds cannot read schema 2.** Export needed source or
  keep original archives before downgrading the extension itself. Adapter rollback
  does not downgrade the extension or its storage schema.

## Shared ownership

| Concern                                     | Source of truth                           | Consumers                                                       |
| ------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Version comparison and activation operation | `packages/adapter-schema/src/versions.ts` | CLI catalog ordering, extension storage and review              |
| Installation, history, pins and retention   | `apps/extension/lib/store.ts`             | Browser UI and agent bridge                                     |
| Available versions and target resolution    | `apps/extension/lib/versions.ts`          | Options UI and both MCP version tools                           |
| Version review wording and changes          | `apps/extension/ui/version-review.ts`     | Local and agent-requested review screens                        |
| User and agent instructions                 | `packages/agent-core/src/index.ts`        | MCP help, extension, website, generated docs and optional skill |

No new API service, account, key, model or relay is involved. Community submission,
publisher signatures and metadata freshness guarantees remain separate work; see
the [registry audit](extension-registry-audit.md).

## Verification

`tests/unit/versions.test.ts` covers comparison, migration, history and identity
retention, stale/explicit approval, invalid targets, offline resolution and mocked
quota failures. `tests/browser/versions.spec.ts` drives the production extension
and real MCP SDK in isolated Chromium with native WebMCP disabled. It verifies a
scheduled update check without automatic installation, approval/cancellation,
actual updated and rolled-back tool output, offline recovery and revocation refusal.
Its catalog HTTP responses are deterministic fixtures, not a hosted-registry test.

The new history, rollback, agent review and offline states are checked at 320, 390,
768 and 1100px. Narrow and desktop screenshots received visual review. This does
not claim exhaustive accessibility or third-party site coverage.
