import { it, expect } from "vitest";
import { build } from "esbuild";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  compileDraft,
  validateFunction,
  safeUrl,
} from "../../packages/mcp/src/builder";
import { BrowserBridge } from "../../packages/mcp/src/bridge";
import { unpack } from "@toolgraft/adapter-schema/archive";
const { WebSocket } = createRequire(resolve("packages/mcp/package.json"))("ws");
it("builds unexecuted source into a verified managed package and rejects script injection", async () => {
  const bundle = await build({
    entryPoints: ["packages/adapter-sdk/src/managed.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "ToolGraftRuntime",
    target: "chrome138",
    minify: true,
    write: false,
  });
  const runtime = bundle.outputFiles[0]!.text;
  const license = await readFile("LICENSE", "utf8");
  const draft = {
    id: "local.proof",
    version: "0.1.0",
    title: "Proof",
    description: "Read the page title",
    url: "https://example.com/books",
    tools: [
      {
        name: "title",
        description: "Read the title",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: '() => { throw new Error("Not run on the host"); }',
      },
    ],
  };
  const result = await compileDraft(draft, runtime, license);
  const archive = await unpack(result.bytes);
  expect(archive.manifest.matches).toEqual(["https://example.com/books"]);
  expect(archive.manifest.permissions.hosts).toEqual(["https://example.com/*"]);
  expect(archive.payload).toContain("Not run on the host");
  for (const code of [
    '(()=>{throw "executed"})()',
    '() => import("x")',
    "() => process.exit()",
    "()=>{});globalThis.injected=true;//",
  ])
    expect(() => validateFunction(code)).toThrow();
  await expect(
    compileDraft(
      {
        ...draft,
        tools: [{ ...draft.tools[0], execute: "() => { return ( ; }" }],
      },
      runtime,
      license,
    ),
  ).rejects.toThrow();
  for (const url of [
    "file:///etc/passwd",
    "http://example.com",
    "https://user:pass@example.com",
  ])
    expect(() => safeUrl(url)).toThrow();
});
it("requires extension origin and pairing, correlates browser calls, and rejects interrupted writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tg-bridge-test-"));
  const bridge = new BrowserBridge(dir, 17839);
  const connect = (origin: string) =>
    new WebSocket("ws://127.0.0.1:17839", { origin });
  let socket: any;
  try {
    await bridge.start();
    const denied = connect("https://example.com");
    await new Promise<void>((resolve) => {
      denied.on("error", () => resolve());
    });
    expect(bridge.connected).toBeFalsy();
    socket = connect("chrome-extension://" + "a".repeat(32));
    await new Promise<void>((r) => socket.once("open", r));
    const next = () =>
      new Promise<any>((r) =>
        socket.once("message", (bytes: any) => r(JSON.parse(bytes.toString()))),
      );
    let response = next();
    socket.send(JSON.stringify({ type: "pair", code: bridge.pairCode().code }));
    const paired = await response;
    expect(paired.type).toBe("connected");
    expect(paired.token).toHaveLength(64);
    response = next();
    const read = bridge.call("status", {});
    const request = await response;
    socket.send(
      JSON.stringify({
        type: "response",
        id: request.id,
        ok: true,
        value: { installed: [] },
      }),
    );
    expect(await read).toEqual({ installed: [] });
    const write = bridge.call("call", { tool: "write" });
    const rejected = expect(write).rejects.toThrow("Outcome may be unknown");
    socket.close();
    await rejected;
  } finally {
    socket?.terminate();
    await bridge.close();
    await rm(dir, { recursive: true, force: true });
  }
});
