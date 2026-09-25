import { GUIDE_VERSION } from "@toolgraft/agent-core";
import {
  cliInstalls,
  managedJson,
} from "@toolgraft/agent-setup/managed-config";
const download = document.querySelector<HTMLAnchorElement>(
  "#extension-download",
)!;
download.href = `./toolgraft-${GUIDE_VERSION}-chrome.zip`;
const list = document.querySelector<HTMLElement>("#mcp-installs")!;
const rows = [
  ...cliInstalls(),
  { client: "Cursor and others", command: managedJson().trim() },
];
list.replaceChildren(
  ...rows.map(({ client, command }) => {
    const row = document.createElement("div");
    row.className = "install-row";
    const label = document.createElement("span");
    label.textContent = client;
    const box = document.createElement("div");
    box.className = "command";
    const code = document.createElement("code");
    code.textContent = command;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", `Copy ${client} setup`);
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(command);
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Select";
      }
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    };
    box.append(code, copy);
    row.append(label, box);
    return row;
  }),
);
