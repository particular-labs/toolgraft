---
name: ToolGraft
description: Charcoal, lime, and paper for visible browser tools.
colors:
  ink: "#0c0d0d"
  paper: "#f1f3ed"
  paper-secondary: "#d9ddd4"
  green: "#b8ff5a"
  green-hover: "#c8ff82"
  marketing-muted: "#9ca39b"
  marketing-line: "rgba(241, 243, 237, .15)"
  operational-surface: "#171a17"
  operational-muted: "#b7beb4"
  operational-line: "#353c33"
  error: "#ffb6a8"
  warning: "#ffd08c"
  write: "#ffb65a"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "clamp(3.6rem, 8vw, 7.7rem)"
    fontWeight: 700
    lineHeight: 0.88
    letterSpacing: "-.072em"
  headline:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "clamp(2.2rem, 5vw, 4.7rem)"
    lineHeight: 1.02
    letterSpacing: "-.06em"
  operational-title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "30px"
    lineHeight: 1.2
    letterSpacing: "-.03em"
  popup-title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "24px"
    lineHeight: 1.2
    letterSpacing: "-.03em"
  marketing-body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.55
  operational-body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: "DM Mono, monospace"
    fontSize: ".68rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: ".07em"
rounded:
  control: "6px"
  tool: "7px"
  monogram: "8px"
  adapter-card: "12px"
  dialog: "12px"
  demo: "13px"
spacing:
  action-gap: "12px"
  control-inline: "16px"
  section-padding: "28px"
  card-padding: "20px"
  card-gap: "20px"
  popup-padding: "22px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.operational-body}"
  button-secondary:
    backgroundColor: "{colors.operational-surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "{colors.operational-surface}"
    textColor: "{colors.error}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.operational-surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  tool:
    backgroundColor: "#181b19"
    textColor: "{colors.paper}"
    rounded: "{rounded.tool}"
    padding: "15px"
  adapter-card:
    backgroundColor: "{colors.operational-surface}"
    textColor: "{colors.paper}"
    rounded: "{rounded.adapter-card}"
    padding: "{spacing.card-padding}"
  panel-tab-selected:
    backgroundColor: "{colors.operational-surface}"
    textColor: "{colors.paper}"
    rounded: "6px 6px 0 0"
    padding: "10px 8px"
---

# Design System: ToolGraft

## Overview

**Creative North Star: "Charcoal, lime, and paper"**

The supplied homepage establishes the visual world: dark charcoal surfaces,
warm pale text, a bright lime accent, large tightly spaced Manrope headings,
and compact monospaced tool labels. Its distinctive illustration is an
interactive paper-colored mailbox joined to a dark tools panel by a lime seam.
This is the existing reference, not a newly generated identity.

Operational screens carry the same palette and heading family with quieter
layouts, readable Manrope body text, and explicit actions. The marketing simulation
and deterministic task playground remain separate surfaces. This document records
the implemented system in `apps/web/index.html`, `apps/web/docs.css`,
`apps/extension/ui/style.css`, and `apps/playground/style.css`.

`packages/brand/assets` is the public asset source for both WXT and Vite: Manrope,
DM Mono, font licenses, brand.css tokens, the existing grain texture, SVG favicon
and extension icon sizes. `pnpm brand:icons` regenerates PNGs from icon.svg. The
website and extension use the same mark, charcoal/lime palette and subtle lime
surface gradient. Operational components consume those tokens rather than copying
font files. `packages/agent-setup` shares the connection interface and configuration;
`packages/agent-core` shares instructions. Keep these sources authoritative.

**Key Characteristics:**

- Charcoal backgrounds, pale text, and lime actions.
- Large marketing typography; compact operational hierarchy.
- Fine borders and modest corners around controls.
- Compact tabbed controls and flat adapter cards with native disclosures.
- Paper mailbox and illuminated seam in the marketing simulation.

## Colors

Lime supplies the strongest action color against charcoal; paper tones keep text
and the simulated mailbox warm rather than stark white.

### Primary

- **Lime** (`green`): primary actions, keyboard focus, selection, read indicators,
  and the marketing seam. `green-hover` is the homepage primary-button hover.

### Secondary

- **Write orange** (`write`): the simulated write-tool risk label.
- **Warning amber** (`warning`): extension warnings.
- **Error salmon** (`error`): extension errors and destructive-action text.

### Neutral

