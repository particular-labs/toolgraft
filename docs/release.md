# Release procedure

The local deliverable is a v0.6.0 developer-preview candidate. Source is intended for
`particular-labs/toolgraft`. Registry URL is compiled to
`https://particular-labs.github.io/toolgraft/registry/`. No custom domain is assumed.

## Rebuild

Run `pnpm check`, `pnpm test:browser`, `pnpm test:live`, and
`pnpm toolgraft test --all`. Commit adapter source, generate with
`pnpm registry:build`, verify with `pnpm registry:verify`, then run
`pnpm release:pack`. The output is `dist/release/` with extension zip/unpacked tree,
the standalone MCP archive, adapter archives, SHA256SUMS.json, deployable static site+registry, playground and
docs. Production manifest inspection refuses required host grants, global content
scripts, or permissions other than storage, alarms, activeTab, scripting and userScripts.

## Local 0.6.0 upgrade

This preview adds approved read-only browser trials, individual tool edits,
targeted inspection, bounded approval waits and saved-draft recovery to the existing
version lifecycle and multi-agent connection flow. Rebuild and use the matching 0.6.0 extension and MCP package; restart the agent
connection after updating its package path. Shared product assets include only the
current MCP package. See [guided trials](guided-trials.md), [editing support](editing-adapters.md) and the
[Store/beta and public-repo plan](beta-release-plan.md). No Store submission or
public release has been made.

Extension storage remains at schema 2; upgrades from schema 1 retain current
packages during migration. Older extension builds cannot read schema 2. Keep original adapter archives or export needed
source before downgrading the extension. Adapter rollback itself stays within
schema 2. See [version controls](adapter-versions.md).

## GitHub and hosting

Create the public Particular Labs repository, push the source and generated
registry, and run CI on the exact pushed commit. Configure protected main/required
CI, human adapter source review, and private vulnerability reporting. Enable GitHub
Pages with Actions and run the manual Publish website workflow. It builds and
verifies the immutable registry before deploying the site. This deliberately
requires an explicit workflow dispatch; merging source does not silently publish.

Verify the hosted index, revocations, adapter hashes, setup/privacy pages, and real
extension registry install after deployment. Review and mark launch adapter entries
reviewed in a source PR; local/experimental labels are not public review. Preserve
all old package artifacts when publishing updates. CI rejects changed/deleted
immutable paths. Revocations can change with a newer updatedAt timestamp; they must
not trigger automatic package updates. The live read-only canary workflow can be
scheduled after launch; failures require investigation, never automatic publishing.

## npm and GitHub releases

The MCP package publishes as `@particular-labs/toolgraft-mcp` from `.github/workflows/release.yml`.
A pushed `v*` tag is the release decision: the workflow checks the tag matches the package
version, runs the full gate and package test, publishes to npm with trusted publishing
(OIDC, automatic provenance, no stored token), attaches the extension ZIP, MCP archive and
checksums to a GitHub prerelease, and redeploys the website.

```sh
pnpm release:version 0.7.0   # bump every version site, regenerate agent docs
git commit -am "chore: release 0.7.0" && git push
git tag v0.7.0 && git push origin v0.7.0
```

One-time setup: publish the first version manually after `npm login`
(`pnpm --filter @particular-labs/toolgraft-mcp build && npm publish packages/mcp/dist --access public`),
then add a trusted publisher on npmjs.com for repository `particular-labs/toolgraft`
and workflow `release.yml`.

## Chrome Web Store candidate

Single purpose: let users explicitly install pinned site adapters that expose
website tools to their existing local agent. No ToolGraft accounts or paid features.
Minimal website analytics and optional extension analytics are described in the Privacy page.

Short description: “Add versioned WebMCP tools to websites you approve. Free and
open source by Particular Labs.”

Permission explanations:

- storage: exact installed packages, version/hash pins and cached safety lists.
- userScripts: only downloaded script execution path, isolated USER_SCRIPT worlds.
- alarms: periodic catalog and safety-list refresh; no automatic adapter installs.
- activeTab: current-page diagnostic display.
- scripting: bounded inspection of a user-approved authoring site.
- optional HTTPS hosts: requested only for the exact adapter sites the user approves.
- optional localhost: owned deterministic playground in this developer preview.

Review steps: load unpacked, enable Allow User Scripts and native WebMCP; install
playground tgz, approve localhost, open the playground, call list_tasks, deny a
create_task and verify no mutation, then approve one and observe it. Reload, remove,
and verify calls are unavailable. Run the supplied browser suite for the same flow.

The extension executes remote script packages only through chrome.userScripts;
API package JSON is interpreted by a fixed bundled engine. There are no remote
script tags, eval-based adapter execution, or custom native messaging services.
Script packages remain trusted code rather than a sandbox; review this distinction
in the listing and privacy policy. Zod is configured for interpreted validators to
respect extension CSP; browser tests exercise the production artifact.

Before submission: finish public source review, confirm the hosted privacy/support
URLs and registry work, review the shared icons and add store-required screenshots, and supply the actual
store account/listing. Native WebMCP is experimental; store acceptance and stable
browser availability are external gates, not implied by a passing local suite.
