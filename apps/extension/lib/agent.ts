import {
  bridgeUrl,
  PROTOCOL_VERSION,
  BRIDGE_PORT,
  parseConnectionInvitation,
  type ReviewState,
  type TrialCase,
  type TrialResult,
  trialPassed,
} from "@toolgraft/agent-core";
import {
  matchesUrl,
  sha256,
  assertInput,
  revoked,
  type Package,
  type ActivationPlan,
  EXTENSION_VERSION,
} from "@toolgraft/adapter-schema";
import { unpack, pack } from "@toolgraft/adapter-schema/archive";
import {
  readStore,
  savePackage,
  serialized,
  planActivation,
  loadPackage,
} from "./store";
import { inspectDocument } from "./inspection";
import { scriptCode } from "./script-code";
import { versionCatalog, prepareVersion } from "./versions";
import { refreshRegistry } from "./registry";
import {
  cancelAdapter,
  beginManagedWrite,
  cancelManagedWrites,
} from "./broker";

type Session = {
  owner: string;
  id: string;
  url: string;
  intent: string;
  tabId?: number;
  expires: number;
};
type Review = {
  owner: string;
  agentLabel: string;
  id: string;
  kind: "access" | "install" | "trial";
  url: string;
  title: string;
  state: ReviewState;
  tests?: TrialCase[];
  results?: TrialResult[];
  trialTabId?: number;
  trialDocumentId?: string;
  trialTimer?: ReturnType<typeof setTimeout>;
  expires: number;
  sessionId: string;
  p?: Package;
  digest?: string;
  source?: string;
  error?: string;
  plan?: ActivationPlan;
  sourceCommit?: string;
  reviewLabel?: string;
};
type Runtime = {
  port: chrome.runtime.Port;
  adapterId: string;
  version: string;
  tabId: number;
  url: string;
  tools: string[];
  documentId?: string;
};
const trialTabs = new Map<number, Review>();
const sessions = new Map<string, Session>();
const reviews = new Map<string, Review>();
const runtimes = new Map<string, Runtime>();
const pending = new Map<
  string,
  {
    runtime: Runtime;
    write: boolean;
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const ownedTabs = new Set<number>();
const taskTabs = new Map<
  number,
  { url: string; retained: boolean; owner: string }
>();
const busyTabs = new Set<number>();
const opening = new Map<string, Promise<chrome.tabs.Tab>>();
let syncAdapters: () => Promise<void>;
let trialCleanup: Promise<void> = Promise.resolve();

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function documentState(tabId: number) {
  try {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      injectImmediately: true,
      func: () => ({
        url: location.href,
        ready: document.readyState !== "loading",
      }),
    });
    return frame?.result && frame.documentId
      ? { ...frame.result, documentId: frame.documentId }
      : undefined;
  } catch {
    return undefined;
  }
}
function ownTab(id: number, url: string, owner: string) {
  ownedTabs.add(id);
  taskTabs.set(id, { url, retained: false, owner });
}
const taskCount = (owner: string) =>
  [...taskTabs.values()].filter((t) => t.owner === owner).length;
async function releaseIdleTabs(owner: string, all = false) {
  let released = 0;
  for (const [id, task] of taskTabs) {
    if (!all && taskCount(owner) < 8) break;
    if (task.owner !== owner) continue;
    if (
      task.retained ||
      busyTabs.has(id) ||
      trialTabs.has(id) ||
      [...pending.values()].some((p) => p.runtime.tabId === id) ||
      [...reviews.values()].some(
        (r) =>
          r.url === task.url &&
          ["awaiting_approval", "testing", "tested"].includes(r.state) &&
          r.expires > Date.now(),
      )
    )
      continue;
    const tab = await chrome.tabs.get(id).catch(() => undefined);
    if (!tab || (tab.pendingUrl ?? tab.url) !== task.url) {
      ownedTabs.delete(id);
      taskTabs.delete(id);
      continue;
    }
    if (tab.active || tab.pinned || tab.audible) continue;
    if (
      busyTabs.has(id) ||
      task.retained ||
      [...pending.values()].some((p) => p.runtime.tabId === id)
    )
      continue;
    await chrome.tabs.remove(id).catch(() => {});
    ownedTabs.delete(id);
    taskTabs.delete(id);
    released++;
  }
  return released;
}
function website(value: string) {
  const u = new URL(value);
  if (
    (u.protocol !== "https:" &&
      !(u.protocol === "http:" && u.hostname === "localhost")) ||
    u.username ||
    u.password
  )
    throw new Error(
      "Use an HTTPS website or HTTP localhost without credentials.",
    );
  return u;
}
const host = (url: string) => {
  const u = website(url);
  return `${u.protocol}//${u.hostname}/*`;
};
const granted = (url: string) =>
  chrome.permissions.contains({ origins: [host(url)] });
