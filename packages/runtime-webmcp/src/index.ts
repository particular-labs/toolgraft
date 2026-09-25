export interface ModelContextLike {
  registerTool(
    tool: Record<string, unknown>,
    options?: { signal: AbortSignal },
  ): void | Promise<void>;
  getTools?(): Promise<Array<{ name: string }>>;
  executeTool?(tool: unknown, input: string): Promise<string>;
}
export function getModelContext(
  doc: object = document,
  nav: object = navigator,
): ModelContextLike | undefined {
  for (const target of [doc, nav]) {
    const c = Reflect.get(target, "modelContext");
    if (c && typeof c.registerTool === "function") return c as ModelContextLike;
  }
  return undefined;
}
export async function registerTools(
  context: ModelContextLike,
  tools: Array<Record<string, unknown> & { name: string }>,
  signal: AbortSignal,
) {
  const owned: string[] = [];
  const names = new Set(
    ((await context.getTools?.()) ?? []).map((t) => t.name),
  );
  for (const tool of tools) {
    if (signal.aborted) break;
    if (names.has(tool.name)) continue;
    try {
      await context.registerTool(tool, { signal });
      names.add(tool.name);
      owned.push(tool.name);
    } catch (e) {
      if (
        e instanceof DOMException &&
        ["SecurityError", "NotAllowedError"].includes(e.name)
      )
        throw e;
      if (e instanceof Error && /already|duplicate/i.test(e.message)) continue;
      throw e;
    }
  }
  return owned;
}
/** Chrome 153 client ABI. Never retry writes with alternate argument shapes. */
export async function callTool(
  context: ModelContextLike,
  name: string,
  input: unknown,
) {
  if (!context.getTools || !context.executeTool)
    throw new Error("WebMCP client API unavailable");
  const tool = (await context.getTools()).find((t) => t.name === name);
  if (!tool) throw new Error("Tool not registered");
  return context.executeTool(tool, JSON.stringify(input));
}
