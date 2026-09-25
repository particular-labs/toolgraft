import ts from "typescript";
import { transform } from "esbuild";
import { z } from "zod";
import {
  canonical,
  manifestSchema,
  toolSchema,
  sha256,
  type Package,
} from "@toolgraft/adapter-schema";
import { pack, unpack } from "@toolgraft/adapter-schema/archive";

export const authoredToolSchema = toolSchema.extend({
  execute: z.string().min(1).max(40000),
});
export const draftSchema = z.strictObject({
  id: z.string(),
  version: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  url: z.string().url().max(2048),
  tools: z.array(authoredToolSchema).min(1).max(20),
});
export type Draft = z.infer<typeof draftSchema>;
export function safeUrl(value: string) {
  const u = new URL(value);
  if (
    (u.protocol !== "https:" &&
      !(u.protocol === "http:" && u.hostname === "localhost")) ||
    u.username ||
    u.password
  )
    throw new Error(
      "Use an exact HTTPS website or HTTP localhost URL, without embedded credentials.",
    );
  return u;
}
export function validateFunction(source: string) {
  const file = ts.createSourceFile(
    "execute.ts",
    `const execute = (${source});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const stmt = file.statements[0];
  if (file.statements.length !== 1 || !stmt || !ts.isVariableStatement(stmt))
    throw new Error("execute must be a function expression, not a script.");
  const initial = stmt.declarationList.declarations[0]?.initializer;
  const expression =
    initial && ts.isParenthesizedExpression(initial)
      ? initial.expression
      : initial;
  if (
    !expression ||
    (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression))
  )
    throw new Error(
      "execute must be an arrow function or function expression.",
    );
  function check(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      node.kind === ts.SyntaxKind.ImportKeyword
    )
      throw new Error("Imports are not supported in adapter functions.");
    if (
      ts.isIdentifier(node) &&
      ["eval", "Function", "WebAssembly", "require", "process"].includes(
        node.text,
      )
    )
      throw new Error(`Unsupported runtime reference: ${node.text}`);
    ts.forEachChild(node, check);
  }
  check(file);
}
export async function compileDraft(
  raw: unknown,
  runtime: string,
  license: string,
  notice = "Locally generated ToolGraft adapter. No public source review.\n",
): Promise<{ package: Package; bytes: Uint8Array; digest: string }> {
  const draft = draftSchema.parse(raw);
  const u = safeUrl(draft.url);
  for (const tool of draft.tools) {
    if (tool.name.startsWith("toolgraft_"))
      throw new Error("The toolgraft_ namespace is reserved for core tools.");
    validateFunction(tool.execute);
  }
  const tools = draft.tools.map(({ execute, ...descriptor }) => descriptor);
  const manifest = manifestSchema.parse({
    schemaVersion: 1,
    id: draft.id,
    version: draft.version,
    title: draft.title,
    description: draft.description,
    license: "MIT",
    source: "https://github.com/particular-labs/toolgraft",
    matches: [`${u.protocol}//${u.hostname}${u.pathname}`],
    runtime: {
      kind: "script",
      world: "USER_SCRIPT",
      runAt: "document_idle",
      entry: "bundle.js",
    },
    permissions: {
      hosts: [`${u.protocol}//${u.hostname}/*`],
      network: "same-origin",
      pageStorage: false,
    },
    compatibility: { minExtension: "0.2.0", minEngine: 1 },
    tools,
    payloadSha256: "0".repeat(64),
    routeScoped: true,
  });
  const implementations = draft.tools
    .map(({ execute, ...t }) => `{...${canonical(t)},execute:(${execute})}`)
    .join(",");
  const code = `${runtime}\n;(()=>{const {textResult,ToolGraftError}=ToolGraftRuntime;ToolGraftRuntime.startManagedAdapter({tools:[${implementations}]},${canonical(manifest)});})();`;
  const result = await transform(code, {
    loader: "ts",
    target: "chrome138",
    format: "iife",
    legalComments: "inline",
  });
  if (result.code.length > 800000) throw new Error("Adapter bundle too large.");
  const p = {
    manifest: { ...manifest, payloadSha256: await sha256(result.code) },
    payload: result.code,
    license,
    notice,
  };
  const bytes = await pack(p);
  await unpack(bytes);
  return { package: p, bytes, digest: await sha256(bytes) };
}
