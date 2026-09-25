# Extension coverage and community registry plan

Review date: September 23, 2026. Local developer preview only. Publication remains
on hold at the owner's request. The download client exists; community contribution
and a publicly reviewed catalog do not yet exist.

## Responsive coverage

`tests/browser/authoring.spec.ts` uses the production extension in isolated Chrome.
`tests/browser/layout.ts` checks 320, 390, 768 and 1100 CSS-pixel widths. The 18
states below give 72 state/width combinations, checking document overflow and
horizontal control bounds, with 36 screenshots. All six extension pages are covered.

| Page         | States covered                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Popup        | Initial diagnostics                                                                                                 |
| Onboarding   | Initial setup                                                                                                       |
| Options      | Empty, installed, local archive update review                                                                       |
| Connect      | Initial, paired, expanded instructions and native developer setup                                                   |
| Agent review | Missing request, pending/granted site access, pending install, expanded source, declined, installed, pending update |
| Confirmation | Expired request, pending write                                                                                      |

The first run caught a 380px popup overflowing at 320px. The popup now caps its
width at the viewport. Visual inspection also caught the local update dialog
opening scrolled to its bottom because Cancel received focus. Review now focuses
the heading so users see what they are installing first; the test checks that the
heading is in the viewport. Managed adapters now report their tool names to the
popup's existing diagnostics path.

These checks do not establish every OS font/zoom setting, screen reader behavior,
every error state, or every possible third-party adapter title/source length.
Screenshots are local under `.cache/screenshots/responsive/`.

The 0.2.1 version lifecycle adds four states (history/update, rollback review, MCP
rollback review and offline refresh) at the same four widths. It uses production
extension/MCP code with fixture registry responses. See [version controls](adapter-versions.md).

## Options inventory

| Control                                                      | Current exposure                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Pair, disconnect, local bridge port, client configuration    | Connect your agent                                                         |
| Allow User Scripts and Chrome-owned site grants              | Setup links to Chrome's extension details; Chrome owns the switches        |
| Local archive installation                                   | Manage adapters → file picker → source/access/tool review                  |
| Installed version, runtime, state, hosts and hash            | Manage adapters                                                            |
| Remove                                                       | Per installed adapter                                                      |
| Registry refresh, entry version/review status, manual update | Manage adapters; only reviewed registry entries are installable            |
| Permission/tool changes for an update                        | Install review; GitHub source diff when both commits are known             |
| Recheck browser setup                                        | Manage adapters                                                            |
| Export and repair                                            | MCP core tools; dedicated extension actions are not built                  |
| Pause adapter, pause all, per-tool switches                  | Not built; remove/disconnect are available but have different semantics    |
| Grouped versions, explicit rollback, newer-version badges    | Manage adapters; numeric ordering, saved archives and reviewed transitions |
| Registry search                                              | Not built                                                                  |
| Last successful registry refresh and refresh failure         | Manage adapters                                                            |
| Paired-client history                                        | Not displayed                                                              |
| Contribute/update a community adapter                        | Not built; export produces a local review bundle                           |

Recommended next UI work: an installed-adapter detail view with capabilities,
source/version, pause, repair and export; catalog search; connection and site-access status with clear
recovery actions. Retain fixed write approval and registry trust rules. There is no
reason to expose a switch that disables confirmations or accepts arbitrary registry
hosts, and no ToolGraft model-key setting is needed.

## Registry without a ToolGraft API service

Use GitHub as the contribution/review system and Pages for static catalog metadata
and immutable archives. [GitHub Pages serves static files](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
Consumers need neither a ToolGraft account nor a key. They install a pinned version
and approve updates manually. A GitHub account/authentication is required to submit
a contribution; it is separate from using an adapter.

Proposed contribution flow, not implemented:

1. The agent exports source, manifest, license, tests and a changelog. The user
   reviews the bundle for private content; no browser storage or credentials enter it.
2. With the user's existing GitHub integration, the agent forks/branches and opens
   a pull request. [GitHub's pull-request API](https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request)
   supplies the write operation. Without that integration, export plus GitHub's UI
   is the fallback. There is no direct public registry upload.
3. Namespaced ownership and CODEOWNERS identify reviewers. Other people can propose
   fixes without taking ownership. Each accepted change uses a new `major.minor.patch`;
   old archives remain immutable. Use semantic version comparison, not string order.
4. Isolated, unprivileged CI builds/tests the candidate, then maintainers review
   permissions, source and wired browser evidence. Protected merge and a separate
   trusted release job produce the public artifact and signed metadata.
5. The extension shows the new version, changed tools/hosts and source diff. The
   user explicitly approves it. Rollback is a distinct reviewed action, not an
   accidental downgrade disguised as an update.

A future GitHub OAuth/App integration can simplify submission, potentially with a
small credential service. It is not necessary for the initial static registry.

## Security findings before community submissions

### 1. High: legacy builds execute adapter code on the host

Evidence: `packages/cli/src/index.ts:58` builds a Node inspection bundle and line 68
imports it to obtain tool descriptors. Top-level adapter code therefore runs on
the build machine. Impact: an untrusted contribution can execute commands in the
builder's context and access any credentials available there.

The new MCP compiler (`packages/mcp/src/builder.ts`) parses source and bundles
without importing it; the ClasificadosOnline example uses that path. The legacy CLI
must move descriptor discovery to declarative data or static extraction before it
is used as a trusted community-publishing boundary. Until then, treat all legacy
adapter builds as execution of trusted repository code. Untrusted PR jobs must have
no secrets or publishing privileges. This is a finding, not a completed CLI fix.

### 2. High: registry hashes do not authenticate the publisher

Evidence: `apps/extension/lib/registry.ts:57` accepts HTTPS JSON and line 80 checks
archive identity against hashes from that same catalog. There is no independent
signature trust root. A compromised catalog host could replace both code and hashes
and label the result reviewed. Hash checks still help detect corruption and pin
already-installed content; they do not prove author identity.

Add signed release metadata with an independently protected root and rotation plan.
Use a mature update-signing design/library rather than a custom signing protocol;
[TUF metadata](https://theupdateframework.io/docs/metadata/) provides targets,
snapshot, timestamp and root roles. Public signature verification needs no user key.

### 3. Medium: metadata freshness remains incomplete

`apps/extension/lib/registry.ts` rejects strictly older revocation timestamps;
equal-timestamp changed contents remain accepted, and catalog metadata has no
monotonic version or expiry. Add signed metadata expiry and monotonic checks.

The 0.2.1 preview now retains approved version identities across updates, archive
eviction and removal. It blocks changed manifests under an approved ID/version,
requires explicit rollback review, and rejects stale activation approvals. Retained
local packages can be restored offline against cached safety data. Missing archives
require a successful fresh catalog/safety check before registry download. These
controls do not authenticate a publisher or detect revocations while offline.

### 4. Medium: build and publication privileges need separation

Evidence: `.github/workflows/pages.yml:4` grants Pages/OIDC write privileges to the
job that also runs repository builds at line 25. Actions use moving major tags.
Split unprivileged verification from protected publishing, pin Actions to reviewed
commit SHAs, avoid `pull_request_target` execution of untrusted source, and keep
release credentials out of adapter tests. GitHub documents these risks in its
[secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
Remote branch protection and repository security settings were not verified.

Script adapters remain trusted code within granted sites. Neither read-only
annotations, source validation nor SDK confirmation prompts sandbox malicious code.
The existing exact-host grants, bounded downloads, manual updates and fixed registry
origin are useful controls; the missing controls above prevent calling the public
community supply chain complete or fully secured.
