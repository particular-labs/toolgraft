# Beta and public-repository plan

Assessment: September 24, 2026. Publication remains on hold. This is a local
developer preview, suitable for a small technical pilot after the 0.6.0 checks,
not yet a completed public Store launch. The remaining work is release readiness
and supply-chain hardening, not another homepage redesign.

## Release in stages

| Stage                                  | Recommendation                                                                                         | Exit evidence                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Local technical pilot                  | A few users comfortable with Node and unpacked Chrome extensions; maintainers supply selected packages | Fresh-user install/connect/use/edit, clear failure recovery, current Codex and Claude sessions, latest archive checks                          |
| Unlisted Store beta                    | Recommended first Store audience, after the checklist below                                            | Hosted setup/privacy/support, reviewed example packages, reproducible candidate, reviewer instructions and Store approval                      |
| Public discovery and community catalog | Later, after pilot feedback and contributor controls                                                   | Protected adapter supply chain, trusted metadata plan, safe build/test isolation, verified rollback/revocation and supported-platform evidence |

No readiness percentage or approval date is promised. Do not advertise cloud
ChatGPT/Claude connectivity, authenticated Gmail/Microsoft 365 support, Windows
or Linux desktop verification, or generic editing of all packages without evidence.
Current local-agent setup still needs Node 24+. ToolGraft itself supplies no AI.

## Chrome Web Store, first time

