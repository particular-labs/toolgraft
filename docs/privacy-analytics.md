# Privacy-focused analytics

The owner approved website analytics by default and extension analytics only with
opt-in on September 23, 2026. This supersedes the original handoff's no-analytics
scope; the handoff itself remains preserved. There is no ToolGraft account service,
AI service, or database added by this feature.

## Configuration and collection

Keel KB 155 supplies the Particular Labs Umami runbook. These public collection
identifiers are not credentials:

| Surface           | Website ID                             |
| ----------------- | -------------------------------------- |
| Website           | `206046fd-69ef-49ae-a6c4-ac7e848ce2ad` |
| Extension, opt-in | `6fa17098-b680-4508-ac31-ae9d24bb4a4c` |

Endpoint: `https://umami.particularlabs.cloud/api/send`. No admin password, API
key, or read token is shipped. Website collection is limited to the exact
`https://particular-labs.github.io/toolgraft/` deployment and known static routes.
Local previews and other origins do not collect. Change the shared configuration
when the production domain changes; do not broaden this to arbitrary hosts.

`packages/analytics` owns the event and page allowlists, public IDs, privacy
signals and serializer. Only fixed surface/page names, event names and release
version are submitted. Unknown names are rejected. The site can measure page
views, setup-copy success/failure, manual setup use and downloads. Opted-in
extension panels can measure opens, generic errors, setup actions, connection,
review, installation/removal, registry refresh, rollback, access and write
approval actions. No events originate from site adapters, the MCP, the local
connection page or tool execution.

Excluded: real URLs, query strings, fragments, referrers, page titles/content,
search terms, adapter identities/code, tool names/inputs/results, error messages,
user identities, precise timestamps supplied by the client, viewport dimensions,
language, cookies, replay, heatmaps, UTM attribution and advertising IDs. There is
no remote tracker script, `identify` call, persistent analytics client identifier,
offline queue or retry. Requests omit credentials and referrers, reject redirects,
time out after four seconds and never block product work.

## Consent

The public website has an opt-out on its Privacy page, stored in this browser.
Do Not Track and Global Privacy Control block collection even with no opt-out.
Storage unavailable means collection disabled. Opting out cancels pending requests;
an already delivered event cannot be recalled. A reload preserves the preference.

Extension consent starts false and is stored only in `chrome.storage.local`.
Manage adapters describes the data and destination before opt-in. Chrome also
requires the optional Umami host grant. Consent and that grant are both checked
before every send. DNT, GPC and incognito context suppress panel events. Turning
analytics off cancels pending sends and persists across panel reloads. A previously
approved host grant can remain; that grant alone never enables collection.

## What cookieless does not guarantee

Umami's public collection API requires no authentication and needs a normal
User-Agent. Public collection IDs cannot prove that an event came from ToolGraft;
analytics are directional product signals, never authorization, billing or audit
records. [Sending stats](https://docs.umami.is/docs/api/sending-stats).

The server and its proxy still receive IP addresses and HTTP headers. Umami can
derive browser/OS and approximate location and correlate visits using rotating
server-side hashes; its documentation says it does not store the IP itself.
Our payload exclusions do not remove server-derived metadata.
[Metric definitions](https://docs.umami.is/docs/metric-definitions).

Self-hosted data is retained indefinitely unless the operator deletes it.
[Umami FAQ](https://docs.umami.is/docs/faq). Retention, reverse-proxy access logs,
GeoIP configuration and upstream telemetry on this shared server are **unverified**.
Before a public launch, audit those settings, choose a short retention policy
(recommended 30 days), minimize IP-bearing access logs and check `PRIVATE_MODE`
and `DISABLE_TELEMETRY`. Do not change shared infrastructure or delete other
projects' data as part of a ToolGraft code release.
[Environment variables](https://docs.umami.is/docs/environment-variables).

## Validation

The independent synthetic validation website
`46d2b42d-c2ad-4d42-8df6-5536bc52a183` received explicit
`toolgraft_preview_validation` and `toolgraft_browser_validation` events with synthetic fields. Both HTTP collection and a real Chromium cross-origin fetch returned
200; the authenticated read-only metrics API returned each event with count 1.
No production collection ID was used for this smoke test; no public share link was
created. The local receipt is `.cache/analytics/live-receipt.json`.

Automated browser tests intercept built website requests and the extension's
transport to verify payload exclusions, default-off extension behavior, persistent
opt-out, privacy signals and panel recovery. These transport tests do not pretend
to prove shared-server retention or a real user's consent. The live synthetic
receipt separately verifies the actual Umami endpoint and readback.
