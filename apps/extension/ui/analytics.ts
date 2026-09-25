import {
  privacyBlocked,
  type AnalyticsEvent,
  type AnalyticsPage,
} from "@toolgraft/analytics";
export function trackPanel(event: AnalyticsEvent, page: AnalyticsPage) {
  void chrome.runtime
    .sendMessage({
      type: "analytics-track",
      event,
      page,
      privacyBlocked:
        privacyBlocked(navigator) || chrome.extension.inIncognitoContext,
    })
    .catch(() => {});
}
