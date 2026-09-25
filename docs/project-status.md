# Project status

ToolGraft 0.6.0 is a local developer preview. The intended public repository is
`particular-labs/toolgraft`; the project is free and MIT-licensed. Public hosting,
Chrome Web Store submission and publication have not been completed.

## Available

- Chrome extension with optional site grants, package inspection, version/hash
  pinning, manual updates, rollback and cached revocations.
- One local MCP package for connection, discovery, inspection, authoring,
  validation, installation requests and tool calls. Multiple agents can connect
  independently; the browser owns installation and write approvals.
- Editing of supported installed managed-script adapters, including imported
  packages without a saved draft. Recovery must reproduce installed code exactly.
  Edits preserve tools and reject stale installed versions.
- Approved browser trials for read-only candidates, individual tool edits, targeted
  inspection, bounded approval waits and saved-draft recovery. See
  [Ask, try, and keep](guided-trials.md).
- Shared instructions, branding and setup across extension and website. Website
  analytics are limited to the configured public deployment; extension analytics
  require opt-in.
- Optional same-tab connection links with explicit approval, connected-agent lists,
  popup tabs and a responsive full-tab adapter library with search and filters.
- DOM-based page readiness, guarded User Scripts initialization, remembered launch
  URLs, URL normalization and bounded cleanup of eligible agent-owned task tabs.
- Direct URL inspection and trial assertions for exact expected application errors.
- Structured human documentation on the website and bundled offline in the
  extension, sharing one topic model and renderer. Connection setup is a short
  single-column flow; approved agents replace setup, with pairing-code recovery
  under troubleshooting and manual/developer configuration in the docs.
- Deterministic playground, public-site examples, static registry tooling and
  versioned local release archives.

ToolGraft provides no AI service or model credentials. The user's existing agent
supplies the model. Node 24+ and Chrome 138+ are prerequisites. Managed adapters
work without experimental WebMCP flags; older native-only examples require native
WebMCP support.

## Verification

The 0.6.0 validation passes `pnpm check` with 46 unit tests and the browser suite
with 25 passing tests (two opt-in public-site canaries skipped). The docs cleanup
run passed 24 tests; its preview-startup test passed a focused rerun after updating
the test to exercise Chrome's full-tab options entry point. The browser suite
covers connection, approval, read/write behavior and layout; the trial flow
covers decline, failed calls, keeping exact tested code, stale versions, agent
ownership, disconnect cleanup and pending/reordered task tabs. The live
ClasificadosOnline canary exercised search, inspected a returned listing, added
a listing-page-title tool without changing search, approved a trial, kept it,
and verified both installed tools. This proves that flow and title extraction,
not a general listing-description parser. The canary permits one recorded retry
of its known read search after a site timeout.

The standalone MCP archive starts outside the repo with a fresh npm cache,
exposes 26 core tools, and supports two processes on one shared bridge. Five
immutable registry packages and the existing ClasificadosOnline archive retain
their hashes. Runtime registration uses the newest owned task tab, including its
pending URL, so keeping an update cannot accidentally select an old same-URL tab.

Run these checks for the current checkout rather than relying on past counts:

```sh
pnpm check
pnpm test:browser
node scripts/test-mcp-package.mts
pnpm registry:verify
```

`pnpm test:live` adds read-only public-site canaries. Automated protocol tests do
not establish compatibility with every external agent or operating system.
Generated logs, screenshots, research and one-off model runs remain local and
are not part of the repository or release documentation.

### Everyday-use acceptance

The previous preview failed ordinary-use acceptance on slow page resources, task
tab exhaustion and negative trial assertions. The current browser fixtures cover
those failures: a never-finishing image does not block DOM inspection, more than
eight task pages can be used while protected user tabs remain open, and exact
application errors can pass negative cases without treating timeouts as success.

A fresh local Claude session exercised English and Spanish shopping requests,
search and listing inspection, missing mileage, and a generated description/condition
update. It tried and corrected the candidate, kept version 0.1.1, then verified
search and four installed listing calls. The final five-call parallel batch passed
without retries. An earlier batch had one intermittent runtime-registration failure;
its cause was not established, so the later pass does not prove it eliminated.

Generated extraction needed several trials and follow-up to stop guessing condition
from indirect page data. A successful tool result alone did not establish parser
accuracy. This remains a technical pilot, not a claim of effortless use across sites.

Layout review covers 29 captured states at narrow and desktop widths, long labels,
expanded disclosures, approval/trial/confirmation screens, and actual Chrome popup
captures. The native popup measured 560 pixels wide with height at most 600 pixels
and one content scroller. No material layout issue remained in that reviewed scope.
This is layout evidence, not general accessibility or site-compatibility certification.

The documentation cleanup additionally checks all nine topics at 320, 390, 768
and 1100 pixels, topic history and keyboard focus, mobile navigation and manual
configuration. Website docs, extension offline help and the simplified connection
screen were visually reviewed at narrow and desktop widths, including expanded
pairing recovery. Browser connection and authoring flows still require approval.

A separate empty-folder, clean-profile test uses downloaded local archives and
fresh Claude sessions. It confirmed MCP setup, an initially empty adapter/agent
list and explicit same-tab pairing. Native host grants were supplied by the test
harness because desktop automation selected the older Chrome instance; that step
is not claimed as a complete human-UI installation test. It exposed a root-URL
serialization bug, now covered by a regression test: a browser-added trailing slash
must not be reported as a login redirect. The conversation receipts remain ignored.

That clean-profile session generated a read-only Lobsters adapter through MCP,
ran front-page/newest/search/topic-filter trials plus an invalid-tag rejection,
kept the exact tested version and called the installed tool for a developer-tool
shortlist. Local export preserved the tested package hash. Site bot checks can
still interrupt reads, and external-agent narration needed follow-up; neither
the site's continued availability nor consistent model behavior is guaranteed.

## Limits and release work

- Local browser connectivity only; no hosted relay for cloud-only agents.
- Installed-adapter editing does not support API, native-only or incompatible
  compiled packages. See [editing](editing-adapters.md).
- No verified Gmail/Microsoft 365 adapters, broad site coverage or current
  Windows/Linux desktop acceptance.
- Registry entries remain local/experimental pending human source review.
  The legacy compiler's host execution, registry authenticity/freshness and
  publication protections need work before community publishing. See the
  [registry audit](extension-registry-audit.md).
- Store assets, hosted setup/privacy/support, broader fresh-user acceptance and Google
  review remain outstanding. The separate adapter repository is proposed,
  not created. See the [beta release plan](beta-release-plan.md).

For setup, use [agent setup](agent-setup.md). For building and packaging, use the
[release procedure](release.md). Local investigations are intentionally separate
from maintained product documentation.