1. Choose a durable Particular Labs publishing identity, register it in the
   developer dashboard, pay Google's one-time registration fee, and complete
   current account/security requirements. This must be an account the owner can
   retain and monitor. [Registration](https://developer.chrome.com/docs/webstore/register).
2. Prepare the tested extension ZIP, listing text, icon/screenshots, working
   support and privacy URLs, and reviewer test instructions. Upload a new item;
   fill out Store Listing, Privacy, Distribution and Test instructions.
   [Publishing](https://developer.chrome.com/docs/webstore/publish) and
   [image requirements](https://developer.chrome.com/docs/webstore/images).
3. Explain the single purpose, every permission, site data passed to the user's
   external agent, optional extension analytics and the local MCP companion.
   Declare user-provided/downloaded adapter code accurately; do not select a
   misleading "no remote code" answer. [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
4. Select **Unlisted** for link-based beta access, or **Private** for named
   testers. Both undergo normal policy review. If maintaining separate beta and
   production listings, follow Google's beta naming/description requirements.
   [Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).
5. Submit for review with automatic publishing disabled so the approved candidate
   can be checked before release. Google may approve or request corrections.
   Reviews often take days and can take weeks; updates also undergo review.
   [Review process](https://developer.chrome.com/docs/webstore/review-process).
6. After approval, publish deliberately, install the actual Store item in a clean
   profile and repeat pairing, adapter installation, editing and update recovery.
   A Store ID can differ from the unpacked preview: test that exact build/profile.

Google explicitly permits remote execution through its User Scripts API. That
exception applies only to that execution path; extension/background/UI logic must
remain bundled and reviewable. This supports ToolGraft's architecture but is not
an assurance of approval. Reviewers need a reproducible demonstration of the
adapter lifecycle and the bundled local MCP, without credentials to a private
site. [Manifest V3 policy](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements).

Store approval and user approval are separate. The Store reviews ToolGraft; users
still enable **Allow User Scripts**, approve each agent, grant sites, review
adapter versions and confirm writes. Store updates do not individually review
every community adapter. [User Scripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts).

## Remaining launch checklist

- Publish only after owner authorization. Host the website, MCP download,
  playground, privacy policy and support route, then verify their actual URLs and
  hashes. Local builds do not prove hosted availability.
- Prepare fresh screenshots and a short reviewer walkthrough using a dependable
  read-only managed example. Existing registry entries are local/experimental and
  native-only; public review and managed examples remain work.
- Run the exact candidate in clean profiles and fresh external-agent sessions.
  Document the platforms actually tested; do not infer Windows support from a
  Linux CI build. Exercise connection, errors, permission denial, editing,
  manual update, rollback and analytics opt-out.
- Audit the final ZIP for permissions, development URLs/paths, prohibited code
  execution, third-party notices and the clearly documented MCP archive. Loopback
  is an intentional runtime dependency, not a leftover development server.
- Complete Store forms against actual data flows. Page contents and adapter source
  reach the user's chosen model provider; opt-in telemetry exists. Do not say
  "no data leaves your device." Audit Umami retention and proxy logs separately.
- Before community publishing, resolve the existing legacy CLI build-host
  execution finding and catalog authenticity/freshness design. See the
  [registry audit](extension-registry-audit.md). Hashes from the same catalog do
  not independently authenticate its publisher.

## Public-repository cleanup

MIT, upstream notices and contributor/security-model docs already exist. The
current tracked-tree path scan found only deliberate `/Users/demo` test fixtures,
not developer checkout paths. A redacted Gitleaks history scan covered 59 commits
with no findings before this change. This is a secret-pattern scan, not a complete
privacy or dependency audit. Re-run on the final public commit and inspect author
metadata, screenshots and generated evidence before exposing full history.

Local profiles, pairing credentials, drafts, logs, output and caches must remain
untracked. `.serena/` is now ignored without modifying its contents. Do not add
`.toolgraft` state or a real agent's credentials to a release. Keep examples and
reviewer data synthetic/public. Preserve the original engineering handoff.

Website publishing now separates an unprivileged build from the Pages/OIDC deploy
job, and checkout does not persist credentials in that build. Release artifacts
are named by source SHA. These workflow changes still need hosted CI validation.
Pin Actions to reviewed commit SHAs, configure protected branches/environments and
required reviews, enable private vulnerability reporting and secret scanning,
and assign real maintainer CODEOWNERS before public contributions. No team names
or remote protections have been invented or configured locally.

## Use a separate adapter repository

Recommend `particular-labs/toolgraft` for extension, MCP, SDK, compiler, schemas,
website and controlled integration fixtures; recommend
`particular-labs/toolgraft-adapters` for community adapter sources, fixtures,
licenses, changelogs, review records and immutable registry releases. This is a
proposed split; no repository was created and the registry URL was not switched.

Agents contributing adapters should work only in an isolated checkout/container
of the adapter repo, with GitHub permissions scoped to that repo and no extension
release credentials. A second repo reduces accidental core edits; it is not an
OS security boundary for an unrestricted local agent. The installed script is
still trusted code on approved websites.

Use this contribution lifecycle:

1. User asks the agent to export a working local adapter and authorizes sharing.
   Review exported source for private content; add tests, license and changelog.
2. Agent opens a PR in the adapter repo using the user's existing GitHub access.
   Contributors never write directly to the published catalog.
3. CI uses a pinned ToolGraft compiler/test kit, validates package schemas,
   permissions and version changes, and runs isolated tests without secrets,
   publishing permissions or access to the user's browser. Never execute PR
   code with `pull_request_target` or in a privileged follow-up job.
4. Human owners review source and browser receipts. Protected merge plus a
   separately approved release promotes the exact reviewed commit/artifacts.
   A PR must not promote its own `reviewed` label.
5. Publish a new immutable version and verifiable release metadata. Clients
   discover it, show changes and require manual approval. Revocations can stop
   an unsafe version; they do not silently install replacement code.

CODEOWNERS requires actual users/teams with repository access and branch/ruleset
enforcement. Keep workflow/toolchain changes behind core-maintainer approval.
[GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
and [Actions security](https://docs.github.com/en/actions/reference/security/secure-use).

Pin a released schema/compiler/test-kit version in the adapter repo instead of
copying its implementation. Keep old catalog artifact URLs working during a
reviewed registry-origin migration. A static GitHub/Pages registry is enough;
ToolGraft needs no account database or upload API. Consumers need no GitHub key.
Submitting a PR uses GitHub authentication, supplied by their existing agent.
