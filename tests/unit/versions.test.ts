import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { unpack } from "@toolgraft/adapter-schema/archive";
import {
  compareVersions,
  canonical,
  sha256,
  type Package,
} from "@toolgraft/adapter-schema";
import {
  readStore,
  savePackage,
  loadPackage,
  planActivation,
  removePackage,
  garbageCollect,
  HISTORY_BYTE_LIMIT,
  bodyKey,
  versionKey,
} from "../../apps/extension/lib/store";
import {
  versionCatalog,
  prepareVersion,
} from "../../apps/extension/lib/versions";
const original = await unpack(
  new Uint8Array(await readFile("adapters/playground/dist/adapter.tgz")),
);
let data: Record<string, any>,
  quota = false;
beforeEach(() => {
  data = {};
  quota = false;
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | string[] | null) =>
          structuredClone(
            keys === null
              ? data
              : Object.fromEntries(
                  (typeof keys === "string" ? [keys] : keys)
                    .filter((k) => k in data)
                    .map((k) => [k, data[k]]),
                ),
          ),
        set: async (value: object) => {
          if (quota) throw new Error("Quota exceeded");
          Object.assign(data, structuredClone(value));
        },
        remove: async (keys: string | string[]) => {
          for (const k of typeof keys === "string" ? [keys] : keys)
            delete data[k];
        },
      },
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const version = (v: string): Package => ({
  ...original,
  manifest: { ...original.manifest, version: v },
});
async function activate(p: Package, rollback = false) {
  const plan = await planActivation(p);
  await savePackage(p, "local", "local", {
    fromHash: plan.fromHash,
    rollback,
    launchUrl: "http://localhost:4274/tasks",
  });
  await garbageCollect();
}
it("orders stable versions numerically, including multi-digit parts", () => {
  expect(["1.10.0", "1.2.12", "2.0.0", "1.2.9"].sort(compareVersions)).toEqual([
    "1.2.9",
    "1.2.12",
    "1.10.0",
    "2.0.0",
  ]);
  expect(
    compareVersions("999999999999999999999.0.0", "999999999999999999998.0.0"),
  ).toBe(1);
  expect(() => compareVersions("1.0.0-beta", "1.0.0")).toThrow();
});
it("migrates v1 storage without losing the current package and fails closed on future schemas", async () => {
  const p = version("0.1.0"),
    hash = await sha256(canonical(p.manifest));
  data = {
    schemaVersion: 1,
    installIndex: {
      [p.manifest.id]: {
        manifest: p.manifest,
        manifestSha256: hash,
        sourceCommit: "local",
        review: "local",
        installedAt: new Date().toISOString(),
        state: "ok",
      },
    },
    revocations: {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      revoked: [],
    },
    [bodyKey(p.manifest)]: p,
  };
  const s = await readStore();
  expect(s.schemaVersion).toBe(2);
  expect(s.versionPins[versionKey(p.manifest)]).toBe(hash);
  expect(await loadPackage(p.manifest)).toEqual(p);
  data.schemaVersion = 99;
  await expect(readStore()).rejects.toThrow("Unreadable");
});
it("retains actual packages, requires rollback approval, and checks the reviewed current identity", async () => {
  const first = version("1.2.0"),
    second = version("1.10.0");
  await activate(first);
  const firstPlan = await planActivation(first);
  await activate(second);
  expect(await loadPackage(first.manifest)).toEqual(first);
  await expect(
    savePackage(first, "local", "local", {
      fromHash: firstPlan.fromHash,
      rollback: true,
    }),
  ).rejects.toThrow("changed during review");
  const rollback = await planActivation(first);
  expect(rollback.action).toBe("rollback");
  await expect(
    savePackage(first, "local", "local", {
      fromHash: rollback.fromHash,
      rollback: false,
    }),
  ).rejects.toThrow("explicit rollback");
  await activate(first, true);
  expect(
    (await readStore()).installIndex[first.manifest.id]?.manifest.version,
  ).toBe("1.2.0");
  expect((await prepareVersion(first.manifest.id, "1.10.0")).plan.action).toBe(
    "update",
  );
});
it("evicts old bodies while retaining history and pins, including after removal", async () => {
  for (let i = 0; i < 6; i++) await activate(version(`1.0.${i}`));
  expect(
    Object.keys(data).filter((k) => k.startsWith("adapter:")),
  ).toHaveLength(4);
  const s = await readStore();
  expect(Object.keys(s.versionHistory)).toHaveLength(6);
  expect(
    s.versionHistory[versionKey(version("1.0.0").manifest)]?.retained,
  ).toBe(false);
  await removePackage(original.manifest.id);
  expect(Object.keys((await readStore()).versionHistory)).toHaveLength(0);
  const replacement = version("1.0.0");
  replacement.manifest.title = "Changed identity";
  await expect(planActivation(replacement)).rejects.toThrow("immutable");
  expect(
    Object.keys(data).filter((k) => k.startsWith("adapter:")),
  ).toHaveLength(0);
});
it("rejects revoked, incompatible and corrupt rollback targets", async () => {
  await activate(version("1.0.0"));
  await activate(version("2.0.0"));
  data.revocations.revoked = [
    { id: original.manifest.id, version: "1.0.0", reason: "Bad adapter" },
  ];
  await expect(planActivation(version("1.0.0"))).rejects.toThrow("revoked");
  data.revocations.revoked = [];
  const bad = version("0.1.0");
  bad.manifest.compatibility = { minExtension: "99.0.0", minEngine: 1 };
  await expect(planActivation(bad)).rejects.toThrow("newer");
  data[bodyKey(version("1.0.0").manifest)] = version("9.0.0");
  await expect(prepareVersion(original.manifest.id, "1.0.0")).rejects.toThrow(
    "identity",
  );
});
it("quota failure preserves the previously installed version", async () => {
  await activate(version("1.0.0"));
  const before = structuredClone(data);
  quota = true;
  await expect(activate(version("2.0.0"))).rejects.toThrow("Quota");
  expect(data).toEqual(before);
});
it("detects the highest eligible update and explains unreviewed, revoked and conflicting entries", async () => {
  await activate(version("1.2.0"));
  const entry = async (v: string, review = "reviewed") => ({
    id: original.manifest.id,
    version: v,
    title: "Playground",
    runtime: "script",
    matches: original.manifest.matches,
    manifestSha256: await sha256(canonical(version(v).manifest)),
    artifact: `packages/test/${v}/adapter.tgz`,
    sourceCommit: "a".repeat(40),
    review,
    publishedAt: new Date().toISOString(),
  });
  data.registry = {
    schemaVersion: 1,
    entries: await Promise.all([
      entry("1.9.0"),
      entry("1.10.0"),
      entry("2.0.0", "experimental"),
      entry("3.0.0"),
      entry("4.0.0"),
    ]),
  };
  data.revocations.revoked = [
    { id: original.manifest.id, version: "3.0.0", reason: "Bad adapter" },
  ];
  data.versionPins[`${original.manifest.id}:4.0.0`] = "b".repeat(64);
  const catalog = await versionCatalog();
  const g = catalog.adapters[0]!;
  expect(g.updateVersion).toBe("1.10.0");
  expect(g.versions[0]?.blocked).toBe(
    "Catalog conflicts with approved version identity",
  );
  expect(g.versions[1]?.blocked).toBe("Revoked");
  expect(g.versions[2]?.blocked).toBe("Not publicly reviewed");
  expect(
    (await readStore()).installIndex[original.manifest.id]?.manifest.version,
  ).toBe("1.2.0");
});
it("requires a fresh catalog for evicted packages and leaves the installation intact offline", async () => {
  // Eviction is by installation time. Real-clock writes can share a millisecond,
  // making this fixture's assumed oldest version depend on machine speed.
  vi.useFakeTimers({ toFake: ["Date"] });
  for (let i = 0; i < 5; i++) {
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 24, 0, 0, i)));
    await activate(version(`1.0.${i}`));
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Offline");
    }),
  );
  await expect(prepareVersion(original.manifest.id, "1.0.0")).rejects.toThrow(
    "Offline",
  );
  expect(
    (await readStore()).installIndex[original.manifest.id]?.manifest.version,
  ).toBe("1.0.4");
  expect(
    (await prepareVersion(original.manifest.id, "1.0.3")).plan.action,
  ).toBe("rollback");
});

