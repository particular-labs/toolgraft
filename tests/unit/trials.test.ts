import { describe, it, expect } from "vitest";
import { trialPassed } from "@toolgraft/agent-core";
const positive = { tool: "read", input: {} };
const negative = { ...positive, expectedError: "UNSUPPORTED_PAGE" };
const response = (code: string, isError = true) => ({
  isError,
  content: [{ type: "text", text: JSON.stringify({ code }) }],
});
describe("browser trial expectations", () => {
  it("accepts only the requested application error for a negative test", () => {
    expect(trialPassed(negative, response("UNSUPPORTED_PAGE"))).toBe(true);
    expect(trialPassed(negative, response("SEARCH_UNAVAILABLE"))).toBe(false);
    expect(trialPassed(negative, response("UNSUPPORTED_PAGE", false))).toBe(
      false,
    );
  });
  it("does not mistake transport failures or malformed results for expected errors", () => {
    for (const value of [
      undefined,
      { error: "UNSUPPORTED_PAGE" },
      { isError: true, content: [] },
      { isError: true, content: [{ type: "text", text: "UNSUPPORTED_PAGE" }] },
    ])
      expect(trialPassed(negative, value)).toBe(false);
  });
  it("still fails an unexpected application error and an empty success", () => {
    expect(trialPassed(positive, response("UNSUPPORTED_PAGE"))).toBe(false);
    expect(trialPassed(positive, { content: [] })).toBe(false);
    expect(
      trialPassed(positive, { content: [{ type: "text", text: "[]" }] }),
    ).toBe(true);
  });
});
