import { renderHelp } from "@toolgraft/agent-setup/help-ui";
import "@toolgraft/agent-setup/help.css";
import "@toolgraft/agent-setup/style.css";
import { trackWebsite } from "./analytics";
renderHelp(
  document.querySelector<HTMLElement>("#documentation")!,
  trackWebsite,
);
