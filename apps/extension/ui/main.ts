import {
  parseConnectionInvitation,
  PANEL_PROTOCOL,
  panelRecovery,
  panelError,
} from "@toolgraft/agent-core";
import {
  analyticsConfig,
  privacyBlocked,
  type AnalyticsEvent,
  type AnalyticsPage,
} from "@toolgraft/analytics";
import { trackPanel } from "./analytics";
import { renderHelp } from "@toolgraft/agent-setup/help-ui";
import { renderManagedSetup } from "@toolgraft/agent-setup/managed-ui";
import "@toolgraft/agent-setup/style.css";
import "./style.css";
import "@toolgraft/agent-setup/help.css";
import { renderPairing, renderAgentReview } from "./agent";
import {
  type ActivationPlan,
  type Manifest,
  type Registry,
} from "@toolgraft/adapter-schema";
import type { Store } from "../lib/store";
import type {
  VersionCatalog,
  VersionGroup,
  VersionItem,
} from "../lib/versions";
import {
  reviewTitle,
  approvalLabel,
  appendVersionChange,
} from "./version-review";
type Status = Store & {
  userScripts: boolean;
  session: Record<string, unknown>;
  registry: Registry | null;
  versions: VersionCatalog;
};
const app = document.querySelector<HTMLElement>("#app")!;
const view = document.body.dataset.view;
const invitationFromLink =
  view === "connect" && location.hash
    ? (() => {
        try {
          return decodeURIComponent(location.hash.slice(1));
        } catch {
          return "";
        }
      })()
    : "";
if (invitationFromLink) history.replaceState(null, "", location.pathname);

const analyticsPage: AnalyticsPage =
  view === "agent"
    ? "review"
    : ["popup", "options", "connect", "onboarding", "confirmation"].includes(
          view ?? "",
        )
      ? (view as AnalyticsPage)
      : "options";
