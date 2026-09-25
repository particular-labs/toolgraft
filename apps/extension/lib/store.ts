import {
  canonical,
  manifestSchema,
  revocationsSchema,
  revoked,
  sha256,
  verifyPackage,
  versionSupported,
  ENGINE_VERSION,
  versionAction,
  type Package,
  type Manifest,
  type Revocations,
  type ActivationPlan,
} from "@toolgraft/adapter-schema";
export type Install = {
  manifest: Manifest;
  manifestSha256: string;
  sourceCommit: string;
  review: string;
  installedAt: string;
  state: "ok" | "revoked" | "broken" | "engine-too-old";
};
export type HistoricalInstall = Install & {
  retained: boolean;
  launchUrl?: string;
};
export type Store = {
  schemaVersion: 2;
  installIndex: Record<string, Install>;
  versionHistory: Record<string, HistoricalInstall>;
  versionPins: Record<string, string>;
  revocations: Revocations;
};
export const HISTORY_PREVIOUS_LIMIT = 3;
export const HISTORY_BYTE_LIMIT = 4 * 1024 * 1024;
const baseline: Revocations = {
  schemaVersion: 1,
  updatedAt: "2026-09-23T00:00:00.000Z",
  revoked: [],
};
let queue: Promise<unknown> = Promise.resolve();
export function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}
const recordMap = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export const versionKey = (m: Pick<Manifest, "id" | "version">) =>
  `${m.id}:${m.version}`;
export const bodyKey = (m: Pick<Manifest, "id" | "version">) =>
  `adapter:${versionKey(m)}`;
