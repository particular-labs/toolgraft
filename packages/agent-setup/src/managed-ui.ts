import type { AnalyticsEvent } from "@toolgraft/analytics";
import { managedServer, managedCodex, mcpArchive } from "./managed-config";
import { GUIDE_VERSION, setupInstructions } from "@toolgraft/agent-core";
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = "") {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
export function renderManagedSetup(
  target: HTMLElement,
  onEvent: (event: AnalyticsEvent) => void = () => {},
) {
  target.classList.add("agent-setup");
  target.append(el("h2", "Connect in three steps"));
  const prompt = setupInstructions({
    packageLocation: new URL(mcpArchive, location.href).href,
    ...(location.protocol !== "chrome-extension:"
      ? {
          extensionLocation: new URL(
            `toolgraft-${GUIDE_VERSION}-chrome.zip`,
            location.href,
          ).href,
        }
      : {}),
    guideLocation: new URL("agent-instructions.md", location.href).href,
  });
  const steps = el("ol");
  steps.className = "setup-steps";
  for (const step of [
    "Copy the setup instructions and paste them into your agent.",
    "Let your agent set up ToolGraft with your permission. Start a new chat if it asks.",
    "Open your agent’s connection link in this browser and approve Connect this agent. If approval does not open, click ToolGraft in the extensions menu.",
  ])
    steps.append(el("li", step));
  target.append(steps);
  const actions = el("div");
  actions.className = "setup-actions";
  const copyPrompt = el("button", "Copy setup instructions");
  copyPrompt.type = "button";
  const promptState = el("p");
  promptState.setAttribute("role", "status");
  promptState.id = "setup-prompt-status";
  const promptDetails = el("details");
  const promptText = el("pre", prompt);
  promptText.id = "setup-prompt";
  promptText.tabIndex = 0;
  promptDetails.append(el("summary", "View copied instructions"), promptText);
  copyPrompt.onclick = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      onEvent("setup_instructions_copied");
      promptState.textContent =
        "Copied. Paste into your agent and review its setup plan.";
    } catch {
      onEvent("setup_instructions_copy_failed");
      promptDetails.open = true;
      promptText.focus();
      promptState.textContent =
        "Clipboard unavailable. Select and copy the instructions below.";
    }
  };
  actions.append(copyPrompt);
  target.append(actions, promptState, promptDetails);
}

/** Manual client configuration lives in documentation, away from first setup. */
export function renderManualSetup(
  manual: HTMLElement,
  onEvent: (event: AnalyticsEvent) => void = () => {},
) {
  manual.classList.add("agent-setup");
  const download = el("a", "Download the local MCP package");
  download.href = "./" + mcpArchive;
  download.download = mcpArchive;
  download.onclick = () => onEvent("mcp_download");
  manual.append(
    download,
    el(
      "p",
      "Developer preview · Node 24 or newer required. Save the package, then enter its full path below. Your agent starts the MCP and its bundled bridge; no separate helper app is needed.",
    ),
  );
  const path = el("input");
  path.id = "managed-package-path";
  path.value = `/absolute/path/to/${mcpArchive}`;
  path.spellcheck = false;
  const pathLabel = el("label", "Downloaded package path");
  pathLabel.htmlFor = path.id;
  const select = el("select");
  select.id = "managed-agent";
  for (const name of [
    "Claude Code",
    "Codex",
    "Cursor",
    "Hermes",
    "OpenClaw",
    "Other local MCP client",
  ]) {
    const opt = el("option", name);
    opt.value = name;
    select.append(opt);
  }
  const label = el("label", "Agent client");
  label.htmlFor = select.id;
  const help = el("p"),
    pre = el("pre"),
    code = el("code");
  code.id = "managed-config";
  pre.append(code);
  function update() {
    const server = managedServer(path.value);
    if (select.value === "Codex") {
      code.textContent = managedCodex(path.value);
      help.textContent =
        "Merge into .codex/config.toml in your trusted project, then start a new session.";
    } else if (select.value === "Hermes") {
      code.textContent = `mcp_servers:\n  toolgraft:\n    command: npx\n    args: ${JSON.stringify(server.args)}`;
      help.textContent =
        "Merge into ~/.hermes/config.yaml. Configure this on the browser’s computer. Documented setup; Hermes has not been tested here.";
    } else if (select.value === "OpenClaw") {
      code.textContent = JSON.stringify(
        { mcp: { servers: { toolgraft: server } } },
        null,
        2,
      );
      help.textContent =
        "Merge into your OpenClaw configuration on the browser’s computer. Remote gateways need a node or another connection path. Documented setup; OpenClaw has not been tested here.";
    } else {
      code.textContent = JSON.stringify(
        { mcpServers: { toolgraft: server } },
        null,
        2,
      );
      help.textContent =
        select.value === "Cursor"
          ? "Merge into .cursor/mcp.json. Cursor has not been tested here."
          : "Merge into your client’s MCP settings (.mcp.json for Claude Code), preserving existing servers.";
    }
  }
  path.oninput = update;
  select.onchange = update;
  update();
  const message = el("p");
  message.setAttribute("role", "status");
  const copy = el("button", "Copy ToolGraft configuration");
  copy.type = "button";
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(code.textContent ?? "");
      onEvent("manual_config_copied");
      message.textContent =
        "Copied. Add it to your agent, then ask for a ToolGraft connection link.";
    } catch {
      onEvent("manual_config_copy_failed");
      message.textContent = "Select and copy the configuration above.";
    }
  };
  manual.append(
    pathLabel,
    path,
    label,
    select,
    help,
    pre,
    copy,
    message,
    el("h3", "Ask your agent"),
    el(
      "p",
      "“Use ToolGraft to connect to my browser. Get a connection link, then help me create tools for a website.”",
    ),
    el(
      "p",
      "Once paired, ask for an operation. Your agent can inspect the site, generate an adapter, request local installation, and test it. You approve site access and installation in the browser.",
    ),
  );
}
