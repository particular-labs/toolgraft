import {
  analyticsConfig,
  analyticsPayload,
  privacyBlocked,
  sendAnalytics,
  stopAnalytics,
  type AnalyticsEvent,
  type AnalyticsPage,
} from "@toolgraft/analytics";
const key = "toolgraft.websiteAnalyticsDisabled";
const routes: Record<string, AnalyticsPage> = {
  "": "home",
  "index.html": "home",
  "get-started.html": "setup",
  "privacy.html": "privacy",
  "registry.html": "registry",
  "agent-guide.html": "guide",
  "docs.html": "guide",
};
function allowed() {
  try {
    return (
      location.origin === analyticsConfig.publicOrigin &&
      location.pathname.startsWith(analyticsConfig.publicBase) &&
      !privacyBlocked(navigator) &&
      localStorage.getItem(key) !== "true"
    );
  } catch {
    return false;
  }
}
function pageName() {
  return routes[location.pathname.slice(analyticsConfig.publicBase.length)];
}
export function trackWebsite(event: AnalyticsEvent) {
  const page = pageName();
  if (allowed() && page)
    void sendAnalytics(analyticsPayload("website", event, page));
}
trackWebsite("page_view");
document.addEventListener("click", (e) => {
  const link = (e.target as Element)?.closest("a");
  if (!link) return;
  if (/toolgraft-[0-9.]+-chrome\.zip$/.test(link.getAttribute("href") ?? ""))
    trackWebsite("extension_download");
});
const privacy = document.querySelector<HTMLElement>("#analytics-preference");
if (privacy) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const update = () => {
    if (location.origin !== analyticsConfig.publicOrigin || !pageName()) {
      toggle.disabled = true;
      toggle.textContent = "Analytics disabled on this preview";
      status.textContent =
        "This preview sends no analytics. Set your website preference on the public site.";
      return;
    }
    try {
      const optedOut = localStorage.getItem(key) === "true";
      const blocked = privacyBlocked(navigator);
      toggle.textContent = optedOut
        ? "Allow website analytics"
        : blocked
          ? "Opt out of website analytics"
          : "Turn off website analytics";
      status.textContent = blocked
        ? "Your browser’s privacy signal blocks analytics. " +
          (optedOut
            ? "Your opt-out is also saved."
            : "You can also save an opt-out below.")
        : optedOut
          ? "Website analytics are off. Your opt-out is saved in this browser."
          : "Minimal website analytics are enabled.";
    } catch {
      toggle.disabled = true;
      toggle.textContent = "Analytics disabled: preferences unavailable";
      status.textContent =
        "Analytics are off because your preference cannot be read.";
    }
  };
  toggle.onclick = () => {
    try {
      const disabled = localStorage.getItem(key) !== "true";
      localStorage.setItem(key, String(disabled));
      if (disabled) stopAnalytics();
      update();
    } catch {
      status.textContent =
        "Could not save your preference. Analytics remain off if storage is unavailable.";
    }
  };
  window.addEventListener("storage", () => {
    stopAnalytics();
    update();
  });
  privacy.append(toggle, status);
  update();
}
