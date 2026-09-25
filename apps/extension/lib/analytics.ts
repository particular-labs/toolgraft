import {
  analyticsConfig,
  analyticsPayload,
  sendAnalytics,
  stopAnalytics,
} from "@toolgraft/analytics";
export const analyticsOrigin = new URL(analyticsConfig.endpoint).origin + "/*";
let generation = 0;
export async function analyticsStatus() {
  const data = await chrome.storage.local.get("analyticsConsent");
  return {
    enabled: data.analyticsConsent === true,
    endpoint: new URL(analyticsConfig.endpoint).origin,
  };
}
export async function setAnalytics(enabled: boolean) {
  generation++;
  stopAnalytics();
  if (
    enabled &&
    !(await chrome.permissions.contains({ origins: [analyticsOrigin] }))
  )
    throw new Error("Analytics site permission was not granted.");
  await chrome.storage.local.set({ analyticsConsent: enabled });
  return analyticsStatus();
}
export async function trackExtension(
  event: unknown,
  page: unknown,
  blocked: unknown,
) {
  const before = generation;
  if (blocked !== false || !(await analyticsStatus()).enabled) return;
  if (
    !(await chrome.permissions.contains({ origins: [analyticsOrigin] })) ||
    before !== generation
  )
    return;
  await sendAnalytics(analyticsPayload("extension", event, page));
}
