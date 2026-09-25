# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers using coding agents and people installing reviewed site adapters.

## Product Purpose

Add named WebMCP tools to existing websites using a Chrome extension, one bundled
MCP package in the user's existing agent, and reviewed, pinned adapters. Normal
setup needs no separate helper installer, CLI, repo checkout or mandatory skill.
The MCP package bundles the local bridge and build dependencies. This record
follows the current product scope in `docs/project-status.md`.

## Capabilities and Constraints

Free MIT-licensed Particular Labs offering. API packages are interpreted data;
script packages are trusted code with approved site access. Manual installs and
updates, no account service, and no database. The original v0.1 excluded analytics;
the owner authorized website-default minimal analytics and extension-only opt-in
for v0.5.0. Multiple local agents share a bundled bridge with independent browser approvals and disconnect controls. Installed managed adapters can become editable drafts through MCP with tool preservation and version-conflict checks. Shared setup instructions guide the existing external agent; a private
connection link plus explicit extension approval replaces typed codes in the main
flow. ToolGraft provides no internal AI, model API calls, model credentials or token
billing; the existing external agent supplies reasoning and code generation.
Connectivity is local to the browser's computer, with no hosted relay for remote
or cloud-only agents. The project remains a local developer preview; public
publication, broad external-agent compatibility and nontechnical-user acceptance
are not established by a completed UI or passing compilation.
Browser verification is required; compilation is not release acceptance.

## Brand Commitments

ToolGraft and Particular Labs. Preserve the supplied homepage's visual direction.

## Product surfaces

`apps/web` contains the marketing site; `apps/playground` is the deterministic
test site. The homepage mail example is a simulation. Actual extension behavior
is covered by `tests/browser`.

The extension toolbar is a compact control center with **This page**, **Adapters**
and **Agents** tabs. The full library provides **Installed**, **Catalog** and
**Settings**, searchable adapter cards, state filters, and disclosures for tools,
permissions and version history. **Open full view** opens that library in a browser
tab. Connection setup provides shared instructions, individually named agent
connections and explicit disconnect controls. Approval and trial reviews remain
separate decisions with the requesting agent, site and proposed action visible.

Human documentation is available on the website and bundled as offline extension
help, using shared topic content and rendering. It covers setup, use, authoring,
adapter management, permissions and recovery. Your agents shows setup only until
an agent is approved; Add agent reveals it again. Pairing codes remain under
Trouble connecting?, while manual and native developer setup live in the docs.