- **Charcoal** (`ink`): the shared page background.
- **Paper** (`paper`, `paper-secondary`): primary text and homepage supporting copy.
- **Marketing muted / line**: subdued homepage metadata and translucent dividers.
- **Operational surface / muted / line**: extension fields, supporting text,
  and opaque borders. Operational supporting text is intentionally lighter than
  the homepage's quietest decorative labels.

Operational surfaces consume the shared brand tokens. Marketing retains its
separate muted-text and translucent-divider roles within that same palette.

## Typography

**Display Font:** Manrope, with system-ui and sans-serif fallbacks.
**Body Font:** Manrope across the homepage, extension, documentation, and
playground, with system-ui and sans-serif fallbacks.
**Label/Mono Font:** DM Mono for tool names, labels, version numbers, hashes,
and code previews, with ui-monospace and monospace fallbacks.

Manrope's tight display spacing gives the homepage its scale and shape.
Monospaced labels make named tools distinct from explanatory copy. Version
numbers use tabular numerals. Self-hosted fonts and their licenses live in
`packages/brand/assets`; use the shared brand stylesheets and existing
`font-display: swap` loading behavior.

The frontmatter captures the homepage display and section hierarchy and the
extension title/body hierarchy. Homepage tool names use a slightly larger mono
size than section labels. Documentation body text is (16px/1.65); playground body
text is (16px/1.6). Extension paragraphs stop at (70ch), playground paragraphs at
(65ch). Do not apply the oversized marketing display scale to permission screens.

## Layout

The homepage uses a centered container capped at (1180px), with (40px) total
horizontal inset on larger screens. The hero foot is a two-column grid. The demo
places a mailbox, narrow seam, and tools panel side by side. At (840px), the
major grids stack and the seam becomes horizontal; non-CTA navigation links hide.
At (560px), the page inset becomes (26px), actions span the available width,
mailbox folders hide, and panels use (19px) padding.

The extension keeps a (320px) minimum body width. Its native toolbar popup is
normally (560px) wide with (22px) padding, adapting to the host window and capped
at (600px) high. The header and tabs stay above one scrolling active panel; the
outer popup does not add a second scrollbar. Short panels shrink to their content.
The **Open full view** link leads to the library in a browser tab.

The full library and extension help page are capped at (1200px). Your agents uses
a single reading column capped at (860px). Other
extension pages retain the (900px) default, while agent reviews cap at (800px).
Main padding is (32px 28px 64px), becoming (24px 20px) at (520px). Library cards
use an automatic column grid with a (320px) target minimum, shrinking to the
available width on narrower screens, and (20px) gaps. Search and state filters
wrap; the state filter takes a full row at (520px). Connection setup follows one
vertical sequence, with technical recovery kept under Trouble connecting?.

The playground caps content at (960px). Documentation uses a (1200px) shell,
a (230px) topic navigation column and a (64px) gap. Below (800px), a Browse
documentation button exposes the topics above the article. The reading measure
stays at most (74ch). Website setup and other reference pages use (980px).
Extension and playground layouts wrap at (520px). Actions use flex layouts that
wrap; operational code, headings, agent names and long hashes wrap rather than
extending the viewport. Status strips span their container, including their top
and bottom borders; they do not inherit the paragraph reading-width cap.
Version-history rows follow the same single-column flow with (20px) vertical
padding and a top border. Their action labels wrap within the available width.
At the operational breakpoint, version/state headings wrap and review actions
share available width.

## Elevation & Depth

The homepage combines tonal panels, fine borders, a subtle grain overlay, and
localized glow. The demo frame casts a deep shadow
(`0 32px 100px rgba(0,0,0,.35)`); the architecture cards use
(`0 18px 40px rgba(0,0,0,.25)`). The lime seam has its own glow. Operational screens
are mostly flat: dividers and dark surface fills establish grouping. The install
dialog uses a dark translucent backdrop rather than a decorative shadow.

Homepage tool hover shifts slightly left with a short transition. The extension
dialog enters with a (0.16s) vertical movement only when reduced motion is not
requested. Homepage reduced-motion styles disable animation and transitions.
Shared style values live in `packages/brand/assets/brand.css`; operational
layout and breakpoints live in `apps/extension/ui/style.css`.

## Shapes

Controls have modest corners, while larger dialog and demo containers are more
rounded. Tool tiles use the intermediate radius from the frontmatter. One-pixel
borders and horizontal separators carry most structure. Circular shapes belong
to browser dots, status lights, and the simulated avatar; the draft badge is a
small pill. The brand mark uses the existing block-like graft silhouette.

