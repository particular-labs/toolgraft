import { GUIDE_VERSION } from "@toolgraft/agent-core";
// Public collection identifiers, not credentials. Separate website and opt-in product data.
export const analyticsConfig = {
  endpoint: "https://umami.particularlabs.cloud/api/send",
  website: "206046fd-69ef-49ae-a6c4-ac7e848ce2ad",
  extension: "6fa17098-b680-4508-ac31-ae9d24bb4a4c",
  publicOrigin: "https://particular-labs.github.io",
  publicBase: "/toolgraft/",
};
export const analyticsEvents = [
  "page_view",
  "panel_opened",
  "panel_error",
  "setup_instructions_copied",
  "setup_instructions_copy_failed",
  "manual_config_copied",
  "manual_config_copy_failed",
  "mcp_download",
  "extension_download",
  "manual_setup_opened",
  "connection_approved",
  "connection_failed",
  "connection_disconnected",
  "adapter_review_opened",
  "adapter_installed",
  "adapter_install_failed",
  "adapter_declined",
  "adapter_removed",
  "catalog_refreshed",
  "catalog_refresh_failed",
  "adapter_updated",
  "adapter_rolled_back",
  "site_access_approved",
  "write_approved",
  "write_declined",
] as const;
export type AnalyticsEvent = (typeof analyticsEvents)[number];
export const analyticsPages = [
  "home",
  "setup",
  "privacy",
  "registry",
  "guide",
  "popup",
  "options",
  "connect",
  "onboarding",
  "review",
  "confirmation",
] as const;
export type AnalyticsPage = (typeof analyticsPages)[number];
export function privacyBlocked(signals: {
  doNotTrack?: unknown;
  globalPrivacyControl?: unknown;
}) {
  return (
    signals.doNotTrack === "1" ||
    signals.doNotTrack === "yes" ||
    signals.globalPrivacyControl === true
  );
}
export function analyticsPayload(
  surface: "website" | "extension",
  event: unknown,
  page: unknown,
) {
  if (
    !analyticsEvents.includes(event as AnalyticsEvent) ||
    !analyticsPages.includes(page as AnalyticsPage)
  )
    return null;
  return {
    type: "event",
    payload: {
      website: analyticsConfig[surface],
      hostname:
        surface === "website"
          ? "particular-labs.github.io"
          : "toolgraft-extension",
      url: `/${surface}/${page}`,
      ...(event !== "page_view" ? { name: event } : {}),
      data: { release: GUIDE_VERSION, surface },
    },
  };
}
const active = new Set<AbortController>();
export function stopAnalytics() {
  for (const c of active) c.abort();
  active.clear();
}
export async function sendAnalytics(body: ReturnType<typeof analyticsPayload>) {
  if (!body) return;
  const controller = new AbortController();
  active.add(controller);
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    await fetch(analyticsConfig.endpoint, {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    /* Analytics never blocks or retries product work. */
  } finally {
    clearTimeout(timer);
    active.delete(controller);
  }
}
