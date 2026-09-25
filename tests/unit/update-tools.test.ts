import { describe, it, expect } from "vitest";
import { updateTools } from "../../packages/mcp/src/update-tools";
import type { Draft } from "../../packages/mcp/src/builder";
const original = {
  name: "search",
  description: "Search",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: '() => { /* keep exactly */ return textResult({title: "–"}); }',
};
const draft: Draft = {
  id: "local.test",
  version: "0.1.1",
  title: "Test",
  description: "Test",
  url: "https://example.com",
  tools: [original],
};
describe("individual tool changes", () => {
  it("preserves untouched source and validates explicit operations", () => {
    const added = { ...original, name: "details" };
    const changed = updateTools(draft, [added], [], []);
    expect(changed.tools[0]).toEqual(original);
    expect(changed.tools[0]?.execute).toBe(original.execute);
    expect(
      updateTools(
        changed,
        [],
        [{ ...added, execute: "()=>textResult({ok:true})" }],
        [],
      ).tools[0],
    ).toEqual(original);
    expect(() => updateTools(draft, [original], [], [])).toThrow(
      "already exists",
    );
    expect(() => updateTools(draft, [], [added], [])).toThrow("does not exist");
    expect(() => updateTools(draft, [], [], ["unknown"])).toThrow(
      "does not exist",
    );
    expect(() => updateTools(draft, [added], [added], [])).toThrow("only once");
    expect(() => updateTools(draft, [], [], [])).toThrow("at least one");
    expect(updateTools(changed, [], [], ["details"]).tools).toEqual([original]);
    expect(draft.tools).toEqual([original]);
  });
});
