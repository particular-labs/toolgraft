# Agent setup

One connection contract shared by the extension, website, project configuration
files and external MCP checks. It pins the upstream server version and flags,
loopback browser address, client formats, and the read-only first-use prompt.

The shared UI renders native client selection, copy/download actions, connection
instructions and troubleshooting. It does not claim to detect an agent connection
from inside a web page. Run `pnpm doctor:agent` for
actual evidence. See docs/agent-setup.md.
