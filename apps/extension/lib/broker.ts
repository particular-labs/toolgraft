import {
  assertInput,
  matchesUrl,
  type Manifest,
} from "@toolgraft/adapter-schema";
import { readStore } from "./store";
type Pending = {
  id: string;
  adapterId: string;
  tool: string;
  origin: string;
  preview: string;
  expires: number;
  tabId: number;
  windowId?: number;
  pageUrl: string;
  owner?: string;
  agentLabel?: string;
};
const pending = new Map<
  string,
  {
    request: Pending;
    port: chrome.runtime.Port;
    finish: (approved: boolean) => void;
  }
>();
type ManagedWrite = {
  owner: string;
  agentLabel: string;
  tabId: number;
  adapterId: string;
  tool: string;
  revoked: boolean;
};
const managedWrites = new Map<string, ManagedWrite>();
export function beginManagedWrite(
  id: string,
  call: Omit<ManagedWrite, "revoked">,
) {
  managedWrites.set(id, { ...call, revoked: false });
  return () => managedWrites.delete(id);
}
export function cancelManagedWrites(prefix: string) {
  for (const call of managedWrites.values())
    if (call.owner.startsWith(prefix)) call.revoked = true;
  for (const p of pending.values())
    if (p.request.owner?.startsWith(prefix)) p.finish(false);
}
export function setupBroker() {
  void chrome.storage.session.remove("pendingConfirmations");
  chrome.runtime.onUserScriptConnect.addListener((port) => {
    if (port.name !== "toolgraft-confirm") {
      return;
    }
    let requested = false;
    port.onMessage.addListener(async (message) => {
      if (requested) {
        port.disconnect();
        return;
      }
      requested = true;
      try {
        const sender = port.sender;
        const tabId = sender?.tab?.id;
        const url = sender?.url;
        if (tabId === undefined || !url || sender?.frameId !== 0)
          throw new Error("Invalid sender");
        const s = await readStore();
        const record = s.installIndex[message.adapterId];
        if (
          !record ||
          record.state !== "ok" ||
          !record.manifest.matches.some((p) => matchesUrl(p, url))
        )
          throw new Error("Adapter is not active");
        const tool = record.manifest.tools.find((t) => t.name === message.tool);
        if (
          !tool ||
          (tool.annotations.readOnlyHint && !tool.annotations.destructiveHint)
        )
          throw new Error("Not a write tool");
        const managed = [...managedWrites.values()].find(
          (c) =>
            c.tabId === tabId &&
            c.adapterId === record.manifest.id &&
            c.tool === tool.name,
        );
        if (managed?.revoked) throw new Error("Agent disconnected");
        const input = assertInput(tool, message.input);
        const request: Pending = {
          id: crypto.randomUUID(),
          adapterId: record.manifest.id,
          tool: tool.name,
          origin: new URL(url).origin,
          preview: JSON.stringify(input, null, 2).slice(0, 2000),
          expires: Date.now() + 120000,
          tabId,
          pageUrl: url,
          ...(managed
            ? { owner: managed.owner, agentLabel: managed.agentLabel }
            : {}),
        };
        let finished = false;
        const timer = setTimeout(() => finish(false), 120000);
        const finish = (approved: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          pending.delete(request.id);
          try {
            port.postMessage({ approved });
            port.disconnect();
          } catch {}
          if (request.windowId)
            void chrome.windows.remove(request.windowId).catch(() => {});
          void persist();
        };
        pending.set(request.id, { request, port, finish });
        port.onDisconnect.addListener(() => finish(false));
        await persist();
        const w = await chrome.windows.create({
          url: chrome.runtime.getURL(
            `/confirmation.html?request=${request.id}`,
          ),
          type: "popup",
          width: 500,
          height: 650,
        });
        if (w?.id !== undefined) {
          request.windowId = w.id;
          if (finished) void chrome.windows.remove(w.id).catch(() => {});
        }
        await persist();
      } catch {
        try {
          port.postMessage({ approved: false });
          port.disconnect();
        } catch {}
      }
    });
  });
  chrome.windows.onRemoved.addListener((windowId) => {
    for (const p of pending.values())
      if (p.request.windowId === windowId) p.finish(false);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    for (const p of pending.values())
      if (p.request.tabId === tabId) p.finish(false);
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "loading" || change.url)
      for (const p of pending.values())
        if (p.request.tabId === tabId) p.finish(false);
  });
}
async function persist() {
  await chrome.storage.session.set({
    pendingConfirmations: [...pending.values()].map((p) => p.request),
  });
}
export function getConfirmation(id: string) {
  return pending.get(id)?.request ?? null;
}
export async function resolveConfirmation(id: string, approved: boolean) {
  const p = pending.get(id);
  if (!p) throw new Error("This request expired. Call the tool again.");
  const tab = await chrome.tabs.get(p.request.tabId).catch(() => null);
  const valid =
    tab?.url === p.request.pageUrl && Date.now() < p.request.expires;
  p.finish(approved && valid);
}
export function cancelAdapter(id: string) {
  for (const p of pending.values())
    if (p.request.adapterId === id) p.finish(false);
}