## Components

### Buttons

Primary operational buttons use lime with charcoal text and bold labels;
secondary buttons use the dark operational surface with a border. Destructive
buttons retain that surface and use error-colored text. Operational controls
have a (44px) minimum height. Homepage CTAs use (48px), transparent secondary
surfaces, and (18px) horizontal padding. Hover strengthens the border; homepage
primary hover lightens the fill. Disabled buttons fade, with cursor behavior
defined by the particular surface.

Keyboard focus uses a lime outline (2px) with an offset (4px) across the apps.

### Inputs / Fields

Operational inputs share control borders, corners, and minimum height with
buttons. Visible labels precede fields. File inputs fill their container. The
playground task input flexes beside its submit action and moves to a full row on
narrow screens. The homepage mail-search simulation is a visual demonstration,
not the operational input component.

### Navigation

The homepage uses a horizontal brand and compact text links, with an outlined
source link. Secondary pages keep a simpler brand/link header. Links retain
visible keyboard focus, and documentation links use lime. Compact layouts use
wrapping or the homepage's existing selective link hiding.

Extension tabs use equal-width, muted buttons over a bottom border. The selected
tab has a dark surface, paper text and an inset lime underline (2px), with gently
rounded top corners. The popup tabs are **This page**, **Adapters**, and **Agents**;
the library tabs are **Installed**, **Catalog**, and **Settings**. Arrow keys move
between tabs, Home/End select the first/last tab, and only the selected tab enters
the Tab sequence. Selection is retained for the current session per view.

### Cards / Containers

The homepage demo, tool tiles, message cards, and layered architecture cards are
its main framed elements. The installed library uses flat dark adapter cards with
fine borders and modest corners. Each has a lime initial in an outlined monogram,
title, state, description, version and site access. Tool lists, permissions and
identity live in a native disclosure; version history has its own disclosure.
Update availability stays visible alongside its review action. Cards align at the
top and keep their natural height when disclosures open; they have no decorative
shadow. Popup adapters remain compact divider-separated rows. Code previews use
dark filled blocks with wrapping and scrollable overflow where needed.

### Chips

The simulated draft badge is a small green-tinted pill with DM Mono text. Tool
read/write indicators are compact colored text; they are not interactive filters.

### Permission and approval surfaces

Install review puts host access, runtime, tools, source, version, and hash before
the explicit installation action. Install, update, and rollback dialogs initially
focus their heading so review begins at the top. Updates and rollbacks share the
change-review section described below. Per-call approval displays the adapter,
origin, tool name, and input preview with Deny and Approve once actions; Deny
receives initial focus. Expiration disables approval and shows the denied status.
Keep this operational hierarchy explicit and readable.

### Adapter version history and availability

Each adapter has a native disclosure titled **Version history**, including its
version count. The ordered list uses divider-separated rows rather than new
cards. Each row pairs a monospaced version with its state: **Installed**, **Saved
locally**, **Catalog**, or **Archive not saved**. Review status and approval or
publication date sit beneath in muted text. A nested **Source and identity**
disclosure reveals the source commit and full manifest hash.

Blocked versions retain their visible reason in warning amber and a disabled
review action with a not-allowed cursor. The installed version has no redundant
activation action. Available newer versions receive the existing lime status
strip and a primary **Review update** action. Older selectable versions use
**Review rollback to [version]**; other choices use **Review version**.

The registry area pairs **Check registry and updates** with the last successful
check and the stated automatic six-hour catalog refresh. Copy explicitly keeps
detection separate from installation: versions remain pinned until approval.
An unsuccessful check shows an error-colored status explaining that cached
versions are shown and naming the retry action. Local history remains available
offline; a retention note explains saved archives and missing archive metadata.

### Shared update and rollback review

The options dialog and agent-request review use the same change section from
`apps/extension/ui/version-review.ts`: **Update changes** or **Rollback changes**,
a from/to version line, and a wrapping monospaced change preview on the existing
dark surface. This section has (24px) vertical margin. It reuses the current
palette, typography, focus treatment, and compact controls.

Rollback is named in both the review heading and the final lime button:
**Approve rollback to [version]**. An amber warning explains that restoring older
adapter code may restore old bugs and does not undo changes already made on the
website. Site access, tools, provenance, and the change preview remain available
before approval. The options dialog offers Cancel; agent-request review offers
Decline. A review or detected update never stands in for the final explicit action.

### Simulated mailbox and tool panel

