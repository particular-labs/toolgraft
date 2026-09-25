import {
  helpTopics,
  instructionsMarkdown,
  GUIDE_VERSION,
} from "@toolgraft/agent-core";
import type { AnalyticsEvent } from "@toolgraft/analytics";
import { renderManualSetup } from "./managed-ui";
import { renderAgentSetup } from "./ui";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function link(text: string, href: string) {
  const node = el("a", text);
  node.href = href;
  return node;
}

export function renderHelp(
  target: HTMLElement,
  onEvent: (event: AnalyticsEvent) => void = () => {},
) {
  target.classList.add("help-shell");
  const sidebar = el("aside", "", "help-sidebar");
  const toggle = el("button", "Browse documentation", "help-menu-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "help-topics");
  const nav = el("nav");
  nav.id = "help-topics";
  nav.setAttribute("aria-label", "Documentation topics");
  nav.append(el("h2", "Documentation"));
  for (const topic of helpTopics) nav.append(link(topic.title, `#${topic.id}`));
  sidebar.append(toggle, nav);
  toggle.onclick = () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open));
    sidebar.classList.toggle("is-open", open);
  };
  const article = el("article", "", "help-article");
  const skip = link("Skip to article", "#help-title");
  skip.className = "help-skip";
  skip.onclick = (e) => {
    e.preventDefault();
    article.querySelector<HTMLElement>("h1")?.focus();
  };
  target.append(skip, sidebar, article);
  const downloadUrl = URL.createObjectURL(
    new Blob([instructionsMarkdown()], { type: "text/markdown" }),
  );
  window.addEventListener("pagehide", () => URL.revokeObjectURL(downloadUrl), {
    once: true,
  });
  function show(focus = false) {
    const topic =
      helpTopics.find((t) => `#${t.id}` === location.hash) ?? helpTopics[0]!;
    article.replaceChildren();
    const title = el("h1", topic.title);
    title.id = "help-title";
    title.tabIndex = -1;
    article.append(title, el("p", topic.intro, "help-intro"));
    for (const section of topic.sections) {
      const block = el("section");
      block.append(el("h2", section.title));
      if (section.text) block.append(el("p", section.text));
      if (section.steps) {
        const steps = el("ol");
        for (const step of section.steps) steps.append(el("li", step));
        block.append(steps);
      }
      for (const prompt of section.prompts ?? [])
        block.append(el("blockquote", prompt));
      article.append(block);
    }
    const extension = location.protocol === "chrome-extension:";
    if (topic.id === "start")
      article.append(
        link(
          extension ? "Open Your agents" : "Open setup",
          extension ? "./connect.html" : "./get-started.html",
        ),
      );
    if (topic.id === "connect" || topic.id === "troubleshooting")
      article.append(link("Manual agent configuration", "#manual"));
    if (topic.id === "manual") {
      const manual = el("section");
      renderManualSetup(manual, onEvent);
      article.append(manual);
    }
    if (topic.id === "developers") {
      const download = link(
        "Download instructions for your agent",
        downloadUrl,
      );
      download.download = "toolgraft-instructions.md";
      article.append(
        download,
        el(
          "p",
          `Instructions ${GUIDE_VERSION}. Shared with the MCP and extension.`,
          "help-meta",
        ),
      );
      const native = el("details");
      native.append(el("summary", "Native WebMCP developer connection"));
      const content = el("section");
      renderAgentSetup(content);
      native.append(content);
      article.append(native);
    }
    const index = helpTopics.indexOf(topic);
    const next = helpTopics[index + 1];
    if (next) {
      const footer = el("nav", "", "help-next");
      footer.setAttribute("aria-label", "Next topic");
      footer.append(link(`Next: ${next.title}`, `#${next.id}`));
      article.append(footer);
    }
    for (const item of nav.querySelectorAll("a")) {
      if (item.hash === `#${topic.id}`)
        item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    document.title = `${topic.title} — ToolGraft docs`;
    sidebar.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    if (focus) {
      title.focus();
      title.scrollIntoView({ block: "start" });
    }
  }
  show();
  window.addEventListener("hashchange", () => show(true));
}
