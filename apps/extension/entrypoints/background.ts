import { scriptCode } from "../lib/script-code";
import { setupConnectionLinks } from "../lib/connection-links";
import {
  analyticsStatus,
  setAnalytics,
  trackExtension,
  analyticsOrigin,
} from "../lib/analytics";
import { PANEL_PROTOCOL } from "@toolgraft/agent-core";
import { defineBackground } from "wxt/utils/define-background";
import {
  canonical,
  sha256,
  revoked,
  versionSupported,
  ENGINE_VERSION,
  matchesUrl,
  type Package,
  type ActivationPlan,
} from "@toolgraft/adapter-schema";
import { unpack } from "@toolgraft/adapter-schema/archive";
import {
  readStore,
  savePackage,
  removePackage,
  serialized,
  loadPackage,
  garbageCollect,
  planActivation,
} from "../lib/store";
import {
  setupBroker,
  getConfirmation,
  resolveConfirmation,
  cancelAdapter,
} from "../lib/broker";
import { refreshRegistry } from "../lib/registry";
import { setupAgent, agentUI, authorizeTrial } from "../lib/agent";
import { versionCatalog, prepareVersion } from "../lib/versions";
const staged = new Map<
  string,
  {
    p: Package;
    sourceCommit: string;
    review: string;
    expires: number;
    plan: ActivationPlan;
    launchUrl?: string;
  }
