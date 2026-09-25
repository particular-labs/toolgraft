# Multiple local agents (0.3.0)

Codex and Claude previously tried to bind the same local port. The second MCP
failed before it could expose tools. The extension also kept only one socket, so
changing the port alone would have replaced the first browser connection.

## Delivered behavior

Each agent still configures one `toolgraft-mcp` command. On its first connection
operation, the package discovers or starts the bundled background bridge. Concurrent
starters elect one host through an exclusive local lock. Its private descriptor
contains a random RPC credential, protocol, PID and selected loopback port; on
Unix these files use mode 0600 in a mode-0700 directory. A busy preferred port is
handled by binding an OS-assigned free port, never by stopping the current owner.
No account, model API call, external relay, separate installation or manually
entered API key is involved.

The host serves several separately approved agent channels on one listener. An
agent identity derives from its reported MCP client name plus working directory.
Sessions for that identity reuse its approval. Client names are display labels,
not verified publisher identities. An MCP restart creates a new session, while its
browser approval and saved drafts remain scoped to the same identity.

Every browser request carries a host-assigned session owner. Authoring sessions
and installation-review IDs cannot be used by another session. Installed adapters
and browser host grants remain shared across approved agents. Local processes
running as the same OS user are not isolated from one another by this mechanism:
they already have access to that user's files. The per-session checks prevent
misrouting and cross-session use through ToolGraft's supported interface.

**Connect your agent → Connected agents** lists approvals individually. Disconnect
removes that approval, revokes its saved server credential, expires pending reviews
and denies pending managed write confirmations. Closing an MCP session also expires
its authoring sessions/reviews and cancels pending write approvals without affecting
another session. Already executed operations cannot be undone; disconnected or timed
out calls remain uncertain and are never automatically replayed. A write blocks
another managed operation on the same tab until it finishes; independent read calls
can run concurrently subject to the adapter runtime's existing limits.

The host survives the exit of the MCP that started it. It expires abandoned leases
and exits after all clients stop and the idle grace period elapses. On restart it
tries to reuse its recorded port and reloads per-agent credentials. The extension
reconnects approved channels independently. If that old address is now occupied,
a new connection invitation may be needed for the new address. Damaged files or
an incompatible local protocol fail closed. The daemon does not take ownership
of or kill a process solely because it occupies an address.

## Ownership

| Responsibility                                                              | Owner                               |
| --------------------------------------------------------------------------- | ----------------------------------- |
| Invitation parsing, protocol versions, core guide and copyable setup prompt | `packages/agent-core`               |
| Starting/discovering the host and authenticated session RPC                 | `packages/mcp/src/shared-bridge.ts` |
| Host lifecycle, client registration, routing and leases                     | `packages/mcp/src/bridge-host.ts`   |
| Per-agent invitations, pairing credentials and browser calls                | `packages/mcp/src/bridge.ts`        |
| Browser connection persistence, session ownership and operation dispatch    | `apps/extension/lib/agent.ts`       |
| Pending write consent and cancellation                                      | `apps/extension/lib/broker.ts`      |
| Connected-agent list and review presentation                                | `apps/extension/ui/agent.ts`        |

The host executable, connection landing page, styles and runtime are packed in the
same MCP archive. Website and extension setup prompts derive from the core package;
there is no second set of setup instructions to maintain.

## Upgrade and scope

Update the extension and each agent's MCP archive to 0.3.0, then reload the extension
and reconnect/restart each MCP. Existing 0.2.2 processes keep running until their
agent restarts; editing configuration does not replace an already running process.
New processes can coexist with an old preview holding port 17834. The old single
connection is migrated to a named legacy entry rather than silently discarded.
Approve a new invitation from each updated agent; remove the legacy entry when done.

Existing adapters and their version history are unchanged. Historical draft files
remain untouched in the old data directory; they are not silently assigned to a
new agent identity. Existing exported archives can still be submitted for review.
New drafts live under an identity-specific directory. An explicit `--data-dir`
creates a separate bridge/storage namespace for tests or deliberate isolation;
normal users do not need this option. `--port` is now a preferred address, with
automatic fallback when occupied.

This remains local-only. Browser-only agents and remote hosts need a transport that
is outside this preview. An agent controlling a different browser profile must
hand the download and connection link to the user for the browser with ToolGraft.
A fresh agent/project identity still needs the user's approval.

## Evidence

`tests/browser/multi-agent.spec.ts` drives two independent stdio MCP processes and
a real extension. It covers concurrent startup with an occupied preferred port,
one shared listener, independent approval, unauthorized local RPC, cross-session
review and authoring denial, real tool reads, approved/denied writes, overlapping
write refusal, MCP restart, per-agent disconnect, pending-write cancellation and
shared-host crash/recovery. It checks the connected-agent view at 320, 390, 768
and 1100 CSS pixels. These are protocol clients named for the scenarios, not claims
of fresh Codex and Claude model turns.

`tests/browser/connection.spec.ts` exercises the primary invitation flow and actual
installation review. `scripts/test-mcp-package.mts` starts two archive-installed
processes outside the repository, with a fresh npm cache, and verifies they share
one bridge. Current validation commands and limitations are recorded in `docs/project-status.md`.