function session(id: string) {
  const s = sessions.get(id);
  if (!s || s.expires < Date.now())
    throw new Error("Authoring session expired. Begin again.");
  return s;
}
function review(id: string) {
  const r = reviews.get(id);
  if (!r)
    throw new Error(
      "Request not found. It may have expired after a browser restart.",
    );
  if (r.state === "awaiting_approval" && r.expires < Date.now())
    r.state = "expired";
  return r;
}
function publicReview(r: Review, includeSource = false) {
  return {
    id: r.id,
    kind: r.kind,
    url: r.url,
    title: r.title,
    state: r.state,
    agentLabel: r.agentLabel,
    expires: r.expires,
    manifest: r.p?.manifest,
    digest: r.digest,
    source: includeSource ? r.source : undefined,
    error: r.error,
    plan: r.plan,
    reviewLabel: r.reviewLabel ?? "local",
    sourceCommit: r.sourceCommit ?? "local",
    tests: r.tests,
    results: r.results,
  };
}
async function createReview(r: Review) {
  reviews.set(r.id, r);
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`/agent.html?request=${r.id}`),
  });
  return publicReview(r);
}
async function openPage(
  url: string,
  expected?: { adapterId: string; version: string },
  owner = "",
) {
  website(url);
  const inFlight = opening.get(url);
  if (inFlight) return inFlight;
  const promise = (async () => {
    const all = await chrome.tabs.query({});
    const exact = all.filter((t) => {
      if (
        (t.pendingUrl ?? t.url) !== url ||
        t.incognito ||
        trialTabs.has(t.id!)
      )
        return false;
      const live = expected
        ? runtimes.get(`${t.id}:${expected.adapterId}`)
        : undefined;
      return !live || live.version === expected!.version;
    });
    // Browser tab position is not creation order: a kept update's new tab may
    // be inserted before an older task tab. Prefer our most recently opened tab.
    const own = [...ownedTabs]
      .reverse()
      .map((id) => exact.find((t) => t.id === id))
      .find(Boolean);
    if (exact.length > 1 && !own)
      throw new Error(
        "Several matching tabs are open. Use a distinct account URL or leave one matching tab open.",
      );
    let tab = own ?? exact[0];
    if (!tab) {
      await releaseIdleTabs(owner);
      if (taskCount(owner) >= 8)
        throw new Error(
          "ToolGraft's remaining task tabs are in use or have been opened by you. Finish the pending task or close a tab you no longer need; repeating this request will not help.",
        );
      tab = await chrome.tabs.create({ url, active: false });
      if (tab.id !== undefined) ownTab(tab.id, url, owner);
    } else if (tab.discarded) await chrome.tabs.reload(tab.id!);
    return tab;
  })();
  opening.set(url, promise);
  try {
    return await promise;
  } finally {
    opening.delete(url);
  }
}
async function sessionPage(s: Session) {
  if (!(await granted(s.url))) return { state: "needs_site_access" };
  let tab =
    s.tabId !== undefined
      ? await chrome.tabs.get(s.tabId).catch(() => undefined)
      : undefined;
  if (!tab) {
    tab = await openPage(s.url, undefined, s.owner);
    if (tab.id !== undefined) s.tabId = tab.id;
  }
  const deadline = Date.now() + 20000;
  let doc;
  busyTabs.add(tab.id!);
  try {
    while (Date.now() < deadline) {
      doc = await documentState(tab.id!);
      if (doc?.ready) break;
      await pause(150);
    }
  } finally {
    busyTabs.delete(tab.id!);
  }
  if (!doc?.ready)
    return {
      state: "page_loading",
      tabId: tab.id,
      nextAction: "Wait briefly and inspect again.",
    };
  if (doc.url !== s.url)
    return {
      state: "login_or_navigation_required",
      tabId: tab.id,
      url: doc.url,
    };
  return {
    state: "ready",
    tabId: tab.id,
    url: doc.url,
    documentId: doc.documentId,
  };
}
function clearRuntime(r: Runtime) {
  if (runtimes.get(`${r.tabId}:${r.adapterId}`) === r)
    runtimes.delete(`${r.tabId}:${r.adapterId}`);
  for (const [id, p] of pending)
    if (p.runtime === r) {
      clearTimeout(p.timer);
      pending.delete(id);
      p.reject(
        new Error(
          "Page changed or disconnected. Outcome unknown; do not automatically repeat writes.",
        ),
      );
    }
  // Loading can invalidate readiness while the old document still has a live
  // port. Disconnect it so the managed runtime re-registers; never replay calls.
  try {
    r.port.disconnect();
  } catch {}
}
export function setupAgent(sync: () => Promise<void>) {
  syncAdapters = sync;
  trialCleanup = chrome.storage.session.get("trialTabs").then(async (data) => {
    for (const id of Array.isArray(data.trialTabs) ? data.trialTabs : [])
      await chrome.tabs.remove(id).catch(() => {});
    await chrome.storage.session.remove("trialTabs");
  });
  chrome.runtime.onUserScriptConnect.addListener((port) => {
    if (port.name !== "toolgraft-managed") return;
    let registered: Runtime | undefined;
    port.onMessage.addListener(async (m) => {
      try {
        if (m?.type === "ready" && !registered) {
          const sender = port.sender,
            tabId = sender?.tab?.id;
          if (
            tabId === undefined ||
            sender?.frameId !== 0 ||
            !sender.url ||
            typeof m.adapterId !== "string"
          )
            throw new Error("Invalid runtime");
          const s = await readStore();
          const trial = trialTabs.get(tabId);
          const r = trial
            ? trial.state === "testing" &&
              trial.p!.manifest.id === m.adapterId &&
              trial.trialDocumentId === sender.documentId
              ? { manifest: trial.p!.manifest, state: "ok" }
              : undefined
            : s.installIndex[m.adapterId];
          if (
            !r ||
            r.state !== "ok" ||
            r.manifest.version !== m.version ||
            !r.manifest.matches.some((p) => matchesUrl(p, sender.url!)) ||
            !(await granted(sender.url))
          )
            throw new Error("Runtime not installed");
          const tools = Array.isArray(m.tools)
            ? m.tools.filter(
                (n: unknown) =>
                  typeof n === "string" &&
                  r.manifest.tools.some((t) => t.name === n),
              )
            : [];
          registered = {
            port,
            tabId,
            adapterId: m.adapterId,
            version: m.version,
            url: String(m.url),
            tools,
            ...(sender.documentId ? { documentId: sender.documentId } : {}),
          };
          const key = `${tabId}:${m.adapterId}`;
          const old = runtimes.get(key);
          if (old) clearRuntime(old);
          runtimes.set(key, registered);
        } else if (m?.type === "result" && registered) {
          const p = pending.get(m.id);
          if (p?.runtime !== registered) return;
          clearTimeout(p.timer);
          pending.delete(m.id);
          p.resolve(m.result);
        }
      } catch {
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      if (registered) clearRuntime(registered);
    });
  });
  chrome.tabs.onRemoved.addListener((id) => {
    ownedTabs.delete(id);
    taskTabs.delete(id);
    const trial = trialTabs.get(id);
    if (trial) {
      trialTabs.delete(id);
      if (["testing", "tested"].includes(trial.state)) {
        trial.state = "expired";
        trial.error = "Trial tab closed. Ask your agent to resume.";
      }
    }
    for (const r of runtimes.values()) if (r.tabId === id) clearRuntime(r);
  });
  chrome.tabs.onUpdated.addListener((id, change) => {
    const task = taskTabs.get(id);
    if (task && change.url && change.url !== task.url) task.retained = true;
    const trial = trialTabs.get(id);
    if (
      trial &&
      trial.trialDocumentId &&
      (change.status === "loading" || (change.url && change.url !== trial.url))
    ) {
      trial.state = "expired";
      trial.error = "Trial page navigated. Ask your agent to resume.";
      void closeTrial(trial);
    }
    if (change.status === "loading")
      for (const r of runtimes.values()) if (r.tabId === id) clearRuntime(r);
  });
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    const task = taskTabs.get(tabId);
    if (task) task.retained = true;
  });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === "agent-reconnect") void reconnect().catch(() => {});
  });
  void chrome.alarms.create("agent-reconnect", { periodInMinutes: 0.5 });
  void reconnect().catch(() => {});
}
type SavedConnection = {
  port: number;
  token: string;
  agentId?: string;
  label: string;
};
type Connection = {
  socket: WebSocket;
  state: string;
  heartbeat?: ReturnType<typeof setInterval>;
};
const connections = new Map<string, Connection>();
const connectionKey = (port: number, agentId?: string) =>
  `${port}:${agentId ?? "legacy"}`;
