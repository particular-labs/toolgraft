import { z } from "zod";
import { compareVersions } from "./versions.ts";
import {
  inputSchemaSchema,
  validateToolInput,
  createPackageSchema,
} from "@webmcp-today/schema";
// Extension CSP forbids generated validators; always use Zod's interpreter.
z.config({ jitless: true });
export { validateToolInput };
export const ENGINE_VERSION = 1;
export const EXTENSION_VERSION = "0.6.1";
export const INPUT_LIMIT = 64 * 1024,
  OUTPUT_LIMIT = 256 * 1024,
  ARCHIVE_LIMIT = 1024 * 1024;
export const utf8 = new TextEncoder();
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .filter((k) => Reflect.get(value, k) !== undefined)
      .map((k) => JSON.stringify(k) + ":" + canonical(Reflect.get(value, k)))
      .join(",") +
    "}"
  );
}
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? utf8.encode(value) : value;
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
const semver = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "Use a stable major.minor.patch version",
  );
export function versionSupported(
  required: string,
  current = EXTENSION_VERSION,
) {
  return compareVersions(required, current) <= 0;
}
export { parsePattern, matchesUrl, assertInput } from "./runtime.ts";
import { parsePattern } from "./runtime.ts";
const pattern = z
  .string()
  .max(2048)
  .refine((v) => {
    try {
      parsePattern(v);
      return true;
    } catch {
      return false;
    }
  }, "Only exact HTTPS hosts or HTTP localhost are allowed");
export const toolSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  description: z.string().min(1).max(500),
  inputSchema: inputSchemaSchema
    .refine((s) => Object.keys(s.properties).length <= 20)
    .refine((s) =>
      (s.required ?? []).every((k) => Object.hasOwn(s.properties, k)),
    )
    .refine((s) =>
      Object.keys(s.properties).every(
        (k) => !["__proto__", "constructor", "prototype"].includes(k),
      ),
    ),
  annotations: z.strictObject({
    readOnlyHint: z.boolean(),
    destructiveHint: z.boolean().optional(),
    untrustedContentHint: z.literal(true),
  }),
});
export const manifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/),
    version: semver,
    title: z.string().min(1).max(100),
    description: z.string().min(1).max(500),
    license: z.literal("MIT"),
    source: z.string().url().startsWith("https://github.com/"),
    matches: z.array(pattern).min(1).max(20),
    runtime: z.discriminatedUnion("kind", [
      z.strictObject({
        kind: z.literal("script"),
        world: z.literal("USER_SCRIPT"),
        runAt: z.literal("document_idle"),
        entry: z.literal("bundle.js"),
      }),
      z.strictObject({
        kind: z.literal("api"),
        format: z.literal("webmcp-today@1"),
        definition: z.literal("webmcp-package.json"),
      }),
    ]),
    permissions: z.strictObject({
      hosts: z.array(pattern).min(1).max(20),
      network: z.enum(["same-origin", "declared-origins"]),
      pageStorage: z.boolean(),
    }),
    compatibility: z.strictObject({
      minExtension: semver,
      minEngine: z.number().int().positive(),
    }),
    tools: z.array(toolSchema).min(1).max(30),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
    routeScoped: z.boolean().default(false),
  })
  .superRefine((m, c) => {
    if (new Set(m.tools.map((t) => t.name)).size !== m.tools.length)
      c.addIssue({ code: "custom", message: "Duplicate tool names" });
    for (const match of m.matches) {
      const p = parsePattern(match);
      if (!m.permissions.hosts.includes(`${p.protocol}://${p.host}/*`))
        c.addIssue({
          code: "custom",
          message:
            "Each matching host requires an exact origin permission with /* path",
        });
    }
    if (m.permissions.hosts.some((p) => parsePattern(p).path !== "/*"))
      c.addIssue({ code: "custom", message: "Permission paths must be /*" });
  });
