import { executeApiTool } from "@webmcp-today/engine";
import { validateApi, type Manifest } from "@toolgraft/adapter-schema";
export function apiAdapter(manifest: Manifest, payload: string) {
  const definition = validateApi(manifest, payload);
  return {
    tools: manifest.tools.map((t) => ({
      ...t,
      execute: async (input: Record<string, string | number | boolean>) => {
        const original = definition.tools.find((x) => x.name === t.name)!;
        const endpoint = definition.api.endpoints[original.execution.endpoint]!;
        for (const match of endpoint.path.matchAll(/\{\{(\w+)\}\}/g)) {
          if ([".", ".."].includes(String(input[match[1]!]))) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    code: "VALIDATION_ERROR",
                    message: "Dot segments are not valid path parameters.",
                    hint: "Use a concrete resource ID.",
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        // ToolGraft's SDK handles every write confirmation before this executor runs.
        const result = await executeApiTool(
          {
            ...original,
            annotations: { ...original.annotations, destructiveHint: false },
          },
          definition.api,
          input,
        );
        const first = result.content[0]?.text ?? "";
        // Upstream 0.1.0 encodes failure as text without isError. Normalize its exact sentinel.
        const prefix = `Error executing "${t.name}": `;
        if (first.startsWith(prefix)) {
          const message = first.slice(prefix.length);
          const code = /Invalid input/i.test(message)
            ? "VALIDATION_ERROR"
            : /429/.test(message)
              ? "RATE_LIMITED"
              : /401|403|token|auth/i.test(message)
                ? "AUTH_REQUIRED"
                : /shape|projection|matched nothing/i.test(message)
                  ? "PAGE_SHAPE_CHANGED"
                  : "NETWORK_ERROR";
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  code,
                  message,
                  hint: "Check the page session and adapter version, then try again.",
                }),
              },
            ],
            isError: true,
          };
        }
        return result;
      },
    })),
  };
}
