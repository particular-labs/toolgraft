# ToolGraft

Add native WebMCP tools to websites through versioned adapters. Free, open source,
MIT-licensed, and built by **Particular Labs**.

**Local developer preview:** the extension and one ToolGraft MCP package let your
existing agent inspect a website, generate an adapter, request installation and
test or repair it. No ToolGraft account, internal AI or model key. Managed adapters
work without experimental WebMCP flags; native-only v0.1 examples retain their
experimental developer connection. Nothing is publicly hosted or published yet.
The homepage mailbox is a simulation. Version 0.6.0 adds main-document readiness, background task-tab cleanup, expected-error trials and a responsive extension library. Installed managed adapters can be edited without a repository or saved draft. See [editing](docs/editing-adapters.md)
the [extension guide](docs/extension-guide.md), and the [beta launch assessment](docs/beta-release-plan.md).

Start with **Your agents** in the extension or **Get started** on the website.
Copy the setup instructions into your agent, then open its private connection link
and approve that agent in the extension. The [website documentation](apps/web/docs.html)
and the extension's offline **Documentation** share guides for setup, everyday use,
adapter creation, privacy and troubleshooting. Manual configuration is in the docs.
Chrome's **Allow User Scripts** and Node 24+ are required. See
[setup](docs/agent-setup.md) and [agent instructions](docs/generated-agent-instructions.md).

## Run it

Use Node **24.21.0** and pnpm **10.14.0**:

```sh
fnm use --install-if-missing
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm adapters:build
pnpm build
pnpm dev:browser
```

The last command opens a separate development Chrome profile with the real
extension and WebMCP flags, and starts the playground if necessary. It leaves your
normal browser profile alone. In `chrome://extensions`, enable Developer mode,
open ToolGraft's Details, and enable **Allow User Scripts**. Open the extension's
adapter manager and select `adapters/playground/dist/adapter.tgz`; approve its
localhost access, then reload `http://localhost:4174/tasks`.

The playground exposes two read tools and three confirmed write tools. Closing,
denying, or allowing a prompt to expire prevents that write. Each approval applies
only to one call. A revoked or removed adapter refuses further SDK tool calls even
in an already-open page; reload removes its old tool listings.

Connect your agent to that development browser:

```sh
pnpm exec chrome-devtools-mcp --browserUrl=http://127.0.0.1:9227 \
  --categoryExperimentalWebmcp=true \
  --usageStatistics=false --performanceCrux=false
```

The extension and [website setup guide](apps/web/get-started.html) share the guided
connection flow. Manual MCP configuration and the optional native developer
connection are in **Documentation**. This checkout already includes project-scoped
files for all three clients. See [agent setup and evidence](docs/agent-setup.md).

This optional native developer connection uses `list_webmcp_tools` and
`execute_webmcp_tool`. Guided creation uses the bundled ToolGraft MCP instead.

Check the native developer connection with `pnpm doctor:agent`.

For the website: `pnpm dev:web` (normally `http://127.0.0.1:5173`).
For extension hot development: `pnpm dev:extension`.

## Verify and package

```sh
pnpm check
pnpm test:browser
pnpm test:live
pnpm toolgraft test --all
pnpm registry:verify
pnpm test:repro
pnpm release:pack
```

Browser tests load the production extension in an isolated Chrome profile. They
serve production website/playground builds on ports 5273 and 4274. Build first.
`test:live` adds real read-only HN, Wikipedia and ClasificadosOnline calls and needs internet access.
The ClasificadosOnline test opens a visible disposable Chrome window; the site
returned HTTP 403 in headless Chrome.
The two-minute consent-expiry test intentionally waits two minutes.

`dist/release/` contains the unpacked extension, installable Chrome zip, adapter
archives, static website/registry, playground, notices, and SHA-256 checksums.
See [project status](docs/project-status.md), [setup and compatibility](docs/browser-compatibility.md),
and [release procedure](docs/release.md).

## Author with your agent

Ask your connected agent to read `toolgraft_get_instructions`, then describe the
website and operation. It opens the page, inspects, scaffolds, patches, validates
and requests installation. You review source and approve browser access. It calls
the installed tool to verify results. Repairs require a version bump and new review.
The same flow can export a local package; contribution remains a separate action.

## Update or roll back

Manage adapters now shows version history and detected updates. Review and approve
an exact release, or explicitly restore a saved older version. Agents use
`toolgraft_versions` and `toolgraft_request_version` through the same connection.
See [version controls and storage migration](docs/adapter-versions.md).

## Author manually

```sh
pnpm toolgraft init my-site --url https://example.com --runtime script
pnpm toolgraft build my-site
pnpm toolgraft test my-site
```

Edit `adapters/my-site/src/index.ts`, build, then install the resulting `.tgz` in
the extension. CLI `test` proves deterministic packaging; browser acceptance is a
separate step. See [authoring](docs/authoring.md).

Launch examples: playground, Hacker News DOM, Hacker News API, and Wikipedia.
Reddit is an experimental read-only compatibility import; live acceptance is not
claimed for it. New registry entries default to **local**, never silently reviewed.

## Boundaries

No accounts, paid adapters, or hosted database. Website analytics are on by default on the public address; extension analytics require opt-in. See [analytics privacy](docs/privacy-analytics.md). Optional site grants,
version/hash pinning, local matching, manual updates, and cached revocations are
implemented. Script adapters are trusted code on approved sites; permission labels
and confirmation are **not a sandbox**. [Security model](docs/security.md).

Read [contributing](CONTRIBUTING.md), [license](LICENSE),
and [third-party notices](THIRD_PARTY_NOTICES.md).

## Local ClasificadosOnline test adapter

The [keyword search example](examples/clasificados-online/README.md) searches across
Puerto Rico categories with pagination and structured results. Build it with
`node scripts/clasificados-adapter.mts` after the MCP build, or use the archive
in `dist/release/`. It remains local/experimental. Its README documents scope and
repeatable browser tests. See the [registry security audit](docs/extension-registry-audit.md)
for current distribution limits.

For everyday use, ask your agent for the website task directly. Read-only changes
can be tried in a temporary browser tab before you choose **Keep update**. See
[Ask, try, and keep](docs/guided-trials.md) for approvals, testing and resuming a task.
