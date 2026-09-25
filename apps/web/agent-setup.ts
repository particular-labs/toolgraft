import { trackWebsite } from "./analytics";
import { renderManagedSetup } from "@toolgraft/agent-setup/managed-ui";
import "@toolgraft/agent-setup/style.css";
const target = document.querySelector<HTMLElement>("#agent-setup")!;
renderManagedSetup(target, trackWebsite);
