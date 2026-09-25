import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  canonical,
  manifestSchema,
  matchesUrl,
  assertInput,
  sha256,
  validateApi,
  revoked,
  versionSupported,
  changes,
  type Manifest,
} from "@toolgraft/adapter-schema";
import { pack, unpack, tar, untar } from "@toolgraft/adapter-schema/archive";
import { getModelContext, registerTools } from "@toolgraft/runtime-webmcp";
import {
  textResult,
  ToolGraftError,
  errorResult,
} from "@toolgraft/adapter-sdk";
const bytes = new Uint8Array(
  await readFile("adapters/playground/dist/adapter.tgz"),
);
const pkg = await unpack(bytes);
describe("package boundary", () => {
  it("roundtrips deterministic tar and verifies every payload", async () => {
    expect(await pack(pkg)).toEqual(await pack(pkg));
    expect((await unpack(await pack(pkg))).manifest).toEqual(pkg.manifest);
    const files = untar(bytes);
    files["bundle.js"] += "\nalert(1)";
    await expect(unpack(tar(files))).rejects.toThrow("Checksum mismatch");
  });
  it("rejects undeclared archive paths and duplicate identities", () => {
    expect(() => untar(tar({ "../../escape": "bad" }))).toThrow("archive path");
    expect(() =>
      manifestSchema.parse({
        ...pkg.manifest,
        tools: [pkg.manifest.tools[0], pkg.manifest.tools[0]],
      }),
    ).toThrow("Duplicate");
  });
  it("rejects huge expanded archives", () => {
    expect(() => untar(tar({ NOTICE: "a".repeat(2 * 1024 * 1024) }))).toThrow(
      "Expanded archive",
    );
  });
  it("rejects same-version manifest identity drift through its hash", async () => {
    expect(
      await sha256(canonical({ ...pkg.manifest, title: "changed" })),
    ).not.toBe(await sha256(canonical(pkg.manifest)));
  });
  it("matches exact origins, paths and localhost only", () => {
    expect(
      matchesUrl(
        "https://example.com/tools/*",
        "https://example.com/tools/a?x=1",
      ),
    ).toBe(true);
    for (const url of [
      "https://example.com.evil.test/tools/a",
      "https://sub.example.com/tools/a",
      "http://example.com/tools/a",
      "https://example.com/other",
    ])
      expect(matchesUrl("https://example.com/tools/*", url)).toBe(false);
    for (const pattern of [
      "https://*/*",
      "https://*.example.com/*",
      "http://example.com/*",
      "https://example.com:443/*",
    ])
      expect(() =>
        manifestSchema.parse({ ...pkg.manifest, matches: [pattern] }),
      ).toThrow();
  });
  it("rejects mismatched host permissions and unknown runtimes", () => {
    expect(() =>
      manifestSchema.parse({
        ...pkg.manifest,
        permissions: {
          ...pkg.manifest.permissions,
          hosts: ["https://evil.test/*"],
        },
      }),
    ).toThrow();
    expect(() =>
      manifestSchema.parse({
        ...pkg.manifest,
        runtime: { ...pkg.manifest.runtime, world: "MAIN" },
      }),
    ).toThrow();
  });
  it("enforces primitive inputs, properties, required values, and byte budgets", () => {
    const tool = pkg.manifest.tools.find(
      (t) => t.name === "playground_create_task",
    )!;
    expect(assertInput(tool, { title: "New task" })).toEqual({
      title: "New task",
    });
    for (const input of [
      {},
      { title: 1 },
      { title: "x", extra: true },
      { title: "x".repeat(70000) },
      { title: [] },
    ])
      expect(() => assertInput(tool, input)).toThrow();
  });
  it("truncates UTF-8 output with a visible marker", () => {
    const r = textResult("🌱".repeat(200000));
    expect(
      new TextEncoder().encode(r.content[0]!.text).length,
    ).toBeLessThanOrEqual(256 * 1024);
    expect(r.content[0]!.text).toContain("TRUNCATED");
    expect(
      errorResult(new ToolGraftError("PAGE_SHAPE_CHANGED", "Missing rows"))
        .isError,
    ).toBe(true);
  });
  it("applies engine floors, revocations and update changes", () => {
    expect(versionSupported("0.1.0")).toBe(true);
    expect(versionSupported("0.2.0")).toBe(true);
    expect(versionSupported("0.3.0")).toBe(true);
    expect(versionSupported("0.5.0")).toBe(true);
    expect(versionSupported("0.6.0")).toBe(true);
    expect(versionSupported("0.7.0")).toBe(false);
    expect(
      revoked(pkg.manifest, {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        revoked: [{ id: pkg.manifest.id, version: "*", reason: "broken" }],
      }),
    ).toBe(true);
    const next = {
      ...pkg.manifest,
      version: "0.2.0",
      tools: pkg.manifest.tools.slice(1),
    };
    expect(changes(pkg.manifest, next).removedTools).toEqual([
      "playground_list_tasks",
    ]);
  });
});
describe("native registration ownership", () => {
  it("uses document before navigator and rejects invalid candidates", () => {
    const a = { registerTool: vi.fn() },
      b = { registerTool: vi.fn() };
    expect(getModelContext({ modelContext: a }, { modelContext: b })).toBe(a);
    expect(getModelContext({ modelContext: {} }, { modelContext: b })).toBe(b);
    expect(getModelContext({}, {})).toBeUndefined();
  });
  it("yields to native tools and passes the owning AbortSignal", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    const abort = new AbortController();
    expect(
      await registerTools(
        { getTools: async () => [{ name: "native" }], registerTool },
        [{ name: "native" }, { name: "ours" }],
        abort.signal,
      ),
    ).toEqual(["ours"]);
    expect(registerTool).toHaveBeenCalledExactlyOnceWith(
      { name: "ours" },
      { signal: abort.signal },
    );
    abort.abort();
    expect(
      await registerTools({ registerTool }, [{ name: "late" }], abort.signal),
    ).toEqual([]);
  });
  it("stops on site policy denial instead of trying other tools", async () => {
    const registerTool = vi
      .fn()
      .mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    await expect(
      registerTools(
        { registerTool },
        [{ name: "one" }, { name: "two" }],
        new AbortController().signal,
      ),
    ).rejects.toThrow("blocked");
    expect(registerTool).toHaveBeenCalledTimes(1);
  });
});
describe("API compatibility boundary", () => {
  it("imports read descriptors and rejects undeclared origins and placeholders", async () => {
    const api = await unpack(
      new Uint8Array(
        await readFile("adapters/hacker-news-api/dist/adapter.tgz"),
      ),
    );
    expect(validateApi(api.manifest, api.payload).tools).toHaveLength(2);
    const p = JSON.parse(api.payload);
    p.api.endpoints.item.baseUrl = "https://evil.test";
    expect(() => validateApi(api.manifest, JSON.stringify(p))).toThrow();
    const other = JSON.parse(api.payload);
    other.api.endpoints.item.path = "/v0/{{unknown}}";
    expect(() => validateApi(api.manifest, JSON.stringify(other))).toThrow();
  });
});
