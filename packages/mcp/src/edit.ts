import ts from "typescript";
import {
  canonical,
  verifyPackage,
  type Package,
} from "@toolgraft/adapter-schema";
import { compileDraft, draftSchema, safeUrl } from "./builder.ts";

const unsupported = () =>
  new Error(
    "EDIT_SOURCE_UNAVAILABLE: This package cannot be recovered losslessly by this ToolGraft builder. Supply its original source or explicitly recreate the complete adapter; do not drop tools or execute its bundle on the host.",
  );
function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
}
// A deliberately tiny literal reader, not a JavaScript interpreter. Never eval
// or import the installed payload. Function bodies remain unexecuted source.
function literal(node: ts.Expression): unknown {
  node = unwrap(node);
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  )
    return -Number(node.operand.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    const result = Object.create(null);
    for (const p of node.properties) {
      if (
        !ts.isPropertyAssignment(p) ||
        !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ||
        Object.hasOwn(result, p.name.text)
      )
        throw unsupported();
      result[p.name.text] = literal(p.initializer);
    }
    return result;
  }
  throw unsupported();
}

export async function recoverInstalledDraft(
  raw: Package,
  url: string,
  runtime: string,
) {
  const p = await verifyPackage(raw);
  if (p.manifest.runtime.kind !== "script") throw unsupported();
  safeUrl(url);
  const file = ts.createSourceFile(
    "installed.js",
    p.payload,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "ToolGraftRuntime" &&
      node.expression.name.text === "startManagedAdapter"
    )
      calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(file);
  const call = calls[0];
  if (calls.length !== 1 || !call || call.arguments.length !== 2)
    throw unsupported();
  const adapter = call.arguments[0]!;
  if (!ts.isObjectLiteralExpression(adapter) || adapter.properties.length !== 1)
    throw unsupported();
  const toolsProperty = adapter.properties[0]!;
  if (
    !ts.isPropertyAssignment(toolsProperty) ||
    toolsProperty.name.getText(file) !== "tools" ||
    !ts.isArrayLiteralExpression(toolsProperty.initializer)
  )
    throw unsupported();
  const tools = toolsProperty.initializer.elements.map((node) => {
    if (!ts.isObjectLiteralExpression(node) || node.properties.length !== 2)
      throw unsupported();
    const [spread, implementation] = node.properties;
    if (
      !spread ||
      !ts.isSpreadAssignment(spread) ||
      !implementation ||
      !ts.isPropertyAssignment(implementation) ||
      implementation.name.getText(file) !== "execute"
    )
      throw unsupported();
    const descriptor = literal(spread.expression);
    if (
      !descriptor ||
      typeof descriptor !== "object" ||
      Array.isArray(descriptor)
    )
      throw unsupported();
    return {
      ...descriptor,
      execute: unwrap(implementation.initializer).getText(file),
    };
  });
  const draft = draftSchema.parse({
    id: p.manifest.id,
    version: p.manifest.version,
    title: p.manifest.title,
    description: p.manifest.description,
    url,
    tools,
  });
  const rebuilt = await compileDraft(draft, runtime, p.license);
  // Refuse unknown wrappers, captured helpers, omitted tools, extra side effects,
  // different permissions or incompatible runtime versions. Exact reproduction
  // is the supported-format gate, not a claim that the source is trustworthy.
  if (
    rebuilt.package.payload !== p.payload ||
    canonical(rebuilt.package.manifest) !== canonical(p.manifest)
  )
    throw unsupported();
  return draft;
}
