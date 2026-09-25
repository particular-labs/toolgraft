export const workflowSteps = [
  "Ask your agent for a website task, such as ‘Find Toyota listings on ClasificadosOnline.’",
  "Approve the connection or website access if requested. Your agent handles the tools and opens the website.",
  "Need a new capability? Ask for it in ordinary language. Your agent prepares the change and proposes browser tests.",
  "Choose Try update to run those tests in a temporary tab. Your installed adapter stays unchanged. Generated scripts are trusted code with access to the approved site.",
  "Review the returned examples, then choose Keep update. A successful test covers those examples, not every page on the website.",
  "Your agent checks the installed update and continues your original task. If the conversation ends, ask it to resume your ToolGraft task.",
];
export const reviewStates = {
  awaiting_approval: "Needs approval",
  approved: "Access granted",
  testing: "Testing",
  tested: "Tests returned results · ready to review",
  installed: "Ready",
  declined: "Declined",
  expired: "Expired · ask your agent to resume",
  failed: "Needs repair",
} as const;
export type ReviewState = keyof typeof reviewStates;
export type TrialCase = {
  tool: string;
  input: Record<string, unknown>;
  expectedError?: string;
};
export type TrialResult = TrialCase & {
  result?: unknown;
  error?: string;
  passed: boolean;
};

/** Only explicit application errors qualify; transport failures never reach this function. */
export function trialPassed(test: TrialCase, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as {
    isError?: boolean;
    content?: { type?: string; text?: string }[];
  };
  if (!Array.isArray(result.content) || !result.content.length) return false;
  if (!test.expectedError) return result.isError !== true;
  if (result.isError !== true) return false;
  return result.content.some((item) => {
    if (item.type !== "text" || typeof item.text !== "string") return false;
    try {
      return JSON.parse(item.text).code === test.expectedError;
    } catch {
      return false;
    }
  });
}
