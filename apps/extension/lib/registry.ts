import {
  registrySchema,
  revocationsSchema,
  canonical,
  sha256,
  type Registry,
} from "@toolgraft/adapter-schema";
import { unpack } from "@toolgraft/adapter-schema/archive";
// A release may change this constant; the UI cannot redirect trust to another origin.
export const REGISTRY_BASE =
  "https://particular-labs.github.io/toolgraft/registry/";
async function fetchBounded(path: string, max = 1024 * 1024) {
  const url = new URL(path, REGISTRY_BASE);
  if (
    url.origin !== new URL(REGISTRY_BASE).origin ||
    !url.pathname.startsWith(new URL(REGISTRY_BASE).pathname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Registry URL is outside the configured registry.");
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    cache: "no-cache",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Registry returned ${response.status}. Try again later or install a local package.`,
    );
  if (Number(response.headers.get("content-length")) > max)
    throw new Error("Registry response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty registry response");
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new Error("Registry response too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return bytes;
}
export async function refreshRegistry() {
  try {
    return await refresh();
  } catch (e) {
    await chrome.storage.local.set({
      registryRefreshError: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
async function refresh() {
  const decoder = new TextDecoder();
  const [indexBytes, safetyBytes] = await Promise.all([
    fetchBounded("index.v1.json"),
    fetchBounded("revocations.v1.json"),
  ]);
  const index = registrySchema.parse(JSON.parse(decoder.decode(indexBytes)));
  const revocations = revocationsSchema.parse(
    JSON.parse(decoder.decode(safetyBytes)),
  );
  const identities = new Set<string>();
  for (const e of index.entries) {
    const key = `${e.id}:${e.version}`;
    if (identities.has(key))
      throw new Error("Duplicate registry version identity");
    identities.add(key);
  }
  const previous = (await chrome.storage.local.get("revocations")).revocations;
  if (
    previous &&
    revocations.updatedAt < revocationsSchema.parse(previous).updatedAt
  )
    throw new Error("Refusing an older safety list");
  await chrome.storage.local.set({
    registry: index,
    revocations,
    registryRefreshedAt: new Date().toISOString(),
    registryRefreshError: null,
  });
  return index;
}
export async function registryPackage(entry: Registry["entries"][number]) {
  const p = await unpack(await fetchBounded(entry.artifact));
  if (
    p.manifest.id !== entry.id ||
    p.manifest.version !== entry.version ||
    (await sha256(canonical(p.manifest))) !== entry.manifestSha256
  )
    throw new Error("Registry identity or manifest hash mismatch");
  return p;
}
