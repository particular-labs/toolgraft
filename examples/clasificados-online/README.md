# ClasificadosOnline keyword search

Local experimental managed adapter, version 0.1.0, for
[ClasificadosOnline Puerto Rico](https://www.clasificadosonline.com/).
It uses the site's all-category keyword search. No login, model key or ToolGraft
account is needed. It has one read-only tool: `search_classifieds`.

Ask your connected agent:

> Search ClasificadosOnline across all categories for Toyota. Give me the title,
> price, town and link, then show the next page if I ask.

The tool returns at most 30 results per page, plus available category facets.
`keyword` is required; `page` defaults to 1 (maximum 100); `category` defaults to
`PR` (all categories). Pass a category id from a previous result to narrow the
search. Missing prices are `null`, not zero. Featured results keep a flag.

Searches fetch only HTML on the approved site, then parse a detached document;
they do not navigate the tab for each query or inject search markup. The initial
background tab still loads the site's normal page. The browser must be running.
Unsuccessful queries can redirect to a generic unavailable page: the adapter
returns `no_matches_or_unavailable`, excluding its unrelated recommendations.
This is deliberately not a guaranteed zero-result count. Listing text is untrusted
seller content, and prices/availability are not independently verified.

## Local review and installation

Nothing is published or installed into your regular browser by these build steps.
The source function is `search.js`; metadata is `adapter.json`. The script reads
source as text and invokes the same compiler as the authoring MCP. It never imports
or executes the adapter on Node.

```sh
pnpm --filter @particular-labs/toolgraft-mcp build
node scripts/clasificados-adapter.mts
```

Review `dist/draft.json`, `dist/receipt.json` and `dist/adapter.tgz` in this example
folder. The release pack also includes `local.clasificados-online-0.1.0.tgz`.
When you choose to install, use ToolGraft → Manage adapters → Install a local
adapter, then review and approve the generated code and exact site access. Use
the newly built ToolGraft extension, which fixes matching routes with query strings.
Enable Chrome's Allow User Scripts and pair the agent as described in the shared
[setup guide](../../docs/agent-setup.md).

A manual archive install does not save an authoring launch URL. Supply the URL in
your agent's call (the agent can read it here); it opens the page in the background:

```json
{
  "adapterId": "local.clasificados-online",
  "tool": "search_classifieds",
  "url": "https://www.clasificadosonline.com/ss/dmclisting.asp?keyword=casa&SecID=PR&pueblo=%25",
  "input": { "keyword": "Toyota", "page": 1 }
}
```

Call `toolgraft_call` with that input. Generated installations through
`toolgraft_request_install` save the launch URL automatically. Subsequent manual
calls should continue to supply it.

## Scope and tests

The site chooses keyword coverage, ordering and category counts. This is its Puerto
Rico cross-category search, not a promise that every listing/category is indexed.
No posting, seller contact, favorites, scraping all pages, advanced price/location
filters or Florida-specific search is provided in this first version.

```sh
pnpm exec playwright test tests/browser/clasificados.spec.ts
TG_LIVE=1 pnpm exec playwright test tests/browser/clasificados.spec.ts
```

Tests use the real extension, local MCP process and Chrome User Scripts with native
WebMCP disabled. The test consents only in its disposable profile. Live testing uses
a visible Chrome window because the site returned HTTP 403 in headless Chrome.
Compilation alone does not prove current live-site behavior. Run the opt-in live
case when verifying compatibility with the current site.
