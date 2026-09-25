#!/usr/bin/env node
import { build } from "esbuild";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  mkdtemp,
  rm,
  access,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  compareVersions,
  manifestSchema,
  toolSchema,
  canonical,
  sha256,
  registrySchema,
  revocationsSchema,
  validateApi,
  type Manifest,
  type Package,
} from "@toolgraft/adapter-schema";
import { pack, unpack } from "@toolgraft/adapter-schema/archive";
const root = process.cwd();
const args = process.argv.slice(2);
const command = args[0],
  slug = args[1];
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const output = async (p: string, value: string | Uint8Array) => {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, value);
};
function adapterDir(name: string) {
  if (!/^[a-z][a-z0-9-]*$/.test(name))
    throw new Error(
      "Adapter slug must be lowercase letters, numbers, and hyphens.",
    );
  return join(root, "adapters", name);
}
async function slugs() {
  return (await readdir(join(root, "adapters"), { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
async function compile(name: string): Promise<Package> {
  const dir = adapterDir(name),
    meta = await json(join(dir, "adapter.json"));
  let payload: string;
  let tools: unknown[];
  if (meta.runtime.kind === "script") {
    const temp = await mkdtemp(join(tmpdir(), "toolgraft-build-"));
    try {
      const inspect = join(temp, "inspect.mjs");
      await build({
        entryPoints: [join(dir, "src/index.ts")],
        outfile: inspect,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "es2023",
        logLevel: "silent",
      });
      const adapter = (await import(pathToFileURL(inspect).href)).default;
      if (!adapter || !Array.isArray(adapter.tools))
        throw new Error("Export defineAdapter({ tools })");
      tools = adapter.tools.map(
        ({ execute, ...descriptor }: Record<string, unknown>) => {
          if (typeof execute !== "function")
            throw new Error("Tool is missing execute");
          return toolSchema.parse(descriptor);
        },
      );
      const manifest = manifestSchema.parse({
        ...meta,
        tools,
        payloadSha256: "0".repeat(64),
      });
      const result = await build({
        stdin: {
          contents: `import adapter from ${JSON.stringify(join(dir, "src/index.ts"))};import { startAdapter } from '@toolgraft/adapter-sdk';startAdapter(adapter,${canonical(manifest)});`,
          resolveDir: root,
          sourcefile: "adapter-bootstrap.ts",
          loader: "ts",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "chrome138",
        minify: false,
        sourcemap: false,
        legalComments: "inline",
      });
      payload = result.outputFiles[0]!.text;
      if (/\beval\s*\(|new\s+Function\s*\(|\bimport\s*\(/.test(payload))
        throw new Error("Packed script contains forbidden dynamic execution");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  } else {
    payload = canonical(await json(join(dir, "webmcp-package.json")));
    const definition = JSON.parse(payload);
    tools = definition.tools.map((t: Record<string, unknown>) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { ...(t.annotations as object), untrustedContentHint: true },
    }));
  }
  const manifest = manifestSchema.parse({
    ...meta,
    tools,
    payloadSha256: await sha256(payload),
  });
  if (manifest.runtime.kind === "api") validateApi(manifest, payload);
  const license = await readFile(join(dir, "LICENSE"), "utf8");
  const notice = await readFile(join(dir, "NOTICE"), "utf8");
  return { manifest, payload, license, notice };
}
async function buildOne(name: string) {
  const p = await compile(name);
  const target = join(adapterDir(name), "dist");
  await output(join(target, "manifest.json"), canonical(p.manifest) + "\n");
  await output(
    join(
      target,
      p.manifest.runtime.kind === "script"
        ? "bundle.js"
        : "webmcp-package.json",
    ),
    p.payload,
  );
  await output(join(target, "adapter.tgz"), await pack(p));
  console.log(
    `${name}: ${p.manifest.tools.length} tools, ${p.manifest.runtime.kind}, ${p.manifest.payloadSha256}`,
  );
  return p;
}
async function registryBuild(verify = false) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const entries = [];
  for (const name of await slugs()) {
    const p = await compile(name);
    const bytes = await pack(p);
    const path = `packages/${p.manifest.id}/${p.manifest.version}/adapter.tgz`;
    const target = join(root, "registry", path);
    try {
      const old = new Uint8Array(await readFile(target));
      if (Buffer.compare(old, bytes) !== 0)
        throw new Error(
          `Immutable artifact changed: ${path}. Bump the version.`,
        );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        if (verify) throw new Error(`Missing artifact: ${path}`);
        await output(target, bytes);
      } else throw e;
    }
    const oldIndex = await json(join(root, "registry/index.v1.json")).catch(
      () => ({ entries: [] }),
    );
    const previous = oldIndex.entries.find(
      (e: { id: string; version: string }) =>
        e.id === p.manifest.id && e.version === p.manifest.version,
    );
    entries.push({
      id: p.manifest.id,
      version: p.manifest.version,
      title: p.manifest.title,
      runtime: p.manifest.runtime.kind,
      matches: p.manifest.matches,
      manifestSha256: await sha256(canonical(p.manifest)),
      artifact: path,
      sourceCommit: previous?.sourceCommit ?? commit,
      review:
        previous?.review ??
        (p.manifest.id.startsWith("experimental.") ? "experimental" : "local"),
      publishedAt:
        previous?.publishedAt ??
        new Date(
          execFileSync("git", ["show", "-s", "--format=%cI", commit], {
            encoding: "utf8",
          }).trim(),
        ).toISOString(),
    });
  }
  const previous = await json(join(root, "registry/index.v1.json")).catch(
    () => ({ entries: [] }),
  );
  for (const old of previous.entries) {
    if (!entries.some((e) => e.id === old.id && e.version === old.version))
      entries.push(old);
  }
  entries.sort(
    (a, b) => a.id.localeCompare(b.id) || compareVersions(a.version, b.version),
  );
  const index = registrySchema.parse({ schemaVersion: 1, entries });
  const text = canonical(index) + "\n";
  const dest = join(root, "registry/index.v1.json");
  if (verify) {
    if ((await readFile(dest, "utf8")) !== text)
      throw new Error("Registry index is stale");
  } else await output(dest, text);
  revocationsSchema.parse(
    await json(join(root, "registry/revocations.v1.json")),
  );
  if (!verify)
    await output(
      join(root, "registry/known-domains.v1.json"),
      canonical({
        schemaVersion: 1,
        domains: [...new Set(entries.flatMap((e) => e.matches))].sort(),
      }) + "\n",
    );
  console.log(
    `Registry ${verify ? "verified" : "built"}: ${entries.length} immutable versions. Unreviewed entries remain local.`,
  );
}
async function init(name: string) {
  const dir = adapterDir(name);
  try {
    await access(dir);
    throw new Error("Adapter directory already exists");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const urlArg = args[args.indexOf("--url") + 1];
  if (!args.includes("--url") || !urlArg)
    throw new Error("Provide --url https://site.example");
  const u = new URL(urlArg);
  const kind = args.includes("--runtime")
    ? args[args.indexOf("--runtime") + 1]
    : "script";
  if (kind !== "script")
    throw new Error(
      "For API packages use import <slug> <webmcp-package.json>.",
    );
  const meta = {
    schemaVersion: 1,
    id: `local.${name}`,
    version: "0.1.0",
    title: name,
    description: `Read the current ${name} page title.`,
    source: "https://github.com/particular-labs/toolgraft",
    license: "MIT",
    matches: [u.origin + "/*"],
    runtime: {
      kind: "script",
      world: "USER_SCRIPT",
      runAt: "document_idle",
      entry: "bundle.js",
    },
    permissions: {
      hosts: [u.origin + "/*"],
      network: "same-origin",
      pageStorage: false,
    },
    compatibility: { minExtension: "0.1.0", minEngine: 1 },
    routeScoped: true,
  };
  manifestSchema.parse({
    ...meta,
    tools: [
      {
        name: "page_title",
        description: "Read page title.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
      },
    ],
    payloadSha256: "0".repeat(64),
  });
  await output(join(dir, "adapter.json"), JSON.stringify(meta, null, 2) + "\n");
  await output(
    join(dir, "src/index.ts"),
    `import {defineAdapter,textResult} from '@toolgraft/adapter-sdk';\nexport default defineAdapter({tools:[{name:'page_title',description:'Read page title.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>textResult(document.title)}]});\n`,
  );
  await output(
    join(dir, "LICENSE"),
    await readFile(join(root, "LICENSE"), "utf8"),
  );
  await output(
    join(dir, "NOTICE"),
    "ToolGraft local adapter. Review before installation.\n",
  );
  console.log(`Created ${dir}`);
}
async function main() {
  if (command === "registry") {
    await registryBuild(slug === "verify");
    return;
  }
  if (command === "init" && slug) {
    await init(slug);
    return;
  }
  if (["build", "validate", "pack", "test", "dev"].includes(command ?? "")) {
    const names = slug === "--all" ? await slugs() : [slug!];
    for (const name of names) {
      if (!name) throw new Error("Provide an adapter slug or --all");
      const p = await buildOne(name);
      if (command === "test") {
        const again = await compile(name);
        if (Buffer.compare(await pack(p), await pack(again)) !== 0)
          throw new Error("Non-deterministic build");
        await unpack(await pack(p));
        console.log(
          "Deterministic package and hash roundtrip passed. Browser acceptance is a separate gate.",
        );
      }
    }
    if (command === "dev")
      console.log(
        "Install the built .tgz from ToolGraft options, then reload the matching tab. Rebuild after edits; no executable hot reload.",
      );
    return;
  }
  if (command === "import" && slug && args[2]) {
    const p = await json(resolve(args[2]));
    const selected = p.tools.filter(
      (t: { annotations?: { readOnlyHint?: boolean } }) =>
        t.annotations?.readOnlyHint === true,
    );
    if (!selected.length) throw new Error("No read-only tools to import");
    const used = new Set(
      selected.map(
        (t: { execution: { endpoint: string } }) => t.execution.endpoint,
      ),
    );
    p.tools = selected;
    p.api.endpoints = Object.fromEntries(
      Object.entries(p.api.endpoints).filter(([name]) => used.has(name)),
    );
    delete p.api.auth;
    const dir = adapterDir(slug);
    await access(join(dir, "adapter.json"));
    await output(
      join(dir, "webmcp-package.json"),
      JSON.stringify(p, null, 2) + "\n",
    );
    await buildOne(slug);
    return;
  }
  console.log(
    "toolgraft init <slug> --url <url> --runtime script\ntoolgraft build|validate|pack|test|dev <slug>|--all\ntoolgraft import <existing-api-slug> <upstream.json>\ntoolgraft registry build|verify",
  );
}
await main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