it("shares the history byte budget across adapters without evicting their current packages", async () => {
  for (const id of ["test.one", "test.two"]) {
    for (let i = 0; i < 4; i++) {
      const p = version(`1.0.${i}`);
      p.manifest.id = id;
      p.payload = "/*" + "x".repeat(800_000) + "*/";
      p.manifest.payloadSha256 = await sha256(p.payload);
      await activate(p);
    }
  }
  const s = await readStore();
  const current = new Set(
    Object.values(s.installIndex).map((r) => versionKey(r.manifest)),
  );
  let previousBytes = 0,
    evicted = 0;
  for (const [key, r] of Object.entries(s.versionHistory)) {
    if (current.has(key)) {
      expect(r.retained).toBe(true);
      expect((await loadPackage(r.manifest)).manifest.version).toBe("1.0.3");
    } else if (r.retained) {
      previousBytes += new TextEncoder().encode(
        JSON.stringify(data[bodyKey(r.manifest)]),
      ).byteLength;
    } else {
      evicted++;
      expect(data[bodyKey(r.manifest)]).toBeUndefined();
    }
  }
  expect(previousBytes).toBeLessThanOrEqual(HISTORY_BYTE_LIMIT);
  expect(evicted).toBeGreaterThan(0);
});
it("fails closed when history no longer agrees with its identity pins", async () => {
  await activate(version("1.0.0"));
  data.versionHistory[`${original.manifest.id}:1.0.0`].retained = false;
  await expect(readStore()).rejects.toThrow("Corrupt current version identity");
  data.versionHistory[`${original.manifest.id}:1.0.0`].retained = true;
  data.versionPins[`${original.manifest.id}:1.0.0`] = "a".repeat(64);
  await expect(readStore()).rejects.toThrow("Corrupt version history");
});