function endOwner(prefix: string) {
  cancelManagedWrites(prefix);
  for (const [id, s] of sessions)
    if (s.owner.startsWith(prefix)) sessions.delete(id);
  for (const r of reviews.values())
    if (
      r.owner.startsWith(prefix) &&
      ["awaiting_approval", "testing", "tested"].includes(r.state)
    ) {
      r.state = "expired";
      void closeTrial(r);
    }
}
async function storedConnections(): Promise<Record<string, SavedConnection>> {
  return serialized(async () => {
    const data = await chrome.storage.local.get([
      "agentConnections",
      "agentConnection",
    ]);
    const value = (data.agentConnections ?? {}) as Record<
      string,
      SavedConnection
    >;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Unreadable agent connections");
    if (data.agentConnection && !data.agentConnections) {
      const old = data.agentConnection as SavedConnection;
      value[connectionKey(old.port)] = {
        ...old,
        label: "Previous agent connection",
      };
      await chrome.storage.local.set({ agentConnections: value });
      await chrome.storage.local.remove("agentConnection");
    }
    for (const [key, c] of Object.entries(value) as [
      string,
      SavedConnection,
    ][]) {
      bridgeUrl(c.port, c.agentId);
      if (
        key !== connectionKey(c.port, c.agentId) ||
        !/^[a-f0-9]{64}$/.test(c.token) ||
        typeof c.label !== "string"
      )
        throw new Error("Unreadable agent connection");
    }
    return value;
  });
}
async function reconnect() {
  const saved = await storedConnections();
  for (const [key, c] of Object.entries(saved)) {
    if (connections.has(key)) continue;
    void connect(c.port, c.token, false, c.agentId, c.label).catch(() => {});
  }
}
async function connect(
  port: number,
  credential: string,
  pair: boolean | "invite",
  agentId?: string,
  label = "Local agent",
) {
  const url = bridgeUrl(port, agentId);
  const key = connectionKey(port, agentId);
  const previous = connections.get(key);
  previous?.socket.close();
  if (previous?.heartbeat) clearInterval(previous.heartbeat);
  const ws = new WebSocket(url);
  const connection: Connection = { socket: ws, state: "connecting" };
  connections.set(key, connection);
  return new Promise<void>((resolve, reject) => {
    let connected = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(
        new Error(
          "Connection timed out. Start the MCP in your agent and try again.",
        ),
      );
    }, 7000);
    const active = () => {
      if (
        connections.get(key) !== connection ||
        ws.readyState !== WebSocket.OPEN ||
        !connected
      )
        throw new Error(
          "Agent disconnected. Do not automatically repeat writes.",
        );
    };
    ws.onopen = () =>
      ws.send(
        JSON.stringify(
          pair === "invite"
            ? { type: "invite", ticket: credential }
            : pair
              ? { type: "pair", code: credential }
              : { type: "auth", token: credential },
        ),
      );
    ws.onmessage = async (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "connected") {
          if (
            connected ||
            m.protocol !== PROTOCOL_VERSION ||
            (agentId && m.agent?.id !== agentId)
          )
            throw new Error("Protocol mismatch");
          if (connections.get(key) !== connection)
            throw new Error("Superseded connection");
          label = String(m.agent?.label ?? label).slice(0, 80);
          if (pair) {
            if (typeof m.token !== "string" || !/^[a-f0-9]{64}$/.test(m.token))
              throw new Error("Missing connection credential");
            await serialized(async () => {
              if (connections.get(key) !== connection)
                throw new Error("Superseded connection");
              const saved = ((
                await chrome.storage.local.get("agentConnections")
              ).agentConnections ?? {}) as Record<string, SavedConnection>;
              saved[key] = {
                port,
                token: m.token,
                label: String(m.agent?.label ?? label).slice(0, 80),
                ...(agentId ? { agentId } : {}),
              };
              await chrome.storage.local.set({ agentConnections: saved });
            });
          }
          connected = true;
          clearTimeout(timeout);
          connection.state = "connected";
          connection.heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "ping" }));
          }, 20000);
          resolve();
          return;
        }
        if (
          m.type === "session-ended" &&
          connected &&
          /^[a-f0-9]{64}$/.test(m.owner)
        ) {
          endOwner(`${key}:${m.owner}`);
          return;
        }
        if (m.type === "request" && connected && typeof m.id === "string") {
          const owner = `${key}:${agentId ? m.owner : "legacy"}`;
          if (
            agentId &&
            (typeof m.owner !== "string" || !/^[a-f0-9]{64}$/.test(m.owner))
          )
            throw new Error("Invalid session identity");
          try {
            active();
            const value = await handleAgent(
              m.method,
              m.args ?? {},
              owner,
              label,
              active,
            );
            active();
            ws.send(
              JSON.stringify({ type: "response", id: m.id, ok: true, value }),
            );
          } catch (error) {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(
                JSON.stringify({
                  type: "response",
                  id: m.id,
                  ok: false,
                  error: error instanceof Error ? error.message : String(error),
                }),
              );
          }
        }
      } catch {
        ws.close();
      }
    };
    ws.onerror = () =>
      reject(
        new Error(
          "Cannot reach the local MCP. Check that your agent started it on the same computer.",
        ),
      );
    ws.onclose = () => {
      clearTimeout(timeout);
      if (connection.heartbeat) clearInterval(connection.heartbeat);
      if (connections.get(key) !== connection) return;
      connections.delete(key);
      endOwner(key + ":");
      if (!connected)
        reject(
          new Error(
            "Connection refused. Ask your agent for a fresh connection link.",
          ),
        );
      else setTimeout(() => void reconnect().catch(() => {}), 2000);
    };
  });
}
async function connectionStatus() {
  const saved = await storedConnections();
  const agents = Object.entries(saved).map(([id, c]) => ({
    id,
    label: c.label,
    port: c.port,
    state: connections.get(id)?.state ?? "disconnected",
  }));
  return {
    state: agents.some((a) => a.state === "connected")
      ? "connected"
      : "disconnected",
    port: agents[0]?.port ?? BRIDGE_PORT,
    agents,
  };
}
export async function agentUI(type: string, a: any) {
  if (type === "agent-connection") return connectionStatus();
  if (type === "agent-connect-invitation") {
    const invitation = parseConnectionInvitation(String(a.url));
    if (!invitation)
      throw new Error(
        "Invalid connection link. Ask your agent for a fresh link.",
      );
    await storedConnections();
    await connect(
      invitation.port,
      invitation.ticket,
      "invite",
      invitation.agentId,
      invitation.label,
    );
    return connectionStatus();
  }
  if (type === "agent-pair") {
    if (!/^\d{8}$/.test(a.code))
      throw new Error("Enter the eight-digit pairing code.");
    await storedConnections();
    await connect(Number(a.port), a.code, true, a.agentId || undefined);
    return connectionStatus();
  }
  if (type === "agent-disconnect") {
    const saved = await storedConnections();
    const key =
      typeof a.id === "string"
        ? a.id
        : Object.keys(saved).length === 1
          ? Object.keys(saved)[0]
          : undefined;
    if (!key || !saved[key]) throw new Error("Choose the agent to disconnect.");
    const c = connections.get(key);
    connections.delete(key);
    if (c?.heartbeat) clearInterval(c.heartbeat);
    if (c?.socket.readyState === WebSocket.OPEN)
      c.socket.send(JSON.stringify({ type: "revoke" }));
    c?.socket.close();
    await serialized(async () => {
      const data = ((await chrome.storage.local.get("agentConnections"))
        .agentConnections ?? {}) as Record<string, SavedConnection>;
      delete data[key];
      await chrome.storage.local.set({ agentConnections: data });
    });
    endOwner(key + ":");
    return true;
  }
  if (type === "agent-review") return publicReview(review(a.id), true);
  if (type === "agent-keep-trial") {
    const r = review(a.id);
    if (r.kind !== "trial" || r.state !== "tested" || r.expires < Date.now())
      throw new Error("Trial is no longer ready. Ask your agent to resume.");
    if (!a.approved) {
      r.state = "declined";
      await closeTrial(r);
      return publicReview(r);
    }
    r.state = "testing";
    try {
      await installReview(r);
      r.state = "installed";
    } catch (e) {
      r.state = "failed";
      r.error = String(e);
      throw e;
    } finally {
      await closeTrial(r);
    }
    return publicReview(r);
  }
  if (type === "agent-resolve") {
    const r = review(a.id);
    if (r.state !== "awaiting_approval")
      throw new Error("This review is no longer pending.");
    if (!a.approved) {
      r.state = "declined";
      return publicReview(r);
    }
    if (!(await granted(r.url)))
      throw new Error("Site access was not granted.");
    if (r.kind === "access") {
      r.state = "approved";
      await sessionPage(session(r.sessionId));
      return publicReview(r);
    }
    if (r.kind === "trial") {
      r.state = "testing";
      void runTrial(r);
      return publicReview(r);
    }
    try {
      await installReview(r, a.rollback === true);
      r.state = "installed";
      return publicReview(r);
    } catch (e) {
      r.state = "failed";
      r.error = String(e);
      throw e;
    }
  }
  throw new Error("Unknown agent UI request");
}
async function installReview(r: Review, rollback = false) {
  await serialized(async () => {
    await chrome.userScripts.getScripts();
    if (
      !["awaiting_approval", "testing"].includes(r.state) ||
      r.expires < Date.now()
    )
      throw new Error("Approval expired. Ask your agent to resume.");
    if (
      !(await chrome.permissions.contains({
        origins: r.p!.manifest.permissions.hosts,
      }))
    )
      throw new Error("Site access was not granted.");
    await savePackage(
      r.p!,
      r.sourceCommit ?? "local",
      r.reviewLabel ?? "local",
      {
        fromHash: r.plan!.fromHash,
        rollback,
        launchUrl: r.url,
      },
    );
    cancelAdapter(r.p!.manifest.id);
    await syncAdapters();
  });
  // New registration runs on the next document. Keep existing tabs untouched.
  const fresh = await chrome.tabs.create({ url: r.url, active: false });
  if (fresh.id !== undefined) ownTab(fresh.id, r.url, r.owner);
}
async function ensure(adapterId: string, url?: string, owner = "") {
  const s = await readStore(),
    r = s.installIndex[adapterId];
  if (!r || r.state !== "ok" || revoked(r.manifest, s.revocations))
    throw new Error("Adapter is not installed and active.");
  const stored = (await chrome.storage.local.get(`agent-launch:${adapterId}`))[
    `agent-launch:${adapterId}`
  ];
  const requested = url ?? stored;
  if (typeof requested !== "string")
    throw new Error(
      "No launch URL is saved. Call toolgraft_find_tools for this adapter's matches, then supply a matching website URL. No repository files are needed.",
    );
  const target = website(requested).href;
  if (!r.manifest.matches.some((p) => matchesUrl(p, target)))
    throw new Error(
      "URL does not match this adapter route. Call toolgraft_find_tools for launchUrl and matches; omit url to reuse a valid saved launch URL.",
    );
  if (!(await granted(target)))
    throw new Error(
      "Site access is missing. Grant it in the extension before calling tools.",
    );
  const tab = await openPage(
    target,
    {
      adapterId,
      version: r.manifest.version,
    },
    owner,
  );
  const deadline = Date.now() + 20000;
  let injectedDocument: string | undefined;
  busyTabs.add(tab.id!);
  try {
    while (Date.now() < deadline) {
      const live = runtimes.get(`${tab.id}:${adapterId}`);
      if (live && live.version === r.manifest.version && live.url === target) {
        if (url && stored !== target)
          await chrome.storage.local.set({
            [`agent-launch:${adapterId}`]: target,
          });
        return live;
      }
      const current = await chrome.tabs.get(tab.id!);
      const doc = await documentState(tab.id!);
      if (doc?.ready && doc.url !== target)
        throw new Error(
          "The website redirected. Inspect the opened page and use its confirmed address; do not repeat the same call.",
        );
      if (
        doc?.ready &&
        doc.url === target &&
        injectedDocument !== doc.documentId &&
        r.manifest.runtime.kind === "script"
      ) {
        const currentStore = await readStore();
        const latest = currentStore.installIndex[adapterId];
        if (
          !latest ||
          latest.state !== "ok" ||
          revoked(latest.manifest, currentStore.revocations) ||
          latest.manifestSha256 !== r.manifestSha256 ||
          !(await granted(target))
        )
          throw new Error(
            "Adapter or site access changed. Discover tools again.",
          );
        const p = await loadPackage(r.manifest);
        injectedDocument = doc.documentId;
        try {
          await chrome.userScripts.execute({
            injectImmediately: true,
            target: { tabId: tab.id!, documentIds: [doc.documentId] },
            world: "USER_SCRIPT",
            worldId: adapterId,
            js: [{ code: scriptCode(p) }],
          });
        } catch (error) {
          // Navigation can replace the checked document while its package loads.
          // Recheck readiness; no website tool has been invoked at this point.
          if (!/No document with id/.test(String(error))) throw error;
        }
      }
      if (
        current.status === "complete" &&
        current.url &&
        new URL(current.url).origin !== new URL(target).origin
      )
        throw new Error("Login or navigation is required in the opened tab.");
      await pause(150);
    }
  } finally {
    busyTabs.delete(tab.id!);
  }
  throw new Error(
    "Adapter did not register on this page. Check login and route. Legacy native-only packages need a managed rebuild for this connection.",
  );
}
async function handleAgent(
  method: string,
  a: any,
  owner: string,
  agentLabel: string,
  active: () => void,
): Promise<unknown> {
  // Compare the browser's serialized URL, including a root slash and encoded
  // characters. Equivalent URL spellings must not look like a login redirect.
  if (a.url !== undefined) a = { ...a, url: website(a.url).href };
  const ownedReview = (r: Review) => {
    active();
    return createReview(r);
  };
  if (a.sessionId && session(a.sessionId).owner !== owner)
    throw new Error("Authoring session belongs to another agent session.");
  if (a.requestId && review(a.requestId).owner !== owner)
    throw new Error("Review belongs to another agent session.");
  if (method === "status") {
    const s = await readStore();
    return {
      extensionVersion: EXTENSION_VERSION,
      pendingReviews: [...reviews.values()]
        .filter((r) => r.owner === owner)
        .map((r) => review(r.id))
        .filter((r) =>
          ["awaiting_approval", "testing", "tested"].includes(r.state),
        )
        .map(({ id, kind, title, state, expires }) => ({
          requestId: id,
          kind,
          title,
          state,
          expires,
        })),
      versions: await versionCatalog(s),
      installed: Object.values(s.installIndex).map((r) => ({
        id: r.manifest.id,
        title: r.manifest.title,
        version: r.manifest.version,
        state: r.state,
      })),
      userScripts: await (async () => {
        try {
          await chrome.userScripts.getScripts();
          return true;
        } catch {
          return false;
        }
      })(),
    };
  }
  if (method === "edit-source") {
    return serialized(async () => {
      active();
      const s = await readStore(),
        r = s.installIndex[a.adapterId];
      if (!r || r.state !== "ok" || revoked(r.manifest, s.revocations))
        throw new Error("Adapter is not installed and active.");
      const stored = (
        await chrome.storage.local.get(`agent-launch:${a.adapterId}`)
      )[`agent-launch:${a.adapterId}`];
      const url = a.url ?? stored;
      if (
        typeof url !== "string" ||
        !r.manifest.matches.some((pattern) => matchesUrl(pattern, url))
      )
        throw new Error(
          "Supply a matching authoring URL. Use toolgraft_find_tools for launchUrl and matches.",
        );
      website(url);
      const p = await loadPackage(r.manifest);
      const bytes = await pack(p);
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return { bytes: btoa(binary), url, manifestSha256: r.manifestSha256 };
    });
  }
  if (method === "versions") {
    if (a.refresh === true)
      await serialized(async () => {
        await refreshRegistry();
        await syncAdapters();
      });
    const result = await versionCatalog();
    return {
      ...result,
      adapters: a.adapterId
        ? result.adapters.filter((g) => g.id === a.adapterId)
        : result.adapters,
    };
  }
  if (method === "request-version") {
    const candidate = await serialized(() =>
      prepareVersion(String(a.adapterId), String(a.version)),
    );
    const { p, plan } = candidate;
    const stored = (
      await chrome.storage.local.get(`agent-launch:${p.manifest.id}`)
    )[`agent-launch:${p.manifest.id}`];
    const url =
      a.url ??
      [
        candidate.launchUrl,
        stored,
        ...p.manifest.matches.filter((pattern) => !pattern.includes("*")),
      ].find(
        (value) =>
          typeof value === "string" &&
          p.manifest.matches.some((pattern) => matchesUrl(pattern, value)),
      );
    if (
      typeof url !== "string" ||
      !p.manifest.matches.some((pattern) => matchesUrl(pattern, url))
    )
      throw new Error("Supply a matching URL for the requested version.");
    website(url);
    const r = await ownedReview({
      id: crypto.randomUUID(),
      owner,
      agentLabel,
      kind: "install",
      sessionId: "",
      url,
      title: p.manifest.title,
      state: "awaiting_approval",
      expires: Date.now() + 600000,
      p,
      plan,
      source: p.payload,
      sourceCommit: candidate.sourceCommit,
      reviewLabel: candidate.review,
      digest: await sha256(await pack(p)),
    });
    return {
      requestId: r.id,
      state: r.state,
      action: plan.action,
      nextAction:
        "The user must approve this version in the extension. Then check install status and verify a tool call.",
    };
  }
  if (method === "find-tools") {
    const s = await readStore();
    const q = String(a.query ?? "").toLowerCase();
    const records = Object.values(s.installIndex);
    const launches = await chrome.storage.local.get(
      records.map((r) => `agent-launch:${r.manifest.id}`),
    );
    const results = records.flatMap((r) => {
      const saved = launches[`agent-launch:${r.manifest.id}`];
      const launchUrl =
        typeof saved === "string" &&
        r.manifest.matches.some((pattern) => matchesUrl(pattern, saved))
          ? saved
          : null;
      return r.manifest.tools.map((t) => ({
        adapterId: r.manifest.id,
        version: r.manifest.version,
        state: r.state,
        ...t,
        matches: r.manifest.matches,
        launchUrl,
      }));
    });
    const haystack = (t: (typeof results)[number]) =>
      `${t.adapterId} ${t.name} ${t.description}`.toLowerCase();
    const exact = results.filter((t) => haystack(t).includes(q));
    if (exact.length) return exact;
    return results
      .map((t) => ({
        t,
        score: q
          .split(/[^\p{L}\p{N}]+/u)
          .filter(Boolean)
          .reduce((n, word) => n + Number(haystack(t).includes(word)), 0),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.t);
  }
  if (method === "begin-authoring") {
    website(a.url);
    const id = crypto.randomUUID();
    const s = {
      id,
      owner,
      url: String(a.url),
      intent: String(a.intent).slice(0, 1000),
      expires: Date.now() + 3600000,
    };
    sessions.set(id, s);
    if (!(await granted(s.url))) {
      const r = await ownedReview({
        id: crypto.randomUUID(),
        owner,
        agentLabel,
        kind: "access",
        sessionId: id,
        url: s.url,
        title: "Allow your agent to inspect this site",
        state: "awaiting_approval",
        expires: Date.now() + 600000,
      });
      return {
        sessionId: id,
        state: "awaiting_site_access",
        requestId: r.id,
        nextAction:
          "Approve site access in the ToolGraft browser tab, then inspect.",
      };
    }
    return { sessionId: id, ...(await sessionPage(s)) };
  }
  if (method === "check-session") {
    const s = session(a.sessionId);
    if (s.url !== a.url)
      throw new Error("Draft URL differs from authoring session.");
    return true;
  }
  if (method === "inspect") {
    const s = session(a.sessionId),
      state = await sessionPage(s);
    if (state.state !== "ready") return state;
    const result = await chrome.scripting.executeScript({
      target: { tabId: state.tabId!, documentIds: [state.documentId!] },
      injectImmediately: true,
      func: inspectDocument,
      args: [
        {
          selector: a.selector,
          selectors: a.selectors,
          offset: a.offset ?? 0,
          limit: a.limit ?? 40,
        },
      ],
    });
    return result[0]?.result ?? { state: "not_ready" };
  }
  if (method === "release-pages")
    return { released: await releaseIdleTabs(owner, true) };
  if (method === "request-package-install") {
    website(a.url);
    if (typeof a.bytes !== "string" || a.bytes.length > 1500000)
      throw new Error("Package exceeds size limit.");
    const bytes = Uint8Array.from(atob(a.bytes), (c) => c.charCodeAt(0));
    const p = await unpack(bytes);
    if (!p.manifest.matches.some((m) => matchesUrl(m, a.url)))
      throw new Error("The launch URL does not match this adapter.");
    const r = await ownedReview({
      id: crypto.randomUUID(),
      owner,
      agentLabel,
      sessionId: "",
      kind: "install",
      url: a.url,
      title: p.manifest.title,
      state: "awaiting_approval",
      expires: Date.now() + 600000,
      p,
      plan: await planActivation(p),
      digest: await sha256(bytes),
      source: p.payload,
      sourceCommit: "local",
      reviewLabel: "local",
    });
    return {
      requestId: r.id,
      state: r.state,
      nextAction:
        "The user must review and approve source and site access in the extension. Check install status, then verify a tool call.",
    };
  }
  if (method === "request-install" || method === "request-trial") {
    const s = session(a.sessionId);
    if (s.url !== a.url)
      throw new Error("Candidate URL differs from the authoring session.");
    if (typeof a.bytes !== "string" || a.bytes.length > 1500000)
      throw new Error("Package exceeds size limit.");
    const bytes = Uint8Array.from(atob(a.bytes), (c) => c.charCodeAt(0));
    const p = await unpack(bytes);
    const plan = await planActivation(p);
    if (
      a.baseManifestSha256 !== undefined &&
      a.baseManifestSha256 !== plan.fromHash
    )
      throw new Error(
        "Installed adapter changed since editing began. Start a new edit from the current version.",
      );
    if (
      !p.manifest.matches.some((m) => matchesUrl(m, s.url)) ||
      p.manifest.permissions.hosts.some((h) => h !== host(s.url))
    )
      throw new Error("Candidate permissions must match the inspected site.");
    const tests =
      method === "request-trial" ? validateTrialTests(p, a.tests) : undefined;
    const r = await ownedReview({
      id: crypto.randomUUID(),
      owner,
      agentLabel,
      sessionId: s.id,
      kind: tests ? "trial" : "install",
      ...(tests ? { tests } : {}),
      url: s.url,
      title: p.manifest.title,
      state: "awaiting_approval",
      expires: Date.now() + 600000,
      p,
      plan,
      digest: await sha256(bytes),
      source: p.payload,
    });
    return {
      requestId: r.id,
      state: r.state,
      nextAction: tests
        ? "Tell the user to choose Try update in the review tab, then use toolgraft_wait with this requestId. Inspect the results before the user chooses Keep update. Never approve for the user."
        : "Review and approve the candidate in the extension, then check install status.",
    };
  }
  if (method === "install-status") return publicReview(review(a.requestId));
  if (method === "ensure-page" || method === "call") {
    const r = await ensure(a.adapterId, a.url, owner);
    if (method === "ensure-page")
      return {
        state: "ready",
        tabId: r.tabId,
        url: r.url,
        adapterId: r.adapterId,
        version: r.version,
        tools: r.tools,
      };
    const s = await readStore(),
      record = s.installIndex[r.adapterId];
    if (
      !record ||
      record.state !== "ok" ||
      revoked(record.manifest, s.revocations) ||
      record.manifest.version !== r.version ||
      !(await granted(r.url))
    )
      throw new Error("Adapter changed. Rediscover before calling.");
    const tool = record.manifest.tools.find(
      (t) => t.name === a.tool && r.tools.includes(t.name),
    );
    if (!tool) throw new Error("Tool is not registered in this page.");
    return invokeRuntime(r, tool, a.input, owner, agentLabel, active);
  }
  throw new Error("Unknown core operation");
}

async function invokeRuntime(
  r: Runtime,
  tool: Package["manifest"]["tools"][number],
  args: unknown,
  owner: string,
  agentLabel: string,
  active: () => void,
  timeout = 135000,
) {
  const input = assertInput(tool, args ?? {}),
    id = crypto.randomUUID();
  active();
  const isWrite =
    !tool.annotations.readOnlyHint || tool.annotations.destructiveHint;
  if (
    [...pending.values()].some(
      (p) => p.runtime.tabId === r.tabId && (isWrite || p.write),
    )
  )
    throw new Error(
      "Another operation is using this page. Wait for its result, then rediscover before acting.",
    );
  const finishWrite = isWrite
    ? beginManagedWrite(id, {
        owner,
        agentLabel,
        tabId: r.tabId,
        adapterId: r.adapterId,
        tool: tool.name,
      })
    : () => {};
  const result = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          "Tool response timed out. Outcome unknown; do not repeat a write automatically.",
        ),
      );
    }, timeout);
    pending.set(id, { runtime: r, resolve, reject, timer, write: !!isWrite });
    r.port.postMessage({ type: "call", id, tool: tool.name, input });
  }).finally(finishWrite);
  return {
    tabId: r.tabId,
    url: r.url,
    adapterId: r.adapterId,
    version: r.version,
    result,
  };
}

