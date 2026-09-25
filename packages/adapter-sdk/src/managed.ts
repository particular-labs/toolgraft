import { assertInput, matchesUrl } from "@toolgraft/adapter-schema/runtime";
import type { Manifest } from "@toolgraft/adapter-schema";
import { getModelContext, registerTools } from "@toolgraft/runtime-webmcp";
import {
  confirmWrite,
  errorResult,
  textResult,
  ToolGraftError,
  type AdapterTool,
} from "./index";
export { textResult, ToolGraftError };

/** Packaged runtime. Received adapter source only executes inside USER_SCRIPT. */
export function startManagedAdapter(
  adapter: { tools: AdapterTool[] },
  manifest: Manifest,
) {
  let stopped = false;
  let controller = new AbortController();
  let port: chrome.runtime.Port | undefined;
  let route = "";
  let epoch = 0;
  const active = new Set<string>();
  const reconnect = () => {
    if (!stopped) void refresh(true);
  };
  async function refresh(force = false) {
    if (stopped || (!force && route === location.href)) return;
    route = location.href;
    const run = ++epoch;
    controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const previous = port;
    port = undefined;
    previous?.disconnect();
    if (!manifest.matches.some((p) => matchesUrl(p, route))) return;
    const tools = adapter.tools.map((tool) => ({
      ...tool,
      execute: async (input: unknown) => {
        try {
          if (
            signal.aborted ||
            !manifest.matches.some((p) => matchesUrl(p, location.href))
          )
            throw new ToolGraftError(
              "UNSUPPORTED_PAGE",
              "The page changed. Rediscover the tool.",
            );
          const allowed = await chrome.runtime.sendMessage({
            type: "authorize-call",
            adapterId: manifest.id,
            version: manifest.version,
          });
          if (!allowed)
            throw new ToolGraftError(
              "ADAPTER_NOT_READY",
              "This adapter is no longer active.",
            );
          const args = assertInput(tool, input);
          if (active.has(tool.name))
            throw new ToolGraftError(
              "ADAPTER_NOT_READY",
              "This tool already has a call in progress.",
            );
          active.add(tool.name);
          try {
            if (
              !tool.annotations.readOnlyHint ||
              tool.annotations.destructiveHint
            )
              await confirmWrite(manifest.id, tool.name, args);
            if (
              signal.aborted ||
              !manifest.matches.some((p) => matchesUrl(p, location.href))
            )
              throw new ToolGraftError(
                "UNSUPPORTED_PAGE",
                "The page changed during approval.",
              );
            const result = await tool.execute(args);
            if (result && typeof result === "object" && "content" in result) {
              const r = result as {
                content: Array<{ text: string }>;
                isError?: boolean;
              };
              return {
                ...textResult(r.content.map((c) => c.text).join("\n")),
                ...(r.isError ? { isError: true } : {}),
              };
            }
            return textResult(result);
          } finally {
            active.delete(tool.name);
          }
        } catch (e) {
          return errorResult(e);
        }
      },
    }));
    const names = tools.map((t) => t.name);
    const context = getModelContext();
    if (context) {
      try {
        await registerTools(context, tools, signal);
      } catch {
        /* Local managed execution remains available when native API is restricted. */
      }
    }
    if (run !== epoch || stopped) return;
    const p = chrome.runtime.connect({ name: "toolgraft-managed" });
    port = p;
    p.postMessage({
      type: "ready",
      adapterId: manifest.id,
      version: manifest.version,
      url: location.href,
      tools: names,
    });
    void chrome.runtime
      .sendMessage({
        type: "diagnostic",
        adapterId: manifest.id,
        state: "active",
        message: `${names.length} tools ready through ToolGraft`,
        tools: names,
      })
      .catch(() => {});
    p.onMessage.addListener(async (message) => {
      if (message?.type !== "call" || typeof message.id !== "string") return;
      const tool = tools.find(
        (t) => t.name === message.tool && names.includes(t.name),
      );
      const result = tool
        ? await tool.execute(message.input)
        : errorResult(
            new ToolGraftError("ADAPTER_NOT_READY", "Tool not registered."),
          );
      try {
        p.postMessage({ type: "result", id: message.id, result });
      } catch {
        /* Never retry an uncertain call. */
      }
    });
    p.onDisconnect.addListener(() => {
      if (port === p) {
        port = undefined;
        setTimeout(reconnect, 1000);
      }
    });
  }
  const timer = setInterval(() => void refresh().catch(() => {}), 250);
  addEventListener(
    "pagehide",
    () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
      port?.disconnect();
    },
    { once: true },
  );
  void refresh().catch(() => {});
}
