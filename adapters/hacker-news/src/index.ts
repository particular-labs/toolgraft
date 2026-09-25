import {
  defineAdapter,
  textResult,
  ToolGraftError,
} from "@toolgraft/adapter-sdk";
export default defineAdapter({
  tools: [
    {
      name: "hn_front_page",
      description:
        "Read visible Hacker News story rows, returning titles and canonical links.",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 30 } },
        required: ["limit"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: ({ limit }) => {
        const rows = [...document.querySelectorAll("tr.athing")].slice(
          0,
          Number(limit),
        );
        if (!rows.length)
          throw new ToolGraftError(
            "PAGE_SHAPE_CHANGED",
            "No story rows found.",
            "Open the Hacker News front page.",
          );
        return textResult(
          rows.map((row) => {
            const a = row.querySelector<HTMLAnchorElement>(".titleline > a");
            if (!a)
              throw new ToolGraftError(
                "PAGE_SHAPE_CHANGED",
                "A story title link is missing.",
              );
            return {
              id: row.id,
              title: a.textContent?.trim(),
              href: new URL(a.getAttribute("href")!, location.href).href,
            };
          }),
        );
      },
    },
  ],
});
