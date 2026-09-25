import { it, expect, vi, afterEach } from "vitest";
import {
  analyticsPayload,
  privacyBlocked,
  sendAnalytics,
  analyticsConfig,
} from "@toolgraft/analytics";
afterEach(() => vi.unstubAllGlobals());
it("only builds allowlisted event payloads with fixed routes and no browsing or user data", () => {
  expect(
    analyticsPayload("extension", "search=my-secret", "options"),
  ).toBeNull();
  expect(
    analyticsPayload("extension", "panel_opened", "https://secret.example/"),
  ).toBeNull();
  const body = analyticsPayload("extension", "panel_opened", "options")!;
  expect(Object.keys(body.payload).sort()).toEqual([
    "data",
    "hostname",
    "name",
    "url",
    "website",
  ]);
  expect(body.payload.url).toBe("/extension/options");
  expect(Object.keys(body.payload.data)).toEqual(["release", "surface"]);
  for (const signals of [
    { doNotTrack: "1" },
    { globalPrivacyControl: true },
    { doNotTrack: "yes" },
  ])
    expect(privacyBlocked(signals)).toBe(true);
  expect(privacyBlocked({ doNotTrack: "0" })).toBe(false);
});
it("omits credentials and referrers and tolerates blocked collection without retries", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("blocked"));
  vi.stubGlobal("fetch", fetch);
  await expect(
    sendAnalytics(analyticsPayload("website", "page_view", "home")),
  ).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe(analyticsConfig.endpoint);
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    cache: "no-store",
  });
  await sendAnalytics(null);
  expect(fetch).toHaveBeenCalledTimes(1);
});