async function checkedRecord(r: Install): Promise<Install> {
  const m = manifestSchema.parse(r?.manifest);
  if (r.manifestSha256 !== (await sha256(canonical(m))))
    throw new Error("Corrupt install index");
  return { ...r, manifest: m };
}
let reading: Promise<Store> | undefined;
export async function readStore(): Promise<Store> {
  // Coalesce the additive migration before concurrent readers can proceed.
  if (reading) return structuredClone(await reading);
  reading = read();
  try {
    return structuredClone(await reading);
  } finally {
    reading = undefined;
  }
}
async function read(): Promise<Store> {
  const raw = await chrome.storage.local.get([
    "schemaVersion",
    "installIndex",
    "revocations",
    "versionHistory",
    "versionPins",
  ]);
  if (raw.schemaVersion === undefined && raw.installIndex === undefined) {
    const s: Store = {
      schemaVersion: 2,
      installIndex: {},
      versionHistory: {},
      versionPins: {},
      revocations: baseline,
    };
    await chrome.storage.local.set(s);
    return s;
  }
  if (
    (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) ||
    !recordMap(raw.installIndex)
  )
    throw new Error(
      "Unreadable local storage. Export or remove the extension data before continuing.",
    );
  const revocations = revocationsSchema.parse(raw.revocations);
  const installIndex: Record<string, Install> = Object.create(null);
  for (const [id, v] of Object.entries(raw.installIndex)) {
    const r = await checkedRecord(v as Install);
    if (r.manifest.id !== id) throw new Error("Corrupt install index");
    installIndex[id] = r;
  }
  const versionHistory: Store["versionHistory"] = Object.create(null);
  const versionPins: Store["versionPins"] = Object.create(null);
  if (raw.schemaVersion === 2) {
    if (!recordMap(raw.versionHistory) || !recordMap(raw.versionPins))
      throw new Error("Corrupt version history");
    for (const [key, value] of Object.entries(raw.versionPins)) {
      if (
        !/^[a-z][a-z0-9.-]*:[0-9]+\.[0-9]+\.[0-9]+$/.test(key) ||
        typeof value !== "string" ||
        !/^[a-f0-9]{64}$/.test(value)
      )
        throw new Error("Corrupt version identity");
      versionPins[key] = value;
    }
    for (const [key, v] of Object.entries(raw.versionHistory)) {
      const r = await checkedRecord(v as Install);
      if (
        key !== versionKey(r.manifest) ||
        typeof v.retained !== "boolean" ||
        versionPins[key] !== r.manifestSha256
      )
        throw new Error("Corrupt version history");
      versionHistory[key] = {
        ...r,
        retained: v.retained,
        ...(typeof v.launchUrl === "string" ? { launchUrl: v.launchUrl } : {}),
      };
    }
  }
  for (const r of Object.values(installIndex)) {
    const key = versionKey(r.manifest);
    if (
      raw.schemaVersion === 2 &&
      (versionPins[key] !== r.manifestSha256 || !versionHistory[key]?.retained)
    )
      throw new Error("Corrupt current version identity");
    if (raw.schemaVersion === 1) {
      versionHistory[key] = { ...r, retained: true };
      versionPins[key] = r.manifestSha256;
    }
  }
  const s: Store = {
    schemaVersion: 2,
    installIndex,
    versionHistory,
    versionPins,
    revocations,
  };
  if (raw.schemaVersion === 1) await chrome.storage.local.set(s);
  return s;
}
export async function loadPackage(m: Manifest): Promise<Package> {
  const key = bodyKey(m),
    raw = await chrome.storage.local.get(key);
  const p = await verifyPackage(raw[key] as Package);
  if (canonical(p.manifest) !== canonical(m))
    throw new Error("Stored package identity differs from version history");
  return p;
}
export async function planActivation(
  p: Package,
  supplied?: Store,
): Promise<ActivationPlan> {
  const s = supplied ?? (await readStore());
  await verifyPackage(p);
  const m = p.manifest;
  if (revoked(m, s.revocations))
    throw new Error("This adapter version has been revoked.");
  const digest = await sha256(canonical(m));
  if (s.versionPins[versionKey(m)] && s.versionPins[versionKey(m)] !== digest)
    throw new Error("An approved version is immutable. Use a new version.");
  if (
    m.compatibility.minEngine > ENGINE_VERSION ||
    !versionSupported(m.compatibility.minExtension)
  )
    throw new Error("This adapter needs a newer ToolGraft engine.");
  const current = s.installIndex[m.id];
  return {
    action: versionAction(current?.manifest.version, m.version),
    fromVersion: current?.manifest.version ?? null,
    fromHash: current?.manifestSha256 ?? null,
    previous: current?.manifest ?? null,
  };
}
export async function savePackage(
  p: Package,
  sourceCommit: string,
  review: string,
  approval: { fromHash: string | null; rollback: boolean; launchUrl?: string },
) {
  const s = await readStore(),
    plan = await planActivation(p, s),
    m = p.manifest;
  if (plan.fromHash !== approval.fromHash)
    throw new Error(
      "Installed version changed during review. Review the version again.",
    );
  if (plan.action === "rollback" && !approval.rollback)
    throw new Error("An older version requires explicit rollback approval.");
  const record: Install = {
    manifest: m,
    manifestSha256: await sha256(canonical(m)),
    sourceCommit,
    review,
    installedAt: new Date().toISOString(),
    state: "ok",
  };
  s.installIndex[m.id] = record;
  s.versionHistory[versionKey(m)] = {
    ...record,
    retained: true,
    ...(approval.launchUrl ? { launchUrl: approval.launchUrl } : {}),
  };
  s.versionPins[versionKey(m)] = record.manifestSha256;
  const all = await chrome.storage.local.get(null);
  all[bodyKey(m)] = p;
  // Keep current packages plus three previously approved versions per adapter,
  // with a shared 4 MiB history budget. Metadata and identity pins survive eviction.
  const current = new Set(
    Object.values(s.installIndex).map((r) => versionKey(r.manifest)),
  );
  const counts = new Map<string, number>();
  let bytes = 0;
  for (const r of Object.values(s.versionHistory).sort((a, b) =>
    b.installedAt.localeCompare(a.installedAt),
  )) {
    const key = versionKey(r.manifest);
    if (current.has(key)) {
      r.retained = true;
      continue;
    }
    const body = all[bodyKey(r.manifest)],
      size = body
        ? new TextEncoder().encode(JSON.stringify(body)).byteLength
        : 0;
    const n = counts.get(r.manifest.id) ?? 0;
    r.retained =
      !!body &&
      n < HISTORY_PREVIOUS_LIMIT &&
      bytes + size <= HISTORY_BYTE_LIMIT;
    if (r.retained) {
      bytes += size;
      counts.set(r.manifest.id, n + 1);
    }
  }
  // One commit switches current version and records the retained package. A quota
  // failure leaves the previous installation in place, never a half-written pin.
  await chrome.storage.local.set({
    [bodyKey(m)]: p,
    installIndex: s.installIndex,
    versionHistory: s.versionHistory,
    versionPins: s.versionPins,
    ...(approval.launchUrl
      ? { [`agent-launch:${m.id}`]: approval.launchUrl }
      : {}),
  });
}
export async function removePackage(id: string) {
  const s = await readStore();
  delete s.installIndex[id];
  const keys: string[] = [];
  for (const [key, r] of Object.entries(s.versionHistory))
    if (r.manifest.id === id) {
      keys.push(bodyKey(r.manifest));
      delete s.versionHistory[key];
    }
  // Small identity pins remain to prevent reusing an approved version for new code.
  await chrome.storage.local.set({
    installIndex: s.installIndex,
    versionHistory: s.versionHistory,
  });
  await chrome.storage.local.remove([...keys, `agent-launch:${id}`]);
}
export async function garbageCollect() {
  const s = await readStore();
  const keep = new Set(
    Object.values(s.versionHistory)
      .filter((r) => r.retained)
      .map((r) => bodyKey(r.manifest)),
  );
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(
    (k) => k.startsWith("adapter:") && !keep.has(k),
  );
  if (keys.length) await chrome.storage.local.remove(keys);
}
