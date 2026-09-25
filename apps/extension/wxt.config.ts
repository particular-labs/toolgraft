import { defineConfig } from "wxt";

export default defineConfig({
  publicDir: "../../packages/brand/assets",
  manifestVersion: 3,
  manifest: {
    name: "ToolGraft",
    description:
      "Reviewed WebMCP adapters. Free and open source by Particular Labs.",
    minimum_chrome_version: "138",
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    action: { default_icon: { 16: "icon-16.png", 32: "icon-32.png" } },
    permissions: ["storage", "alarms", "userScripts", "activeTab", "scripting"],
    optional_host_permissions: [
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ],
  },
});
