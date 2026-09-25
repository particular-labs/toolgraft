import { agents, testPrompt } from "./index.ts";
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  return n;
}
export function renderAgentSetup(target: HTMLElement) {
  target.classList.add("agent-setup");
  const intro = el(
    "p",
    "One local MCP connection gives your agent access to tools on matching open tabs. Add adapters in ToolGraft; keep the same agent connection.",
  );
  const start = el("h2", "1. Keep your ToolGraft browser open");
  const startText = el(
    "p",
    "For this developer preview, run pnpm dev:browser from the ToolGraft checkout. It starts a dedicated Chrome with WebMCP enabled. Install the playground adapter in ToolGraft and open http://localhost:4174/tasks in that browser.",
  );
  const note = el(
    "p",
    "No ToolGraft account or API key is required. Use your existing coding-agent login or local model; sites may still need their own login. A cloud agent cannot directly reach this local browser.",
  );
  const h2 = el("h2", "2. Add one MCP connection to your agent");
  const label = el("label", "Your agent");
  label.htmlFor = "agent-choice";
  const select = el("select");
  select.id = "agent-choice";
  for (const a of agents) {
    const option = el("option", a.label);
    option.value = a.id;
    select.append(option);
  }
  const help = el("p");
  help.id = "agent-help";
  select.setAttribute("aria-describedby", help.id);
  const file = el("p");
  file.className = "config-path";
  const code = el("code");
  code.id = "agent-config";
  const pre = el("pre");
  pre.append(code);
  const actions = el("div");
  actions.className = "setup-actions";
  const message = el("p");
  message.setAttribute("role", "status");
  message.className = "copy-status";
  const copy = el("button", "Copy configuration");
  copy.type = "button";
  const download = el("button", "Download configuration");
  download.type = "button";
  let selected = agents[0] as (typeof agents)[number];
  const source = el("a", "Official setup documentation");
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  const update = () => {
    selected = agents.find((a) => a.id === select.value) ?? agents[0];
    help.textContent = selected.help;
    file.textContent = selected.file;
    code.textContent = selected.config();
    source.href = selected.source;
    message.textContent = "";
  };
  async function clipboard(text: string, button: HTMLButtonElement) {
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(text);
      message.textContent = "Copied. Paste it into your agent setup.";
    } catch {
      message.textContent =
        "Clipboard is unavailable. Select the text to copy it, or download the configuration.";
    } finally {
      button.disabled = false;
    }
  }
  copy.onclick = () => void clipboard(selected.config(), copy);
  download.onclick = () => {
    const url = URL.createObjectURL(
      new Blob([selected.config()], { type: "text/plain;charset=utf-8" }),
    );
    const a = el("a");
    a.href = url;
    a.download = selected.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent = `Downloaded ${selected.filename}. Merge it into ${selected.file}; keep your other servers.`;
  };
  select.onchange = update;
  actions.append(copy, download, source);
  const approval = el(
    "p",
    "Your agent may ask you to approve this MCP server and its calls. Chrome DevTools MCP can control the connected browser, so use the dedicated profile. This page cannot install software or confirm your agent connection for you.",
  );
  const h3 = el("h2", "3. Ask your agent to prove the connection");
  const prompt = el("pre", testPrompt);
  prompt.id = "agent-test-prompt";
  const promptCopy = el("button", "Copy test prompt");
  promptCopy.type = "button";
  promptCopy.onclick = () => void clipboard(testPrompt, promptCopy);
  const expected = el(
    "p",
    "Success means your agent returns the task titles from the tool, including “Try a read tool” on a fresh playground. A configured server or an enabled extension alone is not proof.",
  );
  const details = el("details");
  details.append(el("summary", "Troubleshooting and connection checks"));
  const failures = el("ul");
  for (const text of [
    "Connection refused: keep pnpm dev:browser running; this configuration connects to port 9227.",
    "Server will not start: ensure Node and npx are available to your agent. The first launch may need internet to fetch the pinned server package.",
    "No WebMCP tools: use the same browser profile, enable Allow User Scripts, install the matching adapter, and reload the target page. Tools only exist on matching open tabs.",
    "Run pnpm doctor:agent from the checkout for a read-only MCP check. It tests the local connection; it does not run a model.",
    "A write request needs your separate ToolGraft approval. Closing or ignoring it denies the write.",
  ])
    failures.append(el("li", text));
  details.append(failures);
  const model = el("details");
  model.append(
    el("summary", "How one connection serves every adapter"),
    el(
      "p",
      "The agent lists tabs, discovers a selected page’s current tools, and executes a named tool with its input. Definitions are discovered when needed. Installing another adapter does not require another MCP server. The browser tab, route, permission and sign-in state determine which tools are available.",
    ),
  );
  target.append(
    intro,
    start,
    startText,
    note,
    h2,
    label,
    select,
    help,
    file,
    pre,
    actions,
    approval,
    h3,
    prompt,
    promptCopy,
    expected,
    message,
    details,
    model,
  );
  update();
}
