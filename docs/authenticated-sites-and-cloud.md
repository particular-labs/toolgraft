# Authenticated sites and cloud clients

Status checked September 23, 2026. These are compatibility findings and proposed
next steps, not receipts for implemented integrations.

## Gmail and Microsoft 365

There are no Gmail, Outlook, Teams, or other Microsoft 365 adapters in this
preview. The website's mail illustration is synthetic. Public-site tests and the
playground's simulated signed-out state do not prove authenticated-app support.

A script adapter could read or interact with an already signed-in page in the
dedicated ToolGraft browser, within its approved host and route. This is the
browser-session approach: the user signs in normally, including MFA. It does not
require a separate ToolGraft account or an API key for DOM operations. Whether a
particular operation works depends on the site's actual UI and browser behavior;
visible DOM may cover only the currently loaded portion of a mailbox.

Same-origin requests can use the site's session when the endpoint supports that
flow. This does not make browser cookies valid OAuth credentials for Gmail API or
Microsoft Graph. Cross-origin API calls have separate authentication and permission
requirements. The current import command removes upstream API auth configuration;
it is not an authenticated-site import wizard.

Official Gmail API access uses OAuth scopes and consent; Microsoft Graph uses an
access token and appropriate delegated/application permissions. A product can hide
manual key entry behind sign-in, but app registration and token lifecycle still
exist. Prefer established provider connectors for broad mailbox access when they
already cover the task. Use ToolGraft for narrow in-page workflows that need the
user's browser state.

The first proposed authenticated-site pilot is one explicitly chosen account and
one bounded read-only operation. It must prove account identity, signed-out/session
expiry behavior, empty results, route changes and actual returned data. Do not
harvest browser tokens or persist private messages as fixtures. Add writes only
after separate tests demonstrate the intended operation and ToolGraft confirmation.
No private account was inspected or used for this assessment.

## Browser-hosted agents

Installing ToolGraft beside an open chatgpt.com or claude.ai tab does not connect
that conversation to another tab's WebMCP tools. The model needs an MCP connection
that can reach the local browser. The existing project configs use local stdio.

| Client             | Documented connection path                                          | ToolGraft status                                         |
| ------------------ | ------------------------------------------------------------------- | -------------------------------------------------------- |
| Local coding agent | Local Chrome DevTools MCP over stdio                                | Claude Code read tests retained; Codex config recognized |
| ChatGPT website    | Secure MCP Tunnel can forward to a private stdio or HTTP MCP server | Not configured or tested                                 |
| Claude website     | Remote MCP endpoint reachable from Anthropic's cloud                | No remote endpoint or relay implemented                  |

OpenAI's Secure MCP Tunnel requires a tunnel ID, a runtime API key, appropriate
Platform permissions and ChatGPT developer-mode access. It can forward to a local
stdio server without public inbound access. Using it with ToolGraft's existing
server is a candidate integration, not a tested claim. The documented tunnel is
for private connections/developer testing, not public plugin distribution.

Claude's remote custom connectors originate in Anthropic's cloud. A proposed
ToolGraft integration would need an authenticated remote MCP endpoint and an
explicitly paired path back to the user's running browser. Expose a narrow MCP
interface, never the browser's raw debugging port. A self-hosted implementation
could avoid Particular Labs accounts, but still needs authentication, operation,
and a running browser. A hosted relay would add an operating cost.

The product can remain free and open source. “No ToolGraft account” is compatible
with local operation; “no credentials anywhere” is not a promise for private
cloud-to-browser access. Tool results sent to a cloud model are processed under
that provider's settings even when the browser remains local.

Recommended order: prove agent authoring/repair locally, prove one authenticated
read-only adapter, then test ChatGPT's existing tunnel before designing a custom
cross-provider relay. All publication remains on hold for local review.

## Official references

- [Gmail scopes and OAuth](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Microsoft Graph delegated access](https://learn.microsoft.com/en-us/graph/auth-v2-user)
- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Claude remote custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
