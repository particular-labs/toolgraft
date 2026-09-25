# Edit an installed adapter

Version 0.4.0 introduced `toolgraft_edit_adapter`. Ask your existing agent:

> Use ToolGraft to edit my installed ClasificadosOnline adapter. Preserve its
> keyword search and add the listing details I need. Use ToolGraft inspection and
> calls; request my approval before installing the new version.

The agent discovers the adapter ID, then calls:

```json
{
  "adapterId": "local.clasificados-online",
  "intent": "Add structured listing details while preserving keyword search"
}
```

No repository, original agent draft, internal AI or new account is needed. A
missing launch route requires an actual matching `url`, discoverable through
`toolgraft_find_tools`. The browser must be connected. The return value contains
`draftId`, `revision`, `sessionId`, the entire editable tool set, the installed
base version/hash, a proposed next patch version and authoring readiness state.
If site approval is needed, the user approves it before inspection proceeds.

The agent inspects that session and uses `toolgraft_update_tools` to add, update
or explicitly remove only the intended tools. Omitted source stays unchanged.
After compilation, read-only candidates use an approved browser trial. Review
the examples and choose Keep update before the installed version changes. Then
verify both changed and preserved tools through `toolgraft_call`. See
[Ask, try, and keep](guided-trials.md). Write adapters retain installation and
per-call approvals.

The legacy `toolgraft_patch` replaces the entire tool set. When editing an installed adapter,
dropping an existing tool also requires its exact name in `removeTools`. This
prevents accidental omissions; it is not a substitute for reviewing the update.
If the browser's installed version changes during editing or approval, the stale
edit cannot overwrite it. Start a new edit and reapply the intended change.

## What can be edited

The first implementation supports managed script bundles emitted by ToolGraft's
compatible compiler/runtime, including the existing ClasificadosOnline 0.1.0
archive. It statically reads function expressions, reconstructs a draft, and
requires recompilation to reproduce the installed payload and manifest exactly.
It never imports, evaluates or executes the installed script on the Node host.
License and NOTICE are retained when validating/exporting edits.

API packages, native-only examples, foreign wrappers and incompatible compiler or
runtime bundles return `EDIT_SOURCE_UNAVAILABLE`. Nothing is silently omitted or
converted. Supply original source or explicitly recreate the complete adapter
through authoring. This is a constrained, verified recovery format, not a general
JavaScript decompiler. A future runtime change needs a deliberate migration or
versioned source envelope before claiming edit compatibility with older bundles.

Recovered source is untrusted code. Exact reproduction proves that the draft
preserves installed code; it does not prove that the code is safe or that a website
still behaves correctly. Page data and source can contain hostile instructions.
The chosen agent receives that source under its own provider's data settings.

## Ownership and compatibility

The extension's verified package store owns installed source and version identity.
The MCP's `edit.ts` owns recovery, using the same `compileDraft` used by new drafts.
Existing agent-scoped draft storage owns edits. The existing activation plan owns
version conflict checks and browser approval. Shared `agent-core` instructions
describe this flow in the MCP, website, extension and optional skill.

There is no archive or storage-schema migration. Existing immutable archives stay
unchanged. Use the matching 0.5.0 extension and MCP, reload the extension and
restart the agent's MCP connection. An already-running older process does not
gain the new tool automatically. The agent is the editor; the extension supplies the trial results and
review/approval surface.