>();
async function available() {
  try {
    await chrome.userScripts.getScripts();
    return true;
  } catch {
    return false;
  }
}
export default defineBackground(() => {
  setupConnectionLinks();
  setupBroker();
  const sync = async () => {
    if (!(await available())) return;
    await chrome.userScripts.unregister();
    try {
      const s = await readStore();
      for (const record of Object.values(s.installIndex)) {
        const m = record.manifest;
        record.state = revoked(m, s.revocations)
          ? "revoked"
          : m.compatibility.minEngine > ENGINE_VERSION ||
              !versionSupported(m.compatibility.minExtension)
            ? "engine-too-old"
            : "ok";
        if (record.state !== "ok") {
          cancelAdapter(m.id);
          continue;
        }
        try {
          if (
            !(await chrome.permissions.contains({
              origins: m.permissions.hosts,
            }))
          )
            throw new Error("Host access missing");
          const p = await loadPackage(m);
          if ((await sha256(canonical(p.manifest))) !== record.manifestSha256)
            throw new Error("Stored manifest mismatch");
          const worldId = m.id;
          await chrome.userScripts.configureWorld({ worldId, messaging: true });
          const js =
            m.runtime.kind === "script"
              ? [{ code: scriptCode(p) }]
              : [
                  {
                    code: `globalThis.__TOOLGRAFT_API__ = ${JSON.stringify({ manifest: m, payload: p.payload })};`,
                  },
                  { file: "api-runtime.js" },
                ];
          await chrome.userScripts.register([
            {
              id: `toolgraft:${m.id}:${m.version}`,
              // Chrome includes the query in its path match; ToolGraft routes
              // match pathname only. Keep exact paths exact while admitting queries.
              matches: m.matches.flatMap((p) =>
                p.endsWith("*") ? [p] : [p, `${p}?*`],
              ),
              runAt: "document_idle",
              world: "USER_SCRIPT",
              worldId,
              js,
            },
          ]);
        } catch {
          record.state = "broken";
          cancelAdapter(m.id);
        }
      }
      await chrome.storage.local.set({ installIndex: s.installIndex });
      await garbageCollect();
    } catch (e) {
      await chrome.storage.session.set({ storageError: String(e) });
    }
  };
  setupAgent(sync);
  chrome.runtime.onInstalled.addListener(() => {
    void serialized(sync);
    void chrome.alarms.create("safety-refresh", { periodInMinutes: 360 });
  });
  chrome.runtime.onStartup.addListener(() => {
    void serialized(sync);
  });
  chrome.permissions.onRemoved.addListener(() => {
    void serialized(sync);
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "safety-refresh")
      void serialized(async () => {
        try {
          await refreshRegistry();
          await sync();
        } catch {
          /* Keep last-known-good safety list. */
        }
      });
  });
  chrome.runtime.onUserScriptMessage.addListener((message, sender, respond) => {
    if (message?.type === "authorize-call") {
      void readStore()
        .then(async (s) => {
          const trial = await authorizeTrial(message, sender);
          if (trial !== undefined) {
            respond(trial);
            return;
          }
          const r = s.installIndex[message.adapterId];
          const allowed =
            !!r &&
            r.state === "ok" &&
            !revoked(r.manifest, s.revocations) &&
            r.manifest.version === message.version &&
            sender.frameId === 0 &&
            sender.tab?.id !== undefined &&
            !!sender.url &&
            r.manifest.matches.some((p) => matchesUrl(p, sender.url!)) &&
            (await chrome.permissions.contains({
              origins: r.manifest.permissions.hosts,
            }));
          respond(allowed);
        })
        .catch(() => respond(false));
      return true;
    }
    if (
      message?.type !== "diagnostic" ||
      sender.frameId !== 0 ||
      sender.tab?.id === undefined
    )
      return;
    void readStore().then(async (s) => {
      const r = s.installIndex[message.adapterId];
      if (
        !r ||
        !sender.url ||
        !r.manifest.matches.some((p) => matchesUrl(p, sender.url!))
      )
        return;
      await chrome.storage.session.set({
        [`diagnostic:${sender.tab!.id}:${r.manifest.id}`]: {
          state: String(message.state).slice(0, 40),
          message: String(message.message).slice(0, 500),
          tools: Array.isArray(message.tools) ? message.tools.slice(0, 30) : [],
          url: sender.url,
          at: Date.now(),
        },
      });
    });
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      !sender.url?.startsWith(chrome.runtime.getURL("/")) ||
      (sender.tab?.url &&
        !sender.tab.url.startsWith(chrome.runtime.getURL("/")))
    )
      return;
    const type = message?.type;
    if (typeof type === "string" && type.startsWith("agent-")) {
      if (
        ["agent-resolve", "agent-keep-trial"].includes(type) &&
        !sender.url?.startsWith(chrome.runtime.getURL("/agent.html"))
      )
        return;
      void agentUI(type, message).then(
        (value) => respond({ ok: true, value, panelProtocol: PANEL_PROTOCOL }),
        (e) =>
          respond({
            panelProtocol: PANEL_PROTOCOL,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          }),
      );
      return true;
    }
    const work = async () => {
      if (type === "analytics-status") return analyticsStatus();
      if (type === "analytics-set")
        return setAnalytics(message.enabled === true);
      if (type === "analytics-track") {
        await trackExtension(
          message.event,
          message.page,
          message.privacyBlocked,
        );
        return true;
      }
      if (type === "status") {
        const s = await readStore();
        return {
          ...s,
          versions: await versionCatalog(s),
          userScripts: await available(),
          session: await chrome.storage.session.get(null),
          registry:
            (await chrome.storage.local.get("registry")).registry ?? null,
        };
      }
      if (type === "resync") {
        await sync();
        return true;
      }
      if (type === "stage-local") {
        const p = await unpack(new Uint8Array(message.bytes));
        const plan = await planActivation(p);
        const id = crypto.randomUUID();
        staged.set(id, {
          p,
          plan,
          sourceCommit: "local",
          review: "local",
          expires: Date.now() + 600000,
        });
        return {
          id,
          manifest: p.manifest,
          plan,
          hash: await sha256(canonical(p.manifest)),
          sourceCommit: "local",
          review: "local",
        };
      }
      if (type === "registry-refresh") {
        await refreshRegistry();
        await sync();
        return true;
      }
      if (type === "stage-version" || type === "stage-registry") {
        const candidate = await prepareVersion(
          String(message.id),
          String(message.version),
        );
        const id = crypto.randomUUID();
        staged.set(id, { ...candidate, expires: Date.now() + 600000 });
        return {
          id,
          manifest: candidate.p.manifest,
          hash: await sha256(canonical(candidate.p.manifest)),
          sourceCommit: candidate.sourceCommit,
          review: candidate.review,
          plan: candidate.plan,
        };
      }
      if (type === "install") {
        const stage = staged.get(message.id);
        if (!stage || stage.expires < Date.now())
          throw new Error("Review expired. Select the package again.");
        if (!(await available()))
          throw new Error("Enable Allow User Scripts first.");
        if (
          !(await chrome.permissions.contains({
            origins: stage.p.manifest.permissions.hosts,
          }))
        )
          throw new Error("Site access was not granted.");
        await savePackage(stage.p, stage.sourceCommit, stage.review, {
          fromHash: stage.plan.fromHash,
          rollback: message.rollback === true,
          ...(stage.launchUrl ? { launchUrl: stage.launchUrl } : {}),
        });
        staged.delete(message.id);
        cancelAdapter(stage.p.manifest.id);
        await sync();
        return true;
      }
      if (type === "remove") {
        cancelAdapter(message.id);
        await removePackage(message.id);
        await sync();
        const s = await readStore();
        const used = new Set(
          Object.values(s.installIndex).flatMap(
            (r) => r.manifest.permissions.hosts,
          ),
        );
        if ((await analyticsStatus()).enabled) used.add(analyticsOrigin);
        const granted = await chrome.permissions.getAll();
        const unused = (granted.origins ?? []).filter((h) => !used.has(h));
        if (unused.length) await chrome.permissions.remove({ origins: unused });
        return true;
      }
      if (type === "confirmation") {
        return getConfirmation(message.id);
      }
      if (type === "resolve-confirmation") {
        if (
          !sender.url?.startsWith(chrome.runtime.getURL("/confirmation.html"))
        )
          throw new Error("Invalid confirmation sender");
        await resolveConfirmation(message.id, message.approved === true);
        return true;
      }
      throw new Error("Unknown request");
    };
    // Status and confirmation cannot queue behind network installs: consent must stay responsive.
    const pending =
      type === "analytics-track" ||
      type === "analytics-set" ||
      type === "analytics-status" ||
      type === "status" ||
      type === "confirmation" ||
      type === "resolve-confirmation"
        ? work()
        : serialized(work);
    void pending.then(
      (value) => respond({ ok: true, value, panelProtocol: PANEL_PROTOCOL }),
      (e) =>
        respond({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
    );
    return true;
  });
  void serialized(sync);
});