let panelTracked = false;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  cls?: string,
) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function button(text: string, action: () => unknown, cls = "") {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = () => {
    void action();
  };
  return b;
}
function link(text: string, url: string) {
  const a = el("a", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}
function brand() {
  const a = link("ToolGraft", chrome.runtime.getURL("/options.html"));
  const mark = el("span", "", "brand-mark");
  mark.setAttribute("aria-hidden", "true");
  a.prepend(mark);
  a.className = "brand";
  return a;
}
async function request<T = unknown>(
  type: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (result?.ok && result.panelProtocol !== PANEL_PROTOCOL)
    throw new Error(panelRecovery);
  if (!result?.ok)
    throw new Error(
      result?.error ?? "The extension did not respond. Reload and try again.",
    );
  const events: Record<string, AnalyticsEvent> = {
    "agent-connect-invitation": "connection_approved",
    "agent-pair": "connection_approved",
    "agent-disconnect": "connection_disconnected",
    "stage-local": "adapter_review_opened",
    "stage-version": "adapter_review_opened",
    install: "adapter_installed",
    remove: "adapter_removed",
    "registry-refresh": "catalog_refreshed",
  };
  if (events[type]) trackPanel(events[type]!, analyticsPage);
  if (type === "agent-resolve")
    trackPanel(
      result.value?.state === "installed"
        ? data.rollback
          ? "adapter_rolled_back"
          : "adapter_installed"
        : result.value?.state === "declined"
          ? "adapter_declined"
          : "site_access_approved",
      analyticsPage,
    );
  if (type === "resolve-confirmation")
    trackPanel(
      data.approved ? "write_approved" : "write_declined",
      analyticsPage,
    );
  return result.value;
}
function report(error: unknown) {
  trackPanel("panel_error", analyticsPage);
  const p = el("p", panelError(error), "error");
  p.setAttribute("role", "alert");
  (document.querySelector("dialog[open]") ?? app).append(p);
}
async function run(b: HTMLButtonElement, fn: () => Promise<unknown>) {
  b.disabled = true;
  try {
    await fn();
  } catch (e) {
    report(e);
  } finally {
    b.disabled = false;
  }
}
function status(text: string, error = false) {
  const p = el("p", text, error ? "status warning" : "status");
  p.setAttribute("role", "status");
  return p;
}
let current: Status;
function adapterStateLabel(state: string) {
  return state === "ok"
    ? "Ready"
    : state === "revoked"
      ? "Revoked"
      : state === "broken"
        ? "Needs repair"
        : state === "engine-too-old"
          ? "Update ToolGraft"
          : "Needs attention";
}
async function render() {
  if (!document.querySelector(".noise")) {
    const texture = el("div", "", "noise");
    texture.setAttribute("aria-hidden", "true");
    document.body.prepend(texture);
  }
  app.replaceChildren(brand());
  if (!panelTracked) {
    panelTracked = true;
    trackPanel("panel_opened", analyticsPage);
  }
  app.setAttribute("aria-busy", "true");
  try {
    if (
      view === "popup" &&
      chrome.extension.getViews({ type: "popup" }).includes(window)
    ) {
      const hostWindow = await chrome.windows.getCurrent();
      document.documentElement.style.width = `${Math.min(560, Math.max(320, (hostWindow.width ?? 600) - 40))}px`;
      document.documentElement.style.setProperty(
        "--popup-max-height",
        `${Math.min(600, Math.max(240, (hostWindow.height ?? 760) - 160))}px`,
      );
      document.documentElement.dataset.toolbar = "true";
    }
    if (view === "confirmation") {
      await confirmation();
      return;
    }
    if (view === "agent") {
      await renderAgentReview(app, request);
      return;
    }
    if (view === "help") {
      const nav = el("nav", "", "extension-navigation");
      nav.setAttribute("aria-label", "Extension");
      nav.append(
        link("Your adapters", chrome.runtime.getURL("/options.html")),
        link("Your agents", chrome.runtime.getURL("/connect.html")),
      );
      const docs = el("div");
      app.append(nav, docs);
      renderHelp(docs, (event) => trackPanel(event, analyticsPage));
      return;
    }
    if (view === "connect") {
      if (
        invitationFromLink &&
        (await connectionInvitation(invitationFromLink))
      )
        return;
      const nav = el("nav", "", "extension-navigation");
      nav.setAttribute("aria-label", "Extension");
      nav.append(
        link("Your adapters", chrome.runtime.getURL("/options.html")),
        link("Documentation", chrome.runtime.getURL("/help.html")),
      );
      app.append(nav, el("h1", "Your agents"));
      const layout = el("div", undefined, "connect-flow");
      const setupPanel = el("section");
      const managed = el("section");
      const add = button("Add agent", () => {
        setupPanel.hidden = !setupPanel.hidden;
        add.setAttribute("aria-expanded", String(!setupPanel.hidden));
      });
      setupPanel.id = "connect-setup";
      add.setAttribute("aria-controls", setupPanel.id);
      add.setAttribute("aria-expanded", "false");
      layout.append(add, setupPanel, managed);
      app.append(layout);
      renderManagedSetup(setupPanel, (event) =>
        trackPanel(event, analyticsPage),
      );
      await renderPairing(managed, request, false, (hasAgents) => {
        setupPanel.hidden = hasAgents;
        add.hidden = !hasAgents;
        add.setAttribute("aria-expanded", String(!hasAgents));
      });
      const help = el("p", "", "meta");
      help.append(
        "Connection links can open approval directly. ",
        link(
          "Set up one-tab connections",
          chrome.runtime.getURL("/help.html#connect"),
        ),
      );
      managed.append(help);
      return;
    }
    if (view === "popup" && (await connectionInvitation())) return;
    current = await request<Status>("status");
    if (view === "popup") {
      await popup();
      return;
    }
    if (view === "onboarding") {
      await onboarding();
      return;
    }
    await options();
    await analyticsPreferences();
  } catch (e) {
    report(e);
  } finally {
    app.setAttribute("aria-busy", "false");
  }
}
async function analyticsPreferences() {
  const section = el("section", undefined, "entry");
  section.append(
    el("h2", "Help improve ToolGraft"),
    el(
      "p",
      "Optional usage analytics are off unless you turn them on. Share fixed panel and setup actions plus the ToolGraft release with Particular Labs’ Umami server. No site URLs, searches, adapter names, code, tool inputs/results or error text are sent. The server still receives your IP address and browser headers.",
    ),
  );
  const privacy =
    privacyBlocked(navigator) || chrome.extension.inIncognitoContext;
  const current = await request<{ enabled: boolean; endpoint: string }>(
    "analytics-status",
  );
  let enabled = current.enabled;
  const note = status(
    privacy
      ? "Your browser’s privacy signal blocks analytics."
      : enabled
        ? "Optional analytics are on."
        : "Optional analytics are off.",
  );
  const toggle = button(
    enabled
      ? "Turn off extension analytics"
      : "Allow optional extension analytics",
    async () => {
      // Call permissions.request directly from the user's click, before awaiting.
      const permission = enabled
        ? Promise.resolve(true)
        : chrome.permissions.request({
            origins: [new URL(analyticsConfig.endpoint).origin + "/*"],
          });
      await run(toggle, async () => {
        if (!(await permission)) {
          note.textContent = "Permission declined. Analytics remain off.";
          return;
        }
        const value = await request<{ enabled: boolean }>("analytics-set", {
          enabled: !enabled,
        });
        enabled = value.enabled;
        toggle.textContent = enabled
          ? "Turn off extension analytics"
          : "Allow optional extension analytics";
        note.textContent = enabled
          ? "Optional analytics are on. You can turn them off here at any time."
          : "Optional analytics are off. No new events will be sent.";
      });
    },
  );
  if (privacy && !enabled) toggle.disabled = true;
  section.append(toggle, note);
  (document.querySelector<HTMLElement>("[data-settings]") ?? app).append(
    section,
  );
}
async function onboarding() {
  app.append(
    el("h1", "Give your sites tools."),
    el(
      "p",
      "Install an adapter, review its access, and let your agent work with named tools. ToolGraft is free and open source.",
    ),
  );
  app.append(
    el("h2", "Enable User Scripts"),
    el(
      "p",
      "Open chrome://extensions, choose ToolGraft → Details, then turn on Allow User Scripts. Return here and check again.",
    ),
  );
  app.append(
    el("code", `chrome://extensions/?id=${chrome.runtime.id}`),
    status(
      current.userScripts
        ? "User Scripts is enabled."
        : "User Scripts is not enabled.",
      !current.userScripts,
    ),
  );
  const check = button(
    "Check again",
    () =>
      run(check, async () => {
        await request("resync");
        await render();
      }),
    "primary",
  );
  app.append(
    check,
    el("h2", "Connect your existing agent"),
    el(
      "p",
      "Add the ToolGraft MCP package to your agent, then pair it here. Your agent can create and repair adapters without native WebMCP flags. The native-only example packages still use the optional developer connection.",
    ),
  );
  app.append(
    el("h2", "Approve only sites you trust"),
    el(
      "p",
      "Script adapters are JavaScript with access to the sites you approve. Review, exact versions, and site permissions reduce risk; they do not sandbox malicious code.",
    ),
  );
  const navigation = el("nav", undefined, "actions");
  navigation.setAttribute("aria-label", "Next steps");
  navigation.append(
    link("Connect your agent", chrome.runtime.getURL("/connect.html")),
    link("Manage adapters", chrome.runtime.getURL("/options.html")),
    link("Documentation", chrome.runtime.getURL("/help.html")),
  );
  app.append(navigation);
  await connectionLinkPreference(app);
}
async function connectionInvitation(fromLink?: string) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const invitationUrl = fromLink ?? tab?.url;
  if (!invitationUrl || !parseConnectionInvitation(invitationUrl)) return false;
  const invitation = parseConnectionInvitation(invitationUrl)!;
  app.append(
    el("h1", "Connect this agent?"),
    el(
      "p",
      `${invitation.label ?? "The agent running on this computer"} is requesting access to ToolGraft. Connecting it keeps your other agents connected. You still approve site access, adapter installations and writes.`,
    ),
  );
  const result = status("Opening the link alone has not granted access.");
  const approve = button(
    "Connect this agent",
    () =>
      run(approve, async () => {
        await request("agent-connect-invitation", { url: invitationUrl });
        result.textContent =
          "Connected. Return to your agent and ask for a website task.";
        approve.remove();
        decline.remove();
        if (!fromLink && tab?.id !== undefined)
          await chrome.tabs.update(tab.id, {
            url: invitationUrl.split("#")[0],
          });
      }),
    "primary",
  );
  const decline = button("Not now", () => {
    if (fromLink) location.href = chrome.runtime.getURL("/connect.html");
    else window.close();
  });
  const actions = el("div", undefined, "actions");
  actions.append(decline, approve);
  app.append(actions, result);
  await connectionLinkPreference(app);
  return true;
}
function tabbed(target: HTMLElement, labels: string[]) {
  const nav = el("div", undefined, "panel-tabs");
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "ToolGraft sections");
  const panels = labels.map((label, i) => {
    const p = el("section", undefined, "tab-panel");
    p.id = `panel-${i}`;
    p.setAttribute("role", "tabpanel");
    p.setAttribute("aria-labelledby", `tab-${i}`);
    return p;
  });
  function select(index: number) {
    sessionStorage.setItem(`toolgraft-tab:${view}`, String(index));
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
      panels[i]!.hidden = i !== index;
    });
  }
  const buttons = labels.map((label, i) => {
    const b = button(label, () => select(i));
    b.id = `tab-${i}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", panels[i]!.id);
    b.onkeydown = (e) => {
      const next =
        e.key === "ArrowRight"
          ? (i + 1) % labels.length
          : e.key === "ArrowLeft"
            ? (i + labels.length - 1) % labels.length
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? labels.length - 1
                : undefined;
      if (next !== undefined) {
        e.preventDefault();
        select(next);
        buttons[next]!.focus();
      }
    };
    nav.append(b);
    return b;
  });
  target.append(nav, ...panels);
  const saved = Number(sessionStorage.getItem(`toolgraft-tab:${view}`) ?? 0);
  select(
    Number.isInteger(saved) && saved >= 0 && saved < labels.length ? saved : 0,
  );
  return panels;
}
async function connectionLinkPreference(target: HTMLElement) {
  const section = el("section", undefined, "connection-links");
  section.append(
    el("h2", "Open connection links here"),
    el(
      "p",
      "Let ToolGraft recognize its local connection links and open approval in the same tab. Every agent still needs your approval. This optional permission covers local pages at 127.0.0.1.",
    ),
  );
  const enabled =
    !!(await chrome.storage.local.get("connectionLinks")).connectionLinks &&
    (await chrome.permissions.contains({ origins: ["http://127.0.0.1/*"] }));
  const result = el(
    "p",
    enabled
      ? "One-tab connections enabled"
      : "Toolbar connection is always available.",
    "meta",
  );
  result.setAttribute("role", "status");
  const control = button(
    enabled ? "Turn off one-tab connections" : "Enable one-tab connections",
    async () => {
      const permission = enabled
        ? Promise.resolve(true)
        : chrome.permissions.request({ origins: ["http://127.0.0.1/*"] });
      await run(control, async () => {
        if (!(await permission)) {
          result.textContent =
            "Permission declined. You can still connect from the toolbar.";
          return;
        }
        await chrome.storage.local.set({ connectionLinks: !enabled });
        if (enabled)
          await chrome.permissions.remove({ origins: ["http://127.0.0.1/*"] });
        section.remove();
        await connectionLinkPreference(target);
      });
    },
  );
  section.append(control, result);
  target.append(section);
}
async function popup() {
  const full = link("Open full view", chrome.runtime.getURL("/options.html"));
  full.className = "full-view";
  const header = el("header", undefined, "popup-header");
  const mark = app.querySelector(".brand")!;
  mark.replaceWith(header);
  header.append(mark, full);
  const [pagePanel, library, agents] = tabbed(app, [
    "This page",
    "Adapters",
    "Agents",
  ]);
  pagePanel!.append(el("h1", "Tools on this page"));
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url && /^https?:/.test(tab.url))
    pagePanel!.append(el("p", new URL(tab.url).hostname, "meta"));
  const diagnostics = Object.entries(current.session)
    .filter(([key]) => key.startsWith(`diagnostic:${tab?.id}:`))
    .map(
      ([, value]) =>
        value as {
          url: string;
          state: string;
          message: string;
          tools: string[];
        },
    )
    .filter((d) => d.url === tab?.url);
  if (!current.userScripts)
    pagePanel!.append(
      status("Enable User Scripts to activate adapters.", true),
      link("Open setup guide", chrome.runtime.getURL("/onboarding.html")),
    );
  if (!diagnostics.length)
    pagePanel!.append(
      el(
        "p",
        "No tools are active on this page. Ask your agent for a website task; it can open the right page for you.",
        "empty",
      ),
    );
  for (const d of diagnostics) {
    pagePanel!.append(status(d.message, d.state !== "active"));
    const list = el("ul", undefined, "tools");
    for (const t of d.tools) list.append(el("li", t));
    pagePanel!.append(list);
  }
  pagePanel!.append(
    button(
      "Manage adapters",
      () => chrome.runtime.openOptionsPage(),
      "primary",
    ),
  );
  library!.append(el("h1", "Installed adapters"));
  const search = el("input");
  search.type = "search";
  search.placeholder = "Search adapters or sites";
  search.setAttribute("aria-label", "Search installed adapters");
  const list = el("div", undefined, "compact-adapters");
  const show = () => {
    list.replaceChildren();
    const q = search.value.trim().toLowerCase();
    const matches = Object.values(current.installIndex).filter((r) =>
      `${r.manifest.title} ${r.manifest.permissions.hosts.join(" ")}`
        .toLowerCase()
        .includes(q),
    );
    for (const r of matches) {
      const row = el("section", undefined, "compact-adapter");
      row.append(
        el("h2", r.manifest.title),
        el(
          "p",
          `${r.manifest.tools.length} ${r.manifest.tools.length === 1 ? "tool" : "tools"} · ${r.manifest.version} · ${adapterStateLabel(r.state)}`,
          "meta",
        ),
      );
      list.append(row);
    }
    if (!matches.length)
      list.append(
        el(
          "p",
          q
            ? "No matching adapters. Try a different search."
            : "No adapters installed yet. Ask your agent to add tools for a website.",
          "empty",
        ),
      );
  };
  search.oninput = show;
  library!.append(search, list);
  show();
  await renderPairing(agents!, request, true);
  agents!.append(
    link("Connect another agent", chrome.runtime.getURL("/connect.html")),
  );
}
async function options() {
  app.append(
    link("Connect your agent", chrome.runtime.getURL("/connect.html")),
  );
  app.append(
    el("h1", "Your adapters"),
    el(
      "p",
      "Choose what runs, and where. Every installed version stays pinned until you approve an update.",
    ),
  );
  if (!current.userScripts)
    app.append(
      status(
        "User Scripts is disabled. Enable it before installing adapters.",
        true,
      ),
      link("Open setup guide", chrome.runtime.getURL("/onboarding.html")),
    );
  const [installedPanel, catalogPanel, settingsPanel] = tabbed(app, [
    "Installed",
    "Catalog",
    "Settings",
  ]);
  const file = el("input");
  file.type = "file";
  file.accept = ".tgz,application/gzip";
  file.id = "package-file";
  const label = el("label", "Install a local adapter (.tgz)");
  label.htmlFor = file.id;
  const importSection = el("details");
  importSection.append(el("summary", "Import an adapter package"), label, file);
  installedPanel!.append(importSection);
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    file.disabled = true;
    try {
      if (f.size > 1024 * 1024) throw new Error("Package exceeds 1 MiB.");
      const stage = await request<Stage>("stage-local", {
        bytes: [...new Uint8Array(await f.arrayBuffer())],
      });
      review(stage);
    } catch (e) {
      report(e);
    } finally {
      file.disabled = false;
      file.value = "";
    }
  };
  const filters = el("div", undefined, "library-filters");
  const search = el("input");
  search.type = "search";
  search.placeholder = "Search names, sites or tools";
  search.setAttribute("aria-label", "Search adapters");
  const filter = el("select");
  filter.setAttribute("aria-label", "Filter adapters");
  for (const [value, label] of [
    ["all", "All adapters"],
    ["ready", "Ready"],
    ["attention", "Needs attention"],
    ["updates", "Updates available"],
  ]) {
    const option = el("option", label);
    option.value = value!;
    filter.append(option);
  }
  filters.append(search, filter);
  const grid = el("div", undefined, "adapter-grid");
  const empty = el("p", "No adapters match your filters.", "empty");
  empty.hidden = true;
  const count = el("p", "", "meta");
  count.setAttribute("role", "status");
  installedPanel!.append(filters, count, grid, empty);
  const applyFilters = () => {
    let visible = 0;
    for (const card of grid.children as HTMLCollectionOf<HTMLElement>) {
      card.hidden = !(
        card.dataset.search!.includes(search.value.trim().toLowerCase()) &&
        (filter.value === "all" ||
          (filter.value === "updates"
            ? card.dataset.update === "true"
            : card.dataset.state === filter.value))
      );
      if (!card.hidden) visible++;
    }
    empty.hidden = visible > 0;
    count.textContent = `${visible} of ${grid.children.length} adapters`;
  };
  search.oninput = applyFilters;
  filter.onchange = applyFilters;
  const records = Object.values(current.installIndex);
  if (!records.length)
    empty.textContent =
      "No adapters installed. Ask your agent to add tools for a website.";
  for (const r of records) {
    const section = el("section", undefined, "entry adapter-card");
    section.dataset.search =
      `${r.manifest.title} ${r.manifest.description} ${r.manifest.permissions.hosts.join(" ")} ${r.manifest.tools.map((t) => t.name).join(" ")}`.toLowerCase();
    section.dataset.state = r.state === "ok" ? "ready" : "attention";
    const head = el("div", undefined, "adapter-heading");
    const monogram = el(
      "span",
      r.manifest.title.slice(0, 1).toUpperCase(),
      "adapter-monogram",
    );
    monogram.setAttribute("aria-hidden", "true");
    head.append(monogram, el("h3", r.manifest.title));
    section.append(
      head,
      el(
        "span",
        adapterStateLabel(r.state),
        `adapter-state ${r.state === "ok" ? "" : "warning"}`,
      ),
      el("p", r.manifest.description),

      el("p", `Version ${r.manifest.version}`, "meta"),
      el("p", r.manifest.permissions.hosts.join(", ")),
    );
    const group = current.versions.adapters.find((g) => g.id === r.manifest.id);
    section.dataset.update = String(!!group?.updateVersion);
    if (group?.updateVersion) {
      section.append(
        status(`Update available: ${group.updateVersion}`),
        versionButton(
          group.id,
          group.versions.find((v) => v.version === group.updateVersion)!,
          true,
        ),
      );
    }
    const details = el("details");
    details.append(
      el(
        "summary",
        `${r.manifest.tools.length} ${r.manifest.tools.length === 1 ? "tool" : "tools"} · Permissions and details`,
      ),
    );
    const tools = el("ul");
    for (const t of r.manifest.tools)
      tools.append(el("li", `${t.name}: ${t.description}`));
    details.append(
      el("p", `${r.manifest.runtime.kind} adapter · ${r.state}`, "meta"),
      tools,
      el("p", r.manifest.permissions.hosts.join(", ")),
      el("code", `SHA-256 ${r.manifestSha256}`, "hash"),
      el(
        "p",
        "Reload matching tabs after removal to clear existing page registrations.",
        "meta",
      ),
    );
    section.append(details);
    if (group) section.append(versionHistory(group));
    const remove = button(
      `Remove ${r.manifest.title}`,
      () =>
        run(remove, async () => {
          await request("remove", { id: r.manifest.id });
          await render();
        }),
      "danger",
    );
    section.append(remove);
    grid.append(section);
  }
  applyFilters();
  catalogPanel!.append(el("h2", "Registry"));
  const refresh = button("Check registry and updates", () =>
    run(refresh, async () => {
      await request("registry-refresh");
      await render();
    }),
  );
  catalogPanel!.append(
    el(
      "p",
      "Checks the configured registry now. Catalog and safety lists also refresh every six hours; installing a version always requires your approval.",
    ),
    refresh,
  );
  const catalog = current.versions;
  const checked = el(
    "p",
    catalog.refreshedAt
      ? `Last checked ${new Date(catalog.refreshedAt).toLocaleString()}. Checks also run every six hours while Chrome is running. Updates are never installed automatically.`
      : "No successful registry check yet. Local history remains available offline.",
    "meta",
  );
  catalogPanel!.append(checked);
  if (catalog.refreshError)
    catalogPanel!.append(
      status(
        `Last check failed: ${catalog.refreshError}. Cached versions are shown. Try Check registry and updates again.`,
        true,
      ),
    );
  const available = catalog.adapters.filter((g) => !current.installIndex[g.id]);
  if (!available.length)
    catalogPanel!.append(
      el(
        "p",
        "No additional catalog adapters. Check the registry to refresh availability.",
        "empty",
      ),
    );
  for (const group of available) {
    const section = el("section", undefined, "entry");
    section.append(el("h3", group.title), versionHistory(group));
    catalogPanel!.append(section);
  }
  const check = button("Recheck browser setup", () =>
    run(check, async () => {
      await request("resync");
      await render();
    }),
  );
  settingsPanel!.append(
    el("h2", "Browser setup"),
    check,
    el(
      "p",
      "ToolGraft keeps diagnostics on this device. No accounts or tool-call telemetry. Optional usage analytics are controlled below.",
    ),
    link("Setup guide", chrome.runtime.getURL("/onboarding.html")),
  );
  settingsPanel!.dataset.settings = "true";
  await connectionLinkPreference(settingsPanel!);
}
function versionButton(id: string, item: VersionItem, primary = false) {
  const label =
    item.action === "rollback"
      ? `Review rollback to ${item.version}`
      : item.action === "update"
        ? `Review update ${item.version}`
        : `Review version ${item.version}`;
  const b = button(
    label,
    () =>
      run(b, async () =>
        review(
          await request<Stage>("stage-version", { id, version: item.version }),
        ),
      ),
    primary ? "primary" : "",
  );
  b.disabled = !!item.blocked || item.current;
  return b;
}
function versionHistory(group: VersionGroup) {
  const details = el("details", undefined, "version-history");
  details.append(el("summary", `Version history (${group.versions.length})`));
  const list = el("ol", undefined, "version-list");
  for (const item of group.versions) {
    const row = el("li");
    const heading = el("div", undefined, "row");
    heading.append(
      el("strong", item.version),
      el(
        "span",
        item.current
          ? "Installed"
          : item.retained
            ? "Saved locally"
            : item.source === "registry"
              ? "Catalog"
              : "Archive not saved",
        "meta",
      ),
    );
    row.append(
      heading,
      el(
        "p",
        `${item.review} · ${item.approvedAt ? `Approved ${new Date(item.approvedAt).toLocaleString()}` : item.publishedAt ? `Published ${new Date(item.publishedAt).toLocaleDateString()}` : "Not previously approved"}`,
        "meta",
      ),
    );
    const provenance = el("details");
    provenance.append(
      el("summary", "Source and identity"),
      el("p", `Source commit: ${item.sourceCommit}`, "meta"),
      el("code", `Manifest SHA-256 ${item.manifestSha256}`, "hash"),
    );
    row.append(provenance);
    if (item.blocked) row.append(el("p", item.blocked, "warning"));
    if (!item.current) row.append(versionButton(group.id, item));
    list.append(row);
  }
  details.append(
    list,
    el(
      "p",
      `Up to ${current.versions.retention.previousPerAdapter} previous packages per adapter are saved, within a shared ${current.versions.retention.historyByteLimit / 1024 / 1024} MiB history budget. Older metadata remains; unavailable archives need a reviewed download or exact local import. Removing an adapter clears its saved packages.`,
      "meta",
    ),
  );
  return details;
}
type Stage = {
  id: string;
  manifest: Manifest;
  hash: string;
  sourceCommit: string;
  review: string;
  plan: ActivationPlan;
};
function review(s: Stage) {
  const d = el("dialog");
  const m = s.manifest;
  const heading = el("h2", reviewTitle(s.plan, m));
  heading.tabIndex = -1;
  heading.setAttribute("autofocus", "");
  d.append(
    heading,
    el("p", `${m.version} · ${m.runtime.kind} adapter · ${s.review} review`),
    el("p", m.description),
  );
  if (m.runtime.kind === "script")
    d.append(
      el(
        "p",
        "This is executable JavaScript. It can read and change the approved site. Install only code you trust.",
        "warning",
      ),
    );
  if (s.review === "local")
    d.append(
      el(
        "p",
        "Local package: no public source review has been verified.",
        "warning",
      ),
    );
  d.append(el("h3", "Site access"));
  const hosts = el("ul");
  for (const h of m.permissions.hosts) hosts.append(el("li", h));
  d.append(hosts, el("h3", "Tools"));
  const list = el("ul", undefined, "tools");
  for (const t of m.tools)
    list.append(
      el(
        "li",
        `${t.name} · ${t.annotations.readOnlyHint ? "read" : "write — asks each time"} — ${t.description}`,
      ),
    );
  d.append(
    list,
    el("p", `Source commit: ${s.sourceCommit}`, "meta"),
    el("code", `Manifest SHA-256: ${s.hash}`, "hash"),
    link("View source", m.source),
  );
  const old = current.installIndex[m.id];
  appendVersionChange(d, s.plan, m);
  if (old) {
    if (
      /^[a-f0-9]{40}$/.test(old.sourceCommit) &&
      /^[a-f0-9]{40}$/.test(s.sourceCommit)
    )
      d.append(
        link(
          "View source diff",
          `https://github.com/particular-labs/toolgraft/compare/${old.sourceCommit}...${s.sourceCommit}`,
        ),
      );
  }
  const actions = el("div", undefined, "actions");
  const cancel = button("Cancel", () => d.close());
  const install = button(
    approvalLabel(s.plan, m),
    () => {
      // Keep request synchronous with the browser click gesture.
      const permission = chrome.permissions.request({
        origins: m.permissions.hosts,
      });
      void run(install, async () => {
        if (!(await permission))
          throw new Error("Site access was declined. Nothing was installed.");
        await request("install", {
          id: s.id,
          rollback: s.plan.action === "rollback",
        });
        d.close();
        await render();
        app.prepend(
          status("Installed. Reload matching tabs to activate this adapter."),
        );
      });
    },
    "primary",
  );
  install.disabled = !current.userScripts;
  actions.append(cancel, install);
  d.append(actions);
  d.onclose = () => d.remove();
  app.append(d);
  d.showModal();
  heading.focus();
}
async function confirmation() {
  const id = new URLSearchParams(location.search).get("request");
  const p = await request<{
    adapterId: string;
    tool: string;
    origin: string;
    preview: string;
    agentLabel?: string;
    expires: number;
  } | null>("confirmation", { id });
  if (!p) {
    app.append(
      el("h1", "Request expired"),
      el(
        "p",
        "The operation was denied. Return to your agent and call the tool again.",
      ),
    );
    return;
  }
  app.append(
    el("h1", "Approve this operation?"),
    el("p", `${p.adapterId} wants to run a write tool on ${p.origin}.`),
    el("h2", p.tool),
    el("pre", p.preview),
    el(
      "p",
      "Approve once applies only to this call. Closing this window denies the request.",
    ),
  );
  if (p.agentLabel) app.append(el("p", `Requested by ${p.agentLabel}`, "meta"));
  const actions = el("div", undefined, "actions");
  const decide = (approved: boolean) =>
    request("resolve-confirmation", { id, approved });
  const deny = button("Deny", () => void decide(false).catch(report));
  const yes = button(
    "Approve once",
    () => void decide(true).catch(report),
    "primary",
  );
  actions.append(deny, yes);
  app.append(actions);
  deny.focus();
  const timer = setTimeout(
    () => {
      yes.disabled = true;
      app.append(
        status("This request expired. The operation was denied.", true),
      );
    },
    Math.max(0, p.expires - Date.now()),
  );
  addEventListener("pagehide", () => clearTimeout(timer), { once: true });
}
void render();