function validateTrialTests(p: Package, value: unknown): TrialCase[] {
  if (
    p.manifest.runtime.kind !== "script" ||
    p.manifest.tools.some(
      (t) => !t.annotations.readOnlyHint || t.annotations.destructiveHint,
    )
  )
    throw new Error(
      "Browser trials currently support adapters declaring only read tools. Writes keep the existing explicit installation and per-call approval flow.",
    );
  if (!Array.isArray(value) || value.length < 1 || value.length > 5)
    throw new Error("Choose one to five read tests.");
  if (!value.some((test) => !test?.expectedError))
    throw new Error(
      "Include at least one successful read test alongside expected errors.",
    );
  return value.map((test) => {
    const tool = p.manifest.tools.find((t) => t.name === test?.tool);
    if (!tool) throw new Error("Trial tool is not in this candidate.");
    if (
      test.expectedError !== undefined &&
      !/^[A-Z][A-Z0-9_]{1,79}$/.test(test.expectedError)
    )
      throw new Error(
        "Expected error must be an exact application error code.",
      );
    return {
      tool: tool.name,
      input: assertInput(tool, test.input ?? {}),
      ...(test.expectedError ? { expectedError: test.expectedError } : {}),
    };
  });
}
async function closeTrial(r: Review) {
  if (r.trialTimer) clearTimeout(r.trialTimer);
  if (r.trialTabId !== undefined) {
    const id = r.trialTabId;
    trialTabs.delete(id);
    for (const runtime of runtimes.values())
      if (runtime.tabId === id) {
        clearRuntime(runtime);
        runtime.port.disconnect();
      }
    await chrome.tabs.remove(id).catch(() => {});
    delete r.trialTabId;
    await chrome.storage.session.set({ trialTabs: [...trialTabs.keys()] });
  }
  try {
    await chrome.userScripts.resetWorldConfiguration(`trial-${r.id}`);
  } catch {
    /* User Scripts may have been disabled while a trial was running. */
  }
}
async function runTrial(r: Review) {
  const active = () => {
    if (r.state !== "testing" || r.expires < Date.now())
      throw new Error(
        "Trial expired or disconnected. Ask your agent to resume.",
      );
  };
  try {
    active();
    await trialCleanup;
    if (trialTabs.size >= 3)
      throw new Error(
        "Three browser trials are already running. Wait for one to finish.",
      );
    const plan = await planActivation(r.p!);
    if (plan.fromHash !== r.plan!.fromHash)
      throw new Error("Installed version changed. Start a new edit.");
    await chrome.userScripts.getScripts();
    // Record an empty dedicated tab before navigation; never inject into the user's task tab.
    const tab = await chrome.tabs.create({ url: "about:blank", active: false });
    r.trialTabId = tab.id!;
    trialTabs.set(tab.id!, r);
    await chrome.storage.session.set({ trialTabs: [...trialTabs.keys()] });
    active();
    r.trialTimer = setTimeout(
      () => {
        if (["testing", "tested"].includes(r.state)) {
          r.state = "expired";
          void closeTrial(r);
        }
      },
      Math.max(1, r.expires - Date.now()),
    );
    await chrome.tabs.update(tab.id!, { url: r.url });
    const deadline = Date.now() + 25000;
    let document;
    while (Date.now() < deadline) {
      active();
      document = await documentState(tab.id!);
      if (document?.ready) {
        if (document.url !== r.url)
          throw new Error(
            "Trial page redirected. Inspect the destination before trying again.",
          );
        break;
      }
      await pause(150);
    }
    if (!document?.ready)
      throw new Error(
        "The website content is still loading. Ask your agent to retry the trial once it is available.",
      );
    r.trialDocumentId = document.documentId;
    active();
    if (!(await granted(r.url))) throw new Error("Site access was removed.");
    const worldId = `trial-${r.id}`;
    await chrome.userScripts.configureWorld({ worldId, messaging: true });
    active();
    await chrome.userScripts.execute({
      injectImmediately: true,
      target: { tabId: tab.id!, documentIds: [r.trialDocumentId] },
      world: "USER_SCRIPT",
      worldId,
      js: [{ code: r.p!.payload }],
    });
    const registrationDeadline = Date.now() + 10000;
    let runtime: Runtime | undefined;
    while (Date.now() < registrationDeadline) {
      active();
      runtime = runtimes.get(`${tab.id}:${r.p!.manifest.id}`);
      if (
        runtime?.version === r.p!.manifest.version &&
        runtime.documentId === r.trialDocumentId
      )
        break;
      runtime = undefined;
      await pause(100);
    }
    if (!runtime)
      throw new Error(
        "Trial tools did not register. Ask your agent to repair the candidate.",
      );
    r.results = [];
    for (const test of r.tests!) {
      active();
      if (!(await granted(r.url))) throw new Error("Site access was removed.");
      const currentPlan = await planActivation(r.p!);
      if (currentPlan.fromHash !== r.plan!.fromHash)
        throw new Error(
          "Installed version changed during trial. Start a new edit.",
        );
      const tool = r.p!.manifest.tools.find((t) => t.name === test.tool)!;
      try {
        const value = await invokeRuntime(
          runtime,
          tool,
          test.input,
          r.owner,
          r.agentLabel,
          active,
          25000,
        );
        active();
        const result = value.result as {
          isError?: boolean;
          content?: unknown[];
        };
        const passed = trialPassed(test, result);
        r.results.push({ ...test, result, passed });
      } catch (e) {
        active();
        r.results.push({ ...test, passed: false, error: String(e) });
      }
    }
    active();
    if (!r.results.every((result) => result.passed)) {
      r.state = "failed";
      r.error =
        "A test failed. The installed adapter is unchanged. Ask your agent to repair the draft.";
      await closeTrial(r);
    }
    // Stop trial code as soon as tests finish; keep only results and the exact candidate for Keep update.
    else {
      await closeTrial(r);
      active();
      r.state = "tested";
      r.trialTimer = setTimeout(
        () => {
          if (r.state === "tested") r.state = "expired";
        },
        Math.max(1, r.expires - Date.now()),
      );
    }
  } catch (e) {
    if (r.state !== "expired") r.state = "failed";
    r.error = String(e);
    await closeTrial(r);
  }
}

/** Trial authorization is bound to the approved tab/document and a pending read test. */
export async function authorizeTrial(
  message: any,
  sender: chrome.runtime.MessageSender,
): Promise<boolean | undefined> {
  const r =
    sender.tab?.id === undefined ? undefined : trialTabs.get(sender.tab.id);
  if (!r) return undefined;
  if (
    r.state !== "testing" ||
    r.expires < Date.now() ||
    sender.frameId !== 0 ||
    sender.documentId !== r.trialDocumentId ||
    sender.url !== r.url ||
    message.adapterId !== r.p!.manifest.id ||
    message.version !== r.p!.manifest.version
  )
    return false;
  const running = [...pending.values()].some(
    (p) =>
      p.runtime.tabId === r.trialTabId &&
      p.runtime.version === r.p!.manifest.version &&
      !p.write,
  );
  const s = await readStore();
  return (
    running && !revoked(r.p!.manifest, s.revocations) && (await granted(r.url))
  );
}
