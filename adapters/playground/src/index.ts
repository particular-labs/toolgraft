import {
  defineAdapter,
  ToolGraftError,
  textResult,
} from "@toolgraft/adapter-sdk";
const empty = {
  type: "object" as const,
  properties: {},
  additionalProperties: false as const,
};
const idInput = {
  ...empty,
  properties: { id: { type: "string" as const, minLength: 1, maxLength: 50 } },
  required: ["id"],
};
function root() {
  const r = document.querySelector('[data-toolgraft-tasks="v1"]');
  if (!r)
    throw new ToolGraftError(
      "PAGE_SHAPE_CHANGED",
      "The task list is missing or not ready.",
      "Wait for rendering or reset the markup scenario.",
    );
  return r;
}
function tasks() {
  return [...root().querySelectorAll<HTMLElement>("[data-task-id]")].map(
    (row) => ({
      id: row.dataset.taskId!,
      title: row.querySelector("[data-title]")!.textContent!,
      completed: row.dataset.completed === "true",
    }),
  );
}
function signedIn() {
  if (document.documentElement.dataset.session !== "signed-in")
    throw new ToolGraftError(
      "AUTH_REQUIRED",
      "The demo session is signed out.",
      "Use Sign in to demo on the playground.",
    );
}
function find(id: string) {
  const result = tasks().find((t) => t.id === id);
  if (!result)
    throw new ToolGraftError(
      "UNSUPPORTED_PAGE",
      "No task with this ID.",
      "List tasks and choose an existing ID.",
    );
  return result;
}
export default defineAdapter({
  tools: [
    {
      name: "playground_list_tasks",
      description: "List the synthetic playground tasks.",
      inputSchema: empty,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => textResult(tasks()),
    },
    {
      name: "playground_get_task",
      description: "Read one playground task by ID.",
      inputSchema: idInput,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ id }) => textResult(find(String(id))),
    },
    {
      name: "playground_create_task",
      description: "Create one synthetic task after approval.",
      inputSchema: {
        ...empty,
        properties: { title: { type: "string", minLength: 1, maxLength: 200 } },
        required: ["title"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: ({ title }) => {
        signedIn();
        root();
        const input = document.querySelector<HTMLInputElement>("#title");
        const form = document.querySelector<HTMLFormElement>("#create");
        if (!input || !form)
          throw new ToolGraftError(
            "PAGE_SHAPE_CHANGED",
            "Create form is missing.",
          );
        input.value = String(title);
        form.requestSubmit();
        return textResult(tasks().at(-1));
      },
    },
    {
      name: "playground_complete_task",
      description: "Complete a task after approval.",
      inputSchema: idInput,
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: ({ id }) => {
        signedIn();
        find(String(id));
        const button = [
          ...root().querySelectorAll<HTMLButtonElement>("[data-complete]"),
        ].find((b) => b.dataset.complete === id);
        if (!button)
          throw new ToolGraftError(
            "PAGE_SHAPE_CHANGED",
            "Complete button is missing.",
          );
        button.click();
        return textResult(find(String(id)));
      },
    },
    {
      name: "playground_reset",
      description: "Reset all synthetic tasks to their initial values.",
      inputSchema: empty,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        untrustedContentHint: true,
      },
      execute: () => {
        signedIn();
        root();
        const reset = document.querySelector<HTMLButtonElement>("#reset");
        if (!reset)
          throw new ToolGraftError(
            "PAGE_SHAPE_CHANGED",
            "Reset control is missing.",
          );
        reset.click();
        return textResult(tasks());
      },
    },
  ],
});
