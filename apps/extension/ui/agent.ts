import {
  reviewTitle,
  approvalLabel,
  appendVersionChange,
} from "./version-review";
import { BRIDGE_PORT, panelError, reviewStates } from "@toolgraft/agent-core";
type Request = (type: string, data?: Record<string, unknown>) => Promise<any>;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) {
  const e = document.createElement(tag);
  e.textContent = text;
  e.className = className;
  return e;
}
export async function renderPairing(
  target: HTMLElement,
  request: Request,
  compact = false,
  onAgents?: (hasAgents: boolean) => void,
) {
  const section = el("section", "", "agent-pairing");
  const connectHelp =
    "Open your agent’s ToolGraft link to connect. If approval does not open, click ToolGraft in the extensions menu.";
  const connectedHelp =
    "Your approved agents can use this browser independently. You still approve site access, adapter installations and writes.";
  section.append(el("h2", "Connected agents"));
  const help = el("p", connectHelp);
  const state = el("p", "", "status");
  state.setAttribute("role", "status");
  const list = el("div");
  section.append(help, state, list);
  let lastSnapshot = "";
  async function refresh(disconnected = false) {
    const current = await request("agent-connection");
    const agents = current.agents ?? [];
    const snapshot = JSON.stringify(current);
    if (snapshot === lastSnapshot && !disconnected) return;
    lastSnapshot = snapshot;
    if (!compact) section.hidden = agents.length === 0 && !disconnected;
    onAgents?.(agents.length > 0);
    state.classList.toggle("is-connected", current.state === "connected");
    help.textContent =
      current.state === "connected" ? connectedHelp : connectHelp;
    state.textContent =
      current.state === "connected"
        ? agents.length === 1
          ? "Connected to your agent"
          : "Agents connected"
        : disconnected
          ? "Disconnected"
          : "Not connected";
    list.replaceChildren();
    for (const agent of agents) {
      const row = el("section", "", "connected-agent");
      const duplicate =
        agents.filter((a: { label: string }) => a.label === agent.label)
          .length > 1;
      const label = duplicate
        ? `${agent.label} · ${agent.id.slice(-6)}`
        : agent.label;
      row.append(
        el("h3", label),
        el(
          "p",
          agent.state === "connected" ? "Connected" : "Waiting for this agent",
          "meta",
        ),
      );
      const disconnect = el("button", "Disconnect");
      disconnect.type = "button";
      if (agents.length > 1)
        disconnect.setAttribute("aria-label", `Disconnect ${label}`);
      disconnect.onclick = async () => {
        disconnect.disabled = true;
        try {
          await request("agent-disconnect", { id: agent.id });
          await refresh(true);
        } catch (error) {
          state.textContent = panelError(error);
          disconnect.disabled = false;
        }
      };
      row.append(disconnect);
      list.append(row);
    }
  }
  await refresh();
  const timer = setInterval(() => {
    if (!section.isConnected) clearInterval(timer);
    else void refresh().catch(() => {});
  }, 5000);
  window.addEventListener("pagehide", () => clearInterval(timer), {
    once: true,
  });
  if (compact) {
    target.append(section);
    return;
  }
  const trouble = el("details", "", "connection-troubleshooting");
  trouble.append(
    el("summary", "Trouble connecting?"),
    el(
      "p",
      "Open the link in the browser with ToolGraft installed. If it expired, ask your agent for a new one. You do not normally need a pairing code.",
    ),
  );
  const helpLink = el("a", "Read the troubleshooting guide");
  helpLink.href = chrome.runtime.getURL("/help.html#troubleshooting");
  trouble.append(helpLink);
  const fallback = el("details");
  fallback.append(el("summary", "Use a pairing code instead"));
  const form = el("form");
  const code = el("input");
  code.id = "pairing-code";
  code.placeholder = "12345678";
  code.inputMode = "numeric";
  code.pattern = "[0-9]{8}";
  code.maxLength = 8;
  code.required = true;
  code.autocomplete = "off";
  const label = el("label", "Pairing code");
  label.htmlFor = code.id;
  const advanced = el("details");
  advanced.append(el("summary", "Connection settings"));
  const port = el("input");
  port.id = "pairing-port";
  port.type = "number";
  port.value = String(BRIDGE_PORT);
  port.min = "1024";
  port.max = "65535";
  const pl = el("label", "Local MCP port");
  pl.htmlFor = port.id;
  const agentId = el("input");
  agentId.id = "pairing-agent";
  agentId.maxLength = 32;
  agentId.pattern = "[a-f0-9]{32}";
  const al = el("label", "Agent ID");
  al.htmlFor = agentId.id;
  advanced.append(
    pl,
    port,
    al,
    agentId,
    el(
      "p",
      "Use the port and agent ID returned with the code. Leave the ID empty only for an older MCP.",
      "meta",
    ),
  );
  const submit = el("button", "Pair browser", "primary");
  const pairState = el("p");
  pairState.setAttribute("role", "status");
  submit.type = "submit";
  form.append(label, code, advanced, submit, pairState);
  fallback.append(form);
  trouble.append(fallback);
  target.append(section, trouble);
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    pairState.textContent = "Connecting…";
    try {
      await request("agent-pair", {
        code: code.value,
        port: Number(port.value),
        agentId: agentId.value,
      });
      code.value = "";
      await refresh();
      pairState.textContent = "Connected. Return to your agent.";
    } catch (error) {
      pairState.textContent = panelError(error);
    } finally {
      submit.disabled = false;
    }
  };
}
export async function renderAgentReview(target: HTMLElement, request: Request) {
  const id = new URLSearchParams(location.search).get("request");
  if (!id) throw new Error("Missing review request.");
  const r = await request("agent-review", { id });
  if (r.kind === "trial") return renderTrialReview(target, request, id, r);
  target.append(
    el(
      "h1",
      r.kind === "access"
        ? "Let your agent inspect this site"
        : reviewTitle(r.plan, r.manifest),
    ),
    el("p", new URL(r.url).origin, "site-origin"),
  );
  if (r.state !== "awaiting_approval") {
    target.append(el("p", `Request ${r.state}.`, "status"));
    return;
  }
  if (r.agentLabel)
    target.append(el("p", `Requested by ${r.agentLabel}`, "meta"));
  const manifest = r.manifest;
  if (manifest) {
    target.append(
      el(
        "p",
        `Version ${manifest.version} · ${r.reviewLabel} review · source ${r.sourceCommit}`,
        "meta",
      ),
      el("h2", "Tools this adapter adds"),
    );
    const list = el("ul", "", "tool-review");
    for (const t of manifest.tools) {
      const li = el("li");
      li.append(
        el("strong", t.name),
        el(
          "span",
          t.annotations.readOnlyHint ? "Read" : "Write · asks each time",
          "badge",
        ),
        el("p", t.description),
      );
      list.append(li);
    }
    target.append(
      list,
      el("h2", "Site access"),
      el("p", manifest.permissions.hosts.join(", ")),
      el(
        "p",
        "Scripts are trusted within this site. Validation is not a sandbox.",
        "warning",
      ),
      el("code", `SHA-256 ${r.digest}`, "hash"),
    );
    appendVersionChange(target, r.plan, manifest);
    const source = el("details");
    source.append(
      el("summary", "Review generated source"),
      el("pre", r.source ?? ""),
    );
    target.append(source);
  } else
    target.append(
      el(
        "p",
        "Your agent can inspect visible page content on this site. Sign in normally if needed. ToolGraft never asks for your password.",
      ),
    );
  const state = el("p", "", "status");
  state.setAttribute("role", "status");
  const actions = el("div", "", "actions");
  const approve = el(
    "button",
    manifest ? approvalLabel(r.plan, manifest) : "Allow site inspection",
    "primary",
  );
  approve.type = "button";
  const deny = el("button", "Decline");
  deny.type = "button";
  approve.onclick = () => {
    const u = new URL(r.url);
    const permission = chrome.permissions.request({
      origins: manifest?.permissions.hosts ?? [
        `${u.protocol}//${u.hostname}/*`,
      ],
    });
    approve.disabled = true;
    deny.disabled = true;
    void (async () => {
      try {
        if (!(await permission))
          throw new Error("Site access declined. Nothing installed.");
        const result = await request("agent-resolve", {
          id,
          approved: true,
          rollback: r.plan?.action === "rollback",
        });
        state.textContent =
          result.state === "installed"
            ? "Installed. Your agent can now test the tools."
            : "Site access granted. Your agent can continue.";
      } catch (e) {
        state.textContent = panelError(e);
        approve.disabled = false;
        deny.disabled = false;
      }
    })();
  };
  deny.onclick = async () => {
    await request("agent-resolve", { id, approved: false });
    approve.disabled = true;
    deny.disabled = true;
    state.textContent = "Declined. Nothing installed.";
  };
  actions.append(deny, approve);
  target.append(actions, state);
}

