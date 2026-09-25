import {
  coreGuide,
  workflowSteps,
  instructionsMarkdown,
  GUIDE_VERSION,
} from "@toolgraft/agent-core";
const main = document.querySelector("#agent-guide")!;
function el(tag: string, text: string) {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
main.append(el("h1", coreGuide.title), el("p", coreGuide.intro));
for (const [title, lines] of [
  ["Connect once", coreGuide.setup],
  ["Ask, try, and keep", workflowSteps],
  ["Updates and rollback", coreGuide.updates],
  ["Current limits", coreGuide.limitations],
] as const) {
  main.append(el("h2", title));
  const list = document.createElement(title === "Current limits" ? "ul" : "ol");
  for (const line of lines) list.append(el("li", line));
  main.append(list);
}
const download = el(
  "a",
  "Download instructions for your agent",
) as HTMLAnchorElement;
download.href = URL.createObjectURL(
  new Blob([instructionsMarkdown()], { type: "text/markdown" }),
);
download.download = "toolgraft-instructions.md";
main.append(
  download,
  el(
    "p",
    `Guide ${GUIDE_VERSION}. The MCP, extension and this page use the same instructions.`,
  ),
);
