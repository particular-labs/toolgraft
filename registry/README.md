# Static registry

Generate with `pnpm registry:build` after committing adapter source. Verify exact
bytes with `pnpm registry:verify`. Existing `packages/<id>/<version>/adapter.tgz`
files cannot be overwritten; bump the adapter version to change them.

index.v1.json records source commit, manifest hash, sites, runtime and review state.
known-domains.v1.json is generated locally; revocations.v1.json is maintained by
reviewers, uses increasing updatedAt timestamps, and may revoke one version or `*`.
The initial empty safety list is a local candidate baseline, not evidence of a
running registry. Generation defaults entries to local (Reddit experimental).

Deployment copies these files under the website's registry/ path. A package may
be publicly installed from the extension only after review is marked reviewed.
