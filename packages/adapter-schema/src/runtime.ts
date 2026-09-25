import type { ToolDescriptor } from "./index.ts";
export const utf8 = new TextEncoder();
export const INPUT_LIMIT = 64 * 1024,
  OUTPUT_LIMIT = 256 * 1024;
export function parsePattern(pattern: string) {
  const m = /^(https?):\/\/([a-z0-9.-]+)(\/[^?#]*)$/.exec(pattern);
  if (!m || m[2] === "*" || (m[1] === "http" && m[2] !== "localhost"))
    throw new Error(
      "Use HTTPS and an exact host, or HTTP localhost for development.",
    );
  const u = new URL(`${m[1]}://${m[2]}/`);
  if (u.hostname !== m[2] || (!m[2]!.includes(".") && m[2] !== "localhost"))
    throw new Error("Invalid host");
  return { protocol: m[1]!, host: m[2]!, path: m[3]! };
}
export function matchesUrl(pattern: string, url: string): boolean {
  try {
    const p = parsePattern(pattern),
      u = new URL(url);
    return (
      u.protocol === p.protocol + ":" &&
      u.hostname === p.host &&
      new RegExp(
        "^" +
          p.path
            .split("*")
            .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*") +
          "$",
      ).test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function assertInput(
  tool: ToolDescriptor,
  input: unknown,
): Record<string, string | number | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Input must be an object");
  if (utf8.encode(JSON.stringify(input)).length > INPUT_LIMIT)
    throw new Error("Input exceeds 64 KiB");
  const schema = tool.inputSchema,
    result: Record<string, string | number | boolean> = Object.create(null);
  for (const key of schema.required ?? [])
    if (!Object.hasOwn(input, key)) throw new Error(`Missing input: ${key}`);
  for (const [key, v] of Object.entries(input)) {
    if (!Object.hasOwn(schema.properties, key))
      throw new Error(`Unexpected input: ${key}`);
    const p = schema.properties[key]!;
    if (
      p.type === "integer"
        ? typeof v !== "number" || !Number.isSafeInteger(v)
        : typeof v !== p.type
    )
      throw new Error(`Invalid type: ${key}`);
    if (typeof v === "number" && !Number.isFinite(v))
      throw new Error(`Invalid number: ${key}`);
    if (p.enum && !p.enum.some((x) => x === v))
      throw new Error(`Invalid enum: ${key}`);
    if (
      typeof v === "string" &&
      p.type === "string" &&
      ((p.minLength !== undefined && [...v].length < p.minLength) ||
        (p.maxLength !== undefined && [...v].length > p.maxLength))
    )
      throw new Error(`Invalid length: ${key}`);
    if (
      typeof v === "number" &&
      (p.type === "number" || p.type === "integer") &&
      ((p.minimum !== undefined && v < p.minimum) ||
        (p.maximum !== undefined && v > p.maximum))
    )
      throw new Error(`Out of range: ${key}`);
    result[key] = v;
  }
  return result;
}
