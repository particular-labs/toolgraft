import { it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFile } from "node:fs/promises";
import { unpack } from "@toolgraft/adapter-schema/archive";
import { canonical, sha256 } from "@toolgraft/adapter-schema";
import {
  refreshRegistry,
  registryPackage,
} from "../../apps/extension/lib/registry";
const bytes = new Uint8Array(
  await readFile("adapters/playground/dist/adapter.tgz"),
);
const p = await unpack(bytes);
const entry = {
  id: p.manifest.id,
  version: p.manifest.version,
  title: p.manifest.title,
  runtime: "script" as const,
  matches: p.manifest.matches,
  manifestSha256: await sha256(canonical(p.manifest)),
  artifact: "packages/community.playground/0.1.0/adapter.tgz",
  sourceCommit: "a".repeat(40),
  review: "local" as const,
  publishedAt: "2026-09-23T00:00:00.000Z",
};
let data: Record<string, any>;
beforeEach(() => {
  data = {
    revocations: {
      schemaVersion: 1,
      updatedAt: "2026-09-23T00:00:00.000Z",
      revoked: [],
    },
  };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => data,
        set: async (value: object) => Object.assign(data, value),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it("verifies registry package identity and manifest hash after bounded download", async () => {
  const fetcher = vi.fn(async () => new Response(bytes));
  vi.stubGlobal("fetch", fetcher);
  expect((await registryPackage(entry)).manifest.id).toBe(entry.id);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    credentials: "omit",
    redirect: "error",
  });
  await expect(
    registryPackage({ ...entry, manifestSha256: "0".repeat(64) }),
  ).rejects.toThrow("hash");
});
it("rejects off-registry artifacts before any network request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  for (const artifact of [
    "https://evil.test/package.tgz",
    "../../../evil",
    "//evil.test/package",
    "packages/x?token=secret",
  ])
    await expect(registryPackage({ ...entry, artifact })).rejects.toThrow(
      "outside",
    );
  expect(fetcher).not.toHaveBeenCalled();
});
it("keeps last-known-good state when a refresh is malformed or rolls safety backward", async () => {
  const before = structuredClone(data);
  for (const safety of [
    { schemaVersion: 99 },
    { schemaVersion: 1, updatedAt: "2026-09-22T00:00:00.000Z", revoked: [] },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: URL) =>
          new Response(
            JSON.stringify(
              url.pathname.endsWith("index.v1.json")
                ? { schemaVersion: 1, entries: [entry] }
                : safety,
            ),
          ),
      ),
    );
    await expect(refreshRegistry()).rejects.toThrow();
    expect(data.revocations).toEqual(before.revocations);
    expect(data.registry).toEqual(before.registry);
    expect(data.registryRefreshError).toBeTruthy();
  }
});
it("stores index and safety together only after both validate", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: URL) =>
        new Response(
          JSON.stringify(
            url.pathname.endsWith("index.v1.json")
              ? { schemaVersion: 1, entries: [entry] }
              : data.revocations,
          ),
        ),
    ),
  );
  await refreshRegistry();
  expect(data.registry.entries).toEqual([entry]);
  expect(data.registryRefreshedAt).toBeTruthy();
});
it("refuses an oversized registry response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(bytes, { headers: { "content-length": "1048577" } }),
    ),
  );
  await expect(registryPackage(entry)).rejects.toThrow("too large");
});