async function renderTrialReview(
  target: HTMLElement,
  request: Request,
  id: string,
  initial: any,
) {
  target.classList.add("trial-review");
  let current = initial;
  let disposed = false;
  let busy = false;
  let last = "";
  const heading = el("h1", `Try ${initial.title}`);
  const status = el("p", "", "status");
  status.setAttribute("role", "status");
  const body = el("section");
  const actions = el("div", "", "actions");
  const error = el("p", "");
  error.setAttribute("role", "alert");
  target.append(
    heading,
    el("p", new URL(initial.url).origin, "site-origin"),
    status,
    body,
    actions,
    error,
  );
  const act = async (type: string, approved: boolean) => {
    busy = true;
    actions.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      current = await request(type, { id, approved });
      last = "";
      render();
    } catch (e) {
      error.textContent = panelError(e);
      last = "";
      render();
    } finally {
      busy = false;
    }
  };
  function button(label: string, approved: boolean, keep = false) {
    const b = el("button", label, approved ? "primary" : "");
    b.type = "button";
    b.onclick = () => {
      if (approved && !keep) {
        const permission = chrome.permissions.request({
          origins: current.manifest.permissions.hosts,
        });
        b.disabled = true;
        void permission
          .then((ok) => {
            if (ok) return act("agent-resolve", true);
            error.textContent =
              "Site access declined. The installed adapter is unchanged.";
            b.disabled = false;
          })
          .catch((e) => {
            error.textContent = panelError(e);
            b.disabled = false;
          });
      } else void act(keep ? "agent-keep-trial" : "agent-resolve", approved);
    };
    actions.append(b);
  }
  function render() {
    const key = JSON.stringify([current.state, current.results, current.error]);
    if (key === last) return;
    last = key;
    status.textContent =
      reviewStates[current.state as keyof typeof reviewStates] ??
      "Needs attention";
    body.replaceChildren();
    actions.replaceChildren();
    if (current.error) body.append(el("p", current.error, "warning"));
    if (current.state === "awaiting_approval") {
      body.append(
        el(
          "p",
          `Your agent (${current.agentLabel}) wants to try this change in a temporary tab. Your installed adapter stays unchanged until you choose Keep update.`,
        ),
      );
      const previous = new Set(
        (current.plan?.previous?.tools ?? []).map((t: any) => t.name),
      );
      const added = current.manifest.tools.filter(
        (t: any) => !previous.has(t.name),
      );
      body.append(el("h2", "What changes"));
      for (const t of added) body.append(el("p", t.description));
      if (!added.length)
        body.append(
          el(
            "p",
            "Updates the existing tools. Review the test results before keeping it.",
          ),
        );
      const removed = [...previous].filter(
        (name) => !current.manifest.tools.some((t: any) => t.name === name),
      );
      body.append(
        el(
          "p",
          removed.length
            ? `Removes: ${removed.join(", ")}`
            : "Keeps all existing tools available.",
        ),
      );
      const previousHosts = current.plan?.previous?.permissions?.hosts ?? [];
      const newHosts = current.manifest.permissions.hosts.filter(
        (h: string) => !previousHosts.includes(h),
      );
      body.append(
        el(
          "p",
          newHosts.length
            ? `Requests site access: ${newHosts.join(", ")}`
            : "No additional site access requested.",
        ),
      );
      body.append(el("h2", "Tests your agent will run"));
      const list = el("ul");
      for (const test of current.tests) {
        const t = current.manifest.tools.find((t: any) => t.name === test.tool);
        if (test.expectedError)
          list.append(
            el("li", `Expected rejection: ${test.expectedError}`, "meta"),
          );
        list.append(
          el(
            "li",
            `${t?.description ?? test.tool}${
              Object.keys(test.input).length
                ? " — " +
                  Object.entries(test.input)
                    .map(
                      ([key, value]) =>
                        `${key.replaceAll("_", " ")}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
                    )
                    .join("; ")
                : ""
            }`,
          ),
        );
      }
      body.append(
        list,
        el(
          "p",
          "This runs generated code with access to the approved site. Read-only labels are declarations, not a sandbox. The temporary tab closes after testing.",
          "warning",
        ),
      );
      const details = el("details");
      details.append(
        el("summary", "Code, permissions and version details"),
        el(
          "pre",
          JSON.stringify(
            {
              version: current.manifest.version,
              permissions: current.manifest.permissions,
              digest: current.digest,
            },
            null,
            2,
          ),
        ),
        el("pre", current.source ?? ""),
      );
      body.append(details);
      button("Decline", false);
      button("Try update", true);
    } else if (current.state === "testing") {
      body.append(
        el(
          "p",
          "Your agent’s tests are running in a temporary tab. Keep this browser open. Your installed version is unchanged.",
        ),
      );
    } else if (current.state === "tested" || current.state === "failed") {
      body.append(
        el("h2", "What the tests returned"),
        el(
          "p",
          "These examples are evidence of execution, not a guarantee that every page or field is correct. Your agent receives the same results.",
        ),
      );
      for (const result of current.results ?? []) {
        const section = el("section");
        const t = current.manifest.tools.find(
          (t: any) => t.name === result.tool,
        );
        section.append(el("h3", t?.description ?? result.tool));
        section.append(
          el(
            "p",
            result.expectedError
              ? result.passed
                ? `Correctly rejected: ${result.expectedError}`
                : `Expected rejection was not confirmed: ${result.expectedError}`
              : result.passed
                ? "Returned a result"
                : "Test failed",
            result.passed ? "meta" : "warning",
          ),
        );
        if (result.error) section.append(el("p", result.error, "warning"));
        for (const content of result.result?.content ?? [])
          if (content.type === "text") {
            let value;
            try {
              value = JSON.parse(content.text);
            } catch {
              value = content.text;
            }
            if (value && typeof value === "object" && !Array.isArray(value)) {
              const dl = el("dl");
              for (const [key, v] of Object.entries(value).slice(0, 12))
                dl.append(
                  el("dt", key),
                  el(
                    "dd",
                    Array.isArray(v)
                      ? `${v.length} items — available in Full test result below`
                      : v !== null && typeof v === "object"
                        ? "Structured details — available in Full test result below"
                        : String(v ?? "Not provided").length > 240
                          ? `${String(v).slice(0, 240)}… (preview; full text below)`
                          : String(v ?? "Not provided"),
                  ),
                );
              section.append(dl);
            } else
              section.append(
                el(
                  "p",
                  content.text.length > 240
                    ? `${content.text.slice(0, 240)}… (preview; full text below)`
                    : content.text,
                ),
              );
          }
        const full = el("details");
        full.append(
          el("summary", "Full test result"),
          el("pre", JSON.stringify(result, null, 2)),
        );
        section.append(full);
        body.append(section);
      }
      if (current.state === "tested") {
        button("Discard update", false, true);
        button("Keep update", true, true);
      } else
        body.append(
          el(
            "p",
            "The working adapter is unchanged. Ask your agent to repair and try again.",
          ),
        );
    } else if (current.state === "installed")
      body.append(
        el(
          "p",
          "Update kept. Your agent can continue your original task and verify the installed tools.",
        ),
      );
    else
      body.append(
        el(
          "p",
          "The installed adapter is unchanged. Ask your agent to resume when you are ready.",
        ),
      );
  }
  render();
  const timer = setInterval(async () => {
    if (disposed || busy) return;
    try {
      current = await request("agent-review", { id });
      render();
    } catch (e) {
      error.textContent = panelError(e);
      clearInterval(timer);
    }
  }, 1000);
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      clearInterval(timer);
    },
    { once: true },
  );
}
