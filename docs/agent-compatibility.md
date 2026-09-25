# Agent compatibility and setup target

Official documentation checked September 23, 2026. Documentation support is not a
ToolGraft integration-test receipt. The ToolGraft MCP package is implemented and tested locally; it is not publicly
published.

The target is the extension plus one MCP package. Skills and model choice should
not change the adapter contract. A model provider is not an MCP client: OpenAI,
Anthropic or another model works through an agent host that exposes our tools and
supports its own authorized provider authentication. ToolGraft does not exchange
subscription credentials for API access or supply inference itself.

## Client evidence

| Client              | Documented capability                                             | ToolGraft verification                                             |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| Claude Code         | Project MCP configuration                                         | Creation/repair through ToolGraft MCP; native reads on three sites |
| Codex               | Project MCP configuration and tool filtering                      | Config recognized; no model-driven run retained                    |
| Hermes              | Local stdio/remote HTTP MCP, skills, and resource/prompt wrappers | Documentation checked only                                         |
| OpenClaw            | Managed outbound MCP and node-hosted MCP/skills                   | Documentation checked only                                         |
| Grok Bot            | Reusable skills                                                   | Documentation checked; exact Bot-to-local-MCP path unverified      |
| Grok web connectors | Custom MCP by publicly reachable URL                              | Documentation checked; no ToolGraft remote endpoint                |

Hermes documents `mcp_servers` in `~/.hermes/config.yaml`; a command/args entry
starts a local server. OpenClaw documents `mcp.servers` for managed outbound
servers. Its `openclaw mcp serve` command instead exposes OpenClaw itself as a
server and is not how to add ToolGraft. Client/runtime tool policies still apply.

OpenClaw also documents MCP servers on an existing paired node. That can place
ToolGraft on the browser's machine while the agent gateway runs elsewhere; no
ToolGraft-specific extra helper installer should be needed in that arrangement.
A new node is an additional prerequisite if the user does not already have one.
Grok Bot skills do not establish that it can launch local stdio in the user's
browser environment. Do not infer that from Grok's web connector support.

## Connection location

- Same host: the agent launches the MCP package; its loopback bridge pairs with
  the extension. This is the implemented local flow, with Node 24+ as a runtime prerequisite.
- Existing remote-agent node on the browser host: run the MCP there and reuse
  that agent's authenticated routing, after an actual integration test.
- VPS/container or cloud-only agent: its localhost is a different environment.
  A remote MCP endpoint, supported provider tunnel or paired relay is necessary.
  A skill cannot remove this networking requirement. Remote access is a separate
  transport milestone, with explicit browser pairing and authentication.

Even the local flow needs one-time browser pairing, User Scripts enablement when
required, and per-site permission/installation consent. These are setup actions,
not additional software installations. Browser API/version compatibility remains
an acceptance gate; managed tests disable native WebMCP flags; native-only examples retain the experimental browser path.

## Official sources

- [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/developer-guide/creating-skills)
- [OpenClaw MCP configuration](https://docs.openclaw.ai/gateway/config-extensions)
- [OpenClaw node MCP and skills](https://docs.openclaw.ai/nodes/mcp-and-skills)
- [Grok Bot skills](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- [Grok custom connectors](https://docs.x.ai/grok/connectors)
