import {
  defineAdapter,
  textResult,
  ToolGraftError,
} from "@toolgraft/adapter-sdk";
const empty = {
  type: "object" as const,
  properties: {},
  additionalProperties: false as const,
};
function content() {
  const root = document.querySelector("#mw-content-text .mw-parser-output");
  if (!root)
    throw new ToolGraftError(
      "PAGE_SHAPE_CHANGED",
      "Article content is missing.",
      "Open an English Wikipedia article.",
    );
  return root;
}
export default defineAdapter({
  tools: [
    {
      name: "wikipedia_current_page",
      description:
        "Read this Wikipedia article title, canonical URL, and bounded introduction.",
      inputSchema: empty,
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => {
        const c = content();
        return textResult({
          title: document.querySelector("#firstHeading")?.textContent,
          url:
            document.querySelector<HTMLLinkElement>("link[rel=canonical]")
              ?.href ?? location.href,
          summary: [
            ...(
              c.querySelector('section[data-mw-section-id="0"]') ?? c
            ).querySelectorAll("p"),
          ]
            .map((p) => p.textContent?.trim() ?? "")
            .filter(Boolean)
            .slice(0, 5)
            .join("\n")
            .slice(0, 12000),
        });
      },
    },
    {
      name: "wikipedia_section_text",
      description: "Read bounded text from a named article section.",
      inputSchema: {
        ...empty,
        properties: {
          section: { type: "string", minLength: 1, maxLength: 200 },
        },
        required: ["section"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ section }) => {
        const c = content();
        const heading = [...c.querySelectorAll("h2,h3")].find(
          (h) =>
            h.textContent?.trim().toLowerCase() ===
            String(section).toLowerCase(),
        );
        if (!heading)
          throw new ToolGraftError(
            "PAGE_SHAPE_CHANGED",
            "Section not found.",
            "Use an exact visible section heading.",
          );
        let node = (heading.closest(".mw-heading") ?? heading)
          .nextElementSibling;
        let text = "";
        while (
          node &&
          !node.matches("h2,h3,.mw-heading") &&
          text.length < 20000
        ) {
          text += (node.textContent ?? "") + "\n";
          node = node.nextElementSibling;
        }
        return textResult({
          title: String(section),
          url: location.href,
          text: text.slice(0, 20000),
        });
      },
    },
    {
      name: "wikipedia_search",
      description:
        "Search English Wikipedia and return up to five article titles and links.",
      inputSchema: {
        ...empty,
        properties: { query: { type: "string", minLength: 1, maxLength: 200 } },
        required: ["query"],
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async ({ query }) => {
        const url = new URL("/w/api.php", location.origin);
        url.search = new URLSearchParams({
          action: "opensearch",
          format: "json",
          limit: "5",
          search: String(query),
        }).toString();
        const r = await fetch(url, {
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok)
          throw new ToolGraftError(
            r.status === 429 ? "RATE_LIMITED" : "NETWORK_ERROR",
            `Search returned ${r.status}.`,
          );
        const result = await r.json();
        if (
          !Array.isArray(result) ||
          !Array.isArray(result[1]) ||
          !Array.isArray(result[3])
        )
          throw new ToolGraftError(
            "PAGE_SHAPE_CHANGED",
            "Search response changed.",
          );
        return textResult(
          result[1].map((title: string, i: number) => ({
            title,
            url: result[3][i],
          })),
        );
      },
    },
  ],
});
