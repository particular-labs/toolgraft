import {
  compareVersions,
  versionAction,
  registrySchema,
  revoked,
  versionSupported,
  ENGINE_VERSION,
} from "@toolgraft/adapter-schema";
import {
  readStore,
  loadPackage,
  planActivation,
  type Store,
  HISTORY_PREVIOUS_LIMIT,
  HISTORY_BYTE_LIMIT,
} from "./store";
import { registryPackage, refreshRegistry } from "./registry";
export type VersionItem = {
  version: string;
  manifestSha256: string;
  sourceCommit: string;
  review: string;
  source: "local" | "registry";
  retained: boolean;
  current: boolean;
  action: ReturnType<typeof versionAction>;
  approvedAt: string | null;
  publishedAt: string | null;
  blocked: string | null;
};
export type VersionGroup = {
  id: string;
  title: string;
  installedVersion: string | null;
  updateVersion: string | null;
  versions: VersionItem[];
};
export type VersionCatalog = {
  retention: { previousPerAdapter: number; historyByteLimit: number };
  adapters: VersionGroup[];
  refreshedAt: string | null;
  refreshError: string | null;
};
export async function versionCatalog(s?: Store): Promise<VersionCatalog> {
  s ??= await readStore();
  const raw = await chrome.storage.local.get([
    "registry",
    "registryRefreshedAt",
    "registryRefreshError",
  ]);
  const registry = raw.registry
    ? registrySchema.parse(raw.registry)
    : { entries: [] };
  const groups = new Map<string, VersionGroup>();
  const group = (id: string, title: string) => {
    if (!groups.has(id))
      groups.set(id, {
        id,
        title: s!.installIndex[id]?.manifest.title ?? title,
        installedVersion: s!.installIndex[id]?.manifest.version ?? null,
        updateVersion: null,
        versions: [],
      });
    return groups.get(id)!;
  };
  for (const r of Object.values(s.versionHistory)) {
    const m = r.manifest,
      g = group(m.id, m.title);
    g.versions.push({
      version: m.version,
      manifestSha256: r.manifestSha256,
      sourceCommit: r.sourceCommit,
      review: r.review,
      source: "local",
      retained: r.retained,
      current: g.installedVersion === m.version,
      action: versionAction(g.installedVersion ?? undefined, m.version),
      approvedAt: r.installedAt,
      publishedAt: null,
      blocked: revoked(m, s.revocations)
        ? "Revoked"
        : m.compatibility.minEngine > ENGINE_VERSION ||
            !versionSupported(m.compatibility.minExtension)
          ? "Needs a newer extension"
          : !r.retained
            ? "Archive no longer retained; import this exact version again"
            : null,
    });
  }
  for (const e of registry.entries) {
    const g = group(e.id, e.title),
      local = g.versions.find((v) => v.version === e.version);
    if (local?.retained) {
      local.publishedAt = e.publishedAt;
      continue;
    }
    const pin = s.versionPins[`${e.id}:${e.version}`];
    const item: VersionItem = {
      version: e.version,
      manifestSha256: e.manifestSha256,
      sourceCommit: e.sourceCommit,
      review: e.review,
      source: "registry",
      retained: false,
      current: g.installedVersion === e.version,
      action: versionAction(g.installedVersion ?? undefined, e.version),
      approvedAt: local?.approvedAt ?? null,
      publishedAt: e.publishedAt,
      blocked: revoked(e, s.revocations)
        ? "Revoked"
        : pin && pin !== e.manifestSha256
          ? "Catalog conflicts with approved version identity"
          : e.review !== "reviewed"
            ? "Not publicly reviewed"
            : null,
    };
    if (local) g.versions.splice(g.versions.indexOf(local), 1, item);
    else g.versions.push(item);
  }
  for (const g of groups.values()) {
    g.versions.sort((a, b) => compareVersions(b.version, a.version));
    g.updateVersion =
      g.versions.find(
        (v) =>
          g.installedVersion &&
          !v.blocked &&
          !v.current &&
          compareVersions(v.version, g.installedVersion) > 0,
      )?.version ?? null;
  }
  return {
    retention: {
      previousPerAdapter: HISTORY_PREVIOUS_LIMIT,
      historyByteLimit: HISTORY_BYTE_LIMIT,
    },
    adapters: [...groups.values()].sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
    refreshedAt:
      typeof raw.registryRefreshedAt === "string"
        ? raw.registryRefreshedAt
        : null,
    refreshError:
      typeof raw.registryRefreshError === "string"
        ? raw.registryRefreshError
        : null,
  };
}
export async function prepareVersion(id: string, version: string) {
  const s = await readStore(),
    cached = s.versionHistory[`${id}:${version}`];
  let p, sourceCommit, review, launchUrl;
  if (cached?.retained) {
    p = await loadPackage(cached.manifest);
    sourceCommit = cached.sourceCommit;
    review = cached.review;
    launchUrl = cached.launchUrl;
  } else {
    // Remote packages are re-resolved from a fresh safety/catalog snapshot. Never
    // fall back to stale metadata to authorize a download after refresh failure.
    await refreshRegistry();
    const raw = await chrome.storage.local.get("registry");
    const index = registrySchema.parse(raw.registry);
    const entry = index.entries.find(
      (e) => e.id === id && e.version === version,
    );
    if (!entry || entry.review !== "reviewed")
      throw new Error(
        "This version has no retained local archive or reviewed registry package.",
      );
    p = await registryPackage(entry);
    sourceCommit = entry.sourceCommit;
    review = entry.review;
  }
  const plan = await planActivation(p);
  return { p, sourceCommit, review, ...(launchUrl ? { launchUrl } : {}), plan };
}
