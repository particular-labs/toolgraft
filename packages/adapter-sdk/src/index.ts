import {
  assertInput,
  OUTPUT_LIMIT,
  utf8,
  matchesUrl,
} from "@toolgraft/adapter-schema/runtime";
import type { ToolDescriptor, Manifest } from "@toolgraft/adapter-schema";
import { getModelContext, registerTools } from "@toolgraft/runtime-webmcp";
export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};
export type ErrorCode =
  | "ADAPTER_NOT_READY"
  | "AUTH_REQUIRED"
  | "CONFIRMATION_DENIED"
  | "NETWORK_ERROR"
  | "PAGE_SHAPE_CHANGED"
  | "RATE_LIMITED"
  | "UNSUPPORTED_PAGE"
  | "VALIDATION_ERROR"
  | "TOOL_FAILED";
export class ToolGraftError extends Error {
  code: ErrorCode;
  hint: string;
  constructor(
    code: ErrorCode,
    message: string,
    hint = "Reload the page and try again.",
  ) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}
export function textResult(value: unknown): ToolResult {
  let s = typeof value === "string" ? value : JSON.stringify(value);
  if (utf8.encode(s).length > OUTPUT_LIMIT - 128) {
    s =
      new TextDecoder().decode(utf8.encode(s).subarray(0, OUTPUT_LIMIT - 128)) +
      "\n[TRUNCATED: output exceeds 256 KiB]";
  }
  return { content: [{ type: "text", text: s }] };
}
export function errorResult(error: unknown): ToolResult {
  const e =
    error instanceof ToolGraftError
      ? error
      : new ToolGraftError(
          "TOOL_FAILED",
          error instanceof Error ? error.message : "Tool failed",
        );
  return {
    ...textResult({ code: e.code, message: e.message, hint: e.hint }),
    isError: true,
  };
}
export type AdapterTool = ToolDescriptor & {
  execute: (
    input: Record<string, string | number | boolean>,
  ) => unknown | Promise<unknown>;
};
export function defineAdapter<T extends { tools: AdapterTool[] }>(
  adapter: T,
): T {
  return adapter;
}
export function confirmWrite(
  adapterId: string,
  tool: string,
  input: unknown,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: "toolgraft-confirm" });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      port.disconnect();
      ok
        ? resolve()
        : reject(
            new ToolGraftError(
              "CONFIRMATION_DENIED",
              "The operation was not approved.",
              "Call the tool again and approve the operation in ToolGraft.",
            ),
          );
    };
    const timer = setTimeout(() => finish(false), 120000);
    port.onMessage.addListener((m) => finish(m?.approved === true));
    port.onDisconnect.addListener(() => finish(false));
    port.postMessage({ adapterId, tool, input });
  });
}
export function startAdapter(
  adapter: { tools: AdapterTool[] },
  manifest: Manifest,
) {
  let controller: AbortController | undefined;
  let last = "";
  let rebuilding = Promise.resolve();
  const active = new Set<string>();
  const check = () => {
    const url = location.href;
    if (url === last) return;
    last = url;
    rebuilding = rebuilding
      .then(async () => {
        controller?.abort();
        controller = new AbortController();
        if (!manifest.matches.some((p) => matchesUrl(p, location.href))) return;
        const context = getModelContext();
        if (!context) {
          diagnostic(
            "blocked",
            "WebMCP is unavailable. Enable the WebMCP flags in a supported Chrome build.",
          );
          return;
        }
        const registrationController = controller;
        const tools = adapter.tools.map((tool) => ({
          ...tool,
          execute: async (input: unknown) => {
            try {
              if (!manifest.matches.some((p) => matchesUrl(p, location.href)))
                throw new ToolGraftError(
                  "UNSUPPORTED_PAGE",
                  "This tool is not available on this route.",
                );
              const allowed = await chrome.runtime
                .sendMessage({
                  type: "authorize-call",
                  adapterId: manifest.id,
                  version: manifest.version,
                })
                .catch(() => false);
              if (!allowed)
                throw new ToolGraftError(
                  "ADAPTER_NOT_READY",
                  "This adapter is no longer active.",
                  "Review adapter status and reload the page.",
                );
              let args;
              try {
                args = assertInput(tool, input);
              } catch (e) {
                throw new ToolGraftError(
                  "VALIDATION_ERROR",
                  String(e),
                  "Check the input against the tool schema.",
                );
              }
              if (active.has(tool.name))
                throw new ToolGraftError(
                  "ADAPTER_NOT_READY",
                  "This tool already has an invocation in progress.",
                  "Wait for it to finish.",
                );
              active.add(tool.name);
              try {
                if (
                  !tool.annotations.readOnlyHint ||
                  tool.annotations.destructiveHint
                )
                  await confirmWrite(manifest.id, tool.name, args);
                if (
                  registrationController.signal.aborted ||
                  !manifest.matches.some((p) => matchesUrl(p, location.href))
                )
                  throw new ToolGraftError(
                    "UNSUPPORTED_PAGE",
                    "The page changed during confirmation.",
                  );
                const result = await tool.execute(args);
                return textResultResult(result);
              } finally {
                active.delete(tool.name);
              }
            } catch (e) {
              return errorResult(e);
            }
          },
        }));
        try {
          const registered = await registerTools(
            context,
            tools,
            controller.signal,
          );
          diagnostic(
            "active",
            `${registered.length} tools registered`,
            registered,
          );
        } catch (e) {
          controller.abort();
          diagnostic("blocked", String(e));
        }
      })
      .catch((e) => diagnostic("broken", String(e)));
  };
  function diagnostic(state: string, message: string, tools: string[] = []) {
    void chrome.runtime
      .sendMessage({
        type: "diagnostic",
        adapterId: manifest.id,
        state,
        message,
        tools,
      })
      .catch(() => {});
  }
  check();
  const timer = manifest.routeScoped ? setInterval(check, 250) : undefined;
  const stop = () => {
    controller?.abort();
    if (timer) clearInterval(timer);
  };
  addEventListener("pagehide", stop, { once: true });
  addEventListener("popstate", check);
  return stop;
}
function textResultResult(v: unknown): ToolResult {
  if (v && typeof v === "object" && "content" in v) {
    const result = v as ToolResult;
    return {
      ...textResult(result.content.map((c) => c.text).join("\n")),
      ...(result.isError ? { isError: true } : {}),
    };
  }
  return textResult(v);
}
