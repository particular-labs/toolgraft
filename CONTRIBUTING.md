# Contributing

ToolGraft is a free Particular Labs project. Contributions use MIT; preserve the
separate licenses and copyright notices of upstream components and fonts.

Read README, AGENTS.md, and docs/project-status.md. Use
Node 24.21.0 and pinned pnpm. Describe concrete behavior and validation in each PR.
Use Conventional Commits: `feat: add a capability`, `fix(extension): repair a
panel`, or `docs: clarify setup`. Allowed types are `feat`, `fix`, `docs`, `style`,
`refactor`, `perf`, `test`, `build`, `ci`, `chore`, and `revert`; scopes are optional.
Keep subjects at most 100 characters. Use `!` for breaking changes. Run
`pnpm commits:check` to check the current branch's history. CI checks incoming
commits and excludes Git-generated merge commits. Local tool checkpoints and
archival source tags are outside this development-history check.

Run `pnpm check`, `pnpm test:browser`, and `pnpm registry:verify`. Live public
canaries are read-only and separate from deterministic fixtures.

Adapter PRs must show target sites, tool schemas, read/write behavior, site grants,
runtime, upstream license/source, permission changes, and browser receipts. Script
packages require human source review. Never claim an automated build is that review.
New index entries remain local; promoting to reviewed requires the review record.
Published package bytes are immutable. Change the version before changing any
published source, manifest, runtime or notices; regenerate the registry afterward.

Do not add telemetry, hidden writes, obfuscation, executable network loads outside
User Scripts, credentials, signed-in browser profiles, or private user data.
See docs/authoring.md and docs/release.md for the authoring and publication flows.

Commit maintained source, regression tests and contributor documentation. Keep
research, one-off experiments, session transcripts and run receipts local under
`.local/`, `.cache/`, `scripts/local/` or `tests/local/`. Release packaging includes
only tracked documentation and example source. Tool metadata and browser profiles
are ignored; do not force-add them.
