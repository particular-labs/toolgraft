import { parseConnectionInvitation } from "@toolgraft/agent-core";

/** Optional loopback grant only opens extension-owned review; never pairs a page. */
export function setupConnectionLinks() {
  const opening = new Set<number>();
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    const url = change.url ?? tab.url;
    if (!url || !parseConnectionInvitation(url) || opening.has(tabId)) return;
    opening.add(tabId);
    void (async () => {
      if (
        !(await chrome.storage.local.get("connectionLinks")).connectionLinks ||
        !(await chrome.permissions.contains({
          origins: ["http://127.0.0.1/*"],
        }))
      )
        return;
      const current = await chrome.tabs.get(tabId);
      if (current.url !== url) return;
      await chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL(`/connect.html#${encodeURIComponent(url)}`),
      });
    })()
      .catch(() => {})
      .finally(() => opening.delete(tabId));
  });
}