export type Manifest = z.infer<typeof manifestSchema>;
export type ToolDescriptor = z.infer<typeof toolSchema>;
export const revocationsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  revoked: z.array(
    z.strictObject({
      id: z.string(),
      version: z.string(),
      reason: z.string().min(1).max(500),
    }),
  ),
});
export type Revocations = z.infer<typeof revocationsSchema>;
export const registrySchema = z.strictObject({
  schemaVersion: z.literal(1),
  entries: z.array(
    z.strictObject({
      id: z.string(),
      version: semver,
      title: z.string(),
      runtime: z.enum(["script", "api"]),
      matches: z.array(pattern),
      manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
      artifact: z.string(),
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      review: z.enum(["local", "reviewed", "experimental"]),
      publishedAt: z.string().datetime(),
    }),
  ),
});
export type Registry = z.infer<typeof registrySchema>;
export type Package = {
  manifest: Manifest;
  payload: string;
  license: string;
  notice: string;
};
export function revoked(m: Pick<Manifest, "id" | "version">, r: Revocations) {
  return r.revoked.some(
    (x) => x.id === m.id && (x.version === m.version || x.version === "*"),
  );
}
export function validateApi(m: Manifest, payload: string) {
  const p = createPackageSchema.parse(JSON.parse(payload));
  if (
    !versionSupported(m.compatibility.minExtension) ||
    m.compatibility.minEngine > ENGINE_VERSION
  )
    throw new Error("Unsupported engine");
  if (p.minEngine > ENGINE_VERSION) throw new Error("Unsupported API engine");
  for (const auth of Object.values(p.api.auth ?? {}))
    if ((auth.ttlSeconds ?? 0) > 300)
      throw new Error("Auth token TTL exceeds five minutes");
  const origin = new URL(p.api.baseUrl).origin;
  if (!m.permissions.hosts.includes(origin + "/*"))
    throw new Error("API origin not granted");
  if (
    !m.matches.every(
      (s) => parsePattern(s).host === new URL(p.api.baseUrl).hostname,
    )
  )
    throw new Error("API base must match the page origin");
  // A mechanical wrapper may select a read-only subset of an upstream package.
  for (const t of m.tools) {
    const original = p.tools.find((x) => x.name === t.name);
    if (
      !original ||
      canonical(original.inputSchema) !== canonical(t.inputSchema) ||
      original.annotations?.readOnlyHint !== t.annotations.readOnlyHint ||
      !!original.annotations?.destructiveHint !==
        !!t.annotations.destructiveHint
    )
      throw new Error("API descriptor differs from upstream definition");
  }
  for (const endpoint of Object.values(p.api.endpoints)) {
    if ("baseUrl" in endpoint && endpoint.baseUrl) {
      const remote = new URL(String(endpoint.baseUrl));
      if (
        (m.permissions.network === "same-origin" && remote.origin !== origin) ||
        !m.permissions.hosts.includes(remote.origin + "/*")
      )
        throw new Error("Undeclared endpoint origin");
    }
  }
  return p;
}
export async function verifyPackage(p: Package) {
  const manifest = manifestSchema.parse(p.manifest);
  if ((await sha256(p.payload)) !== manifest.payloadSha256)
    throw new Error("Payload SHA-256 mismatch");
  if (!p.license.includes("MIT License"))
    throw new Error("Missing MIT license");
  if (manifest.runtime.kind === "api") validateApi(manifest, p.payload);
  return { ...p, manifest };
}
export function changes(a: Manifest, b: Manifest) {
  return {
    version: `${a.version} → ${b.version}`,
    runtime: `${a.runtime.kind} → ${b.runtime.kind}`,
    addedTools: b.tools
      .filter((t) => !a.tools.some((x) => x.name === t.name))
      .map((t) => t.name),
    removedTools: a.tools
      .filter((t) => !b.tools.some((x) => x.name === t.name))
      .map((t) => t.name),
    changedTools: b.tools
      .filter((t) =>
        a.tools.some((x) => x.name === t.name && canonical(x) !== canonical(t)),
      )
      .map((t) => t.name),
    addedHosts: b.permissions.hosts.filter(
      (h) => !a.permissions.hosts.includes(h),
    ),
    removedHosts: a.permissions.hosts.filter(
      (h) => !b.permissions.hosts.includes(h),
    ),
    permissionsChanged: canonical(a.permissions) !== canonical(b.permissions),
  };
}

export {
  compareVersions,
  versionAction,
  type VersionAction,
  type ActivationPlan,
} from "./versions.ts";