The paper mailbox and dark tool list are connected by the lime seam. Selecting a
tool changes the simulated mail state; the visible simulation label remains part
of this component. Its animations illustrate a connection, not runtime evidence.

### Agent connection setup

Website setup and extension connect.html share the setup prompt in
`packages/agent-setup`, backed by `packages/agent-core`. **Copy setup instructions** leads;
a disclosure lets the user read or manually select the prompt. Manual configuration
and the native developer connection live in documentation. The existing agent returns
a private link; the extension toolbar asks for explicit connection approval. The
connected extension setup state lists each approved agent under **Connected agents**,
with a readable name, connection state and its own **Disconnect** control. Quiet
row separators and wrapping names preserve the existing layout at narrow widths.
In the popup, each agent's name and state occupy one column, with its Disconnect
button beside them. The compact panel omits the setup disclosures and links to
**Connect another agent**. The full Your agents page shows three setup steps when
no agent is approved, then the approved agent list with Add agent revealing setup.
Documentation and Your adapters provide explicit navigation. A neutral disconnected
state does not use the green connected-state color.
Installation and write reviews name the requesting agent. Pairing-code entry is an advanced fallback. No account/key fields are present.
Charcoal/lime, Manrope headings and wrapping code blocks carry across sizes.

### Human documentation

The website docs.html and extension help.html use one topic model in
packages/agent-core/src/help.ts and one renderer/style in packages/agent-setup.
Topics have direct fragment links, browser-history navigation and keyboard focus
on the newly selected article heading. Operational help is bundled in the extension
and remains available without the preview website. The plain agent-readable guide
remains separate from this human reading interface.

Copy feedback uses a live status message. A clipboard failure opens the instruction
disclosure and focuses the selectable prompt. The local connection page uses the
shared brand and fonts, a (680px) column, and recovery disclosures. It explains that
the private link expires after five minutes, works once, and requires toolbar
approval; this connection reaches an agent on the browser's computer.

### Analytics preferences

Website analytics default on only at the configured public address. The Privacy
page separates the saved preference from effective collection, including preview
and privacy-signal suppression. Extension analytics start off and require explicit
opt-in from Manage adapters. Both use fixed events with shared disclosure semantics;
no browsing URLs, tool inputs/results or adapter code are included.

Privacy retains the documentation's single-column reading layout. Its bordered
secondary button sits beside a live status paragraph: the label names the next
action, while the paragraph explains collection and the saved preference. Local
previews disable the control with **Analytics disabled on this preview**. A browser
privacy signal can block collection while still allowing a saved website opt-out;
unreadable preferences disable collection and the control. Extension opt-in requests
the analytics host permission from the user's click; declining keeps analytics off.

### Guided browser trial

The agent review shows the site, plain change summary and exact proposed tests.
Try update authorizes temporary code execution; Keep update is a separate decision
after results. Discard update preserves the installed version. Technical source,
permissions, version and digest remain in a disclosure. Status updates use a live
region and shared labels from agent-core. Returned examples wrap at narrow widths.
The website guide and extension use the same human workflow; downloadable MCP
instructions carry the technical orchestration.

## Do's and Don'ts

### Do:

- **Do** preserve the supplied charcoal, lime, and paper visual direction.
- **Do** use the existing self-hosted fonts and surface-specific type hierarchy.
- **Do** retain visible focus, readable previews, and wrapping action layouts.
- **Do** keep one active-panel scrollbar in the popup and full-width status borders.
- **Do** retain card summaries when details are collapsed and keep long names and actions readable.
- **Do** show site, tool, and single-use scope alongside approval actions.
- **Do** keep the homepage mailbox visibly labeled as a simulation.
- **Do** show version availability, blocked reasons, and stale registry status beside their relevant actions.
- **Do** name rollback explicitly and retain its older-code warning and change preview.
- **Do** keep Disconnect visible beside connected setup status and name the next website task.
- **Do** distinguish a saved analytics preference from effective collection and explain preview or privacy-signal suppression.

### Don't:

- **Don't** replace operational supporting text with the homepage's faint decorative labels.
- **Don't** apply the homepage's oversized hero typography to permission dialogs.
- **Don't** present the marketing simulation as proof of installed adapter behavior.
- **Don't** describe script capability labels or confirmation prompts as a sandbox.
- **Don't** present automatic update detection as automatic installation or rollback as undoing website changes.
- **Don't** present copied setup instructions or opening a private link as an approved connection.
