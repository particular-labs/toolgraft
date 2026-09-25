# Authoring adapters

## Using your existing agent

The local ToolGraft MCP supplies inspection, scaffolding, patching, validation,
installation requests and live calls. Your external agent supplies all reasoning
and code generation. No repository or built-in file/shell tools are needed for
this flow. Read the [generated instructions](generated-agent-instructions.md) and
[connection guide](agent-setup.md).

Ask: “Create a ToolGraft adapter for <URL> so I can <operation>. Inspect the actual
page, use stable selectors, request local installation and verify returned data.”
The agent asks for missing intent, opens the page and creates a versioned draft.
The extension shows exact source, permissions and tools before you approve it.
A build verifies syntax and package integrity; only calling the installed tool
establishes live behavior. Writes have a separate per-call browser confirmation.

For repair, reproduce the original failure first, inspect again, patch and bump
the version. After an agent restart, begin a fresh authoring session and pass its
sessionId to `toolgraft_patch`. Validate and request a new installation review,
then repeat the original call. `toolgraft_export` saves source and an archive
locally; it does not contribute or publish them.

The opt-in Claude Code test created a read adapter using only these MCP tools,
then repaired a deliberate selector break and returned the actual fixture data.
The browser test separately proves denied installation and denied/approved writes.
These are synthetic fixtures, not general proof for every website. Login, complex
SPA navigation and authenticated applications need their own acceptance tests.
See [authenticated sites and cloud clients](authenticated-sites-and-cloud.md).

## CLI and package workflow

`pnpm toolgraft init my-site --url https://example.com --runtime script` creates a
minimal readable page-title adapter. Edit adapter.json and src/index.ts, then run
`pnpm toolgraft build my-site` and install adapters/my-site/dist/adapter.tgz.

`validate`, `build`, and `pack` all validate and emit the complete package.
`test` additionally rebuilds twice and verifies archive/hash roundtrip determinism.
`dev` builds once and prints the local install instructions; it does not hot-load
remote code. `--all` selects all repository adapters. The CLI is workspace-local;
no unclaimed npm publication is required.

Declare narrow exact hosts, route patterns, primitive input properties, concise
descriptions, and honest readOnlyHint/destructiveHint annotations. The SDK validates
inputs, bounds text output, checks active installation per call, and brokers every
write. Throw ToolGraftError with an actionable hint for page/session failures.
Adapter scripts cannot safely enforce their own trustworthiness; human review is
still required. Never put credentials or private fixtures in an adapter.

For API compatibility, create an API adapter.json with the correct grants/license,
then run `pnpm toolgraft import existing-api-slug path/to/upstream.json`. Import
selects read-only tools and their endpoints and removes unused authentication.
The fixed engine executes the selected original descriptors. ToolGraft normalizes
upstream text-only failures into isError results and moves write approval to its
own broker. HN's cross-origin endpoint is explicitly declared; redirects are denied.
The experimental Reddit import does not include posting, voting or commenting.

Bump the version whenever published package bytes change. Commit source, run
`pnpm registry:build`, and review the generated index/artifacts. Generation records
the source commit and preserves previous immutable versions. `registry:verify`
rebuilds and compares exact bytes. CI additionally rejects modification/deletion
of existing registry package paths compared with the PR base.

Before a public review label: inspect source, licenses, tools, permission/runtime
changes, static fixtures, and actual native browser receipt. Record the review in
a repository PR. Do not turn local builds into reviewed releases automatically.
