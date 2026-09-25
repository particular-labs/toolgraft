export type HelpTopic = {
  id: string;
  title: string;
  intro: string;
  sections: {
    title: string;
    text?: string;
    steps?: string[];
    prompts?: string[];
  }[];
};

/** Human documentation shared by the website and the extension's offline help. */
export const helpTopics: HelpTopic[] = [
  {
    id: "start",
    title: "Get started",
    intro:
      "Give your existing agent tools for the websites you use. ToolGraft is free and open source, with no AI subscription or model key of its own.",
    sections: [
      {
        title: "What you need",
        text: "Chrome 138 or newer, Node 24 or newer, and an agent that can run a local MCP server on the same computer. This preview has been tested with local Codex and Claude sessions. Cloud-only chats at chatgpt.com or claude.ai cannot connect directly.",
      },
      {
        title: "Install the local preview",
        steps: [
          "Download and unzip the extension package from Get started.",
          "Open chrome://extensions, enable Developer mode, choose Load unpacked and select the unzipped extension folder.",
          "Open ToolGraft’s Details and enable Allow User Scripts. Pin ToolGraft in Chrome’s extensions menu for easy access.",
        ],
      },
      {
        title: "Connect your agent",
        text: "On Get started, copy the setup instructions into your agent. It can download the single MCP package and configure it with your permission. You do not need a repository checkout, separate helper app or mandatory skill. Open the connection link it gives you and approve the agent in ToolGraft.",
      },
      {
        title: "Try a real task",
        prompts: [
          "Use ToolGraft to search ClasificadosOnline for used guitars under $200. Check the condition and give me the listing links.",
          "Use ToolGraft with lobste.rs to show me recent Rust stories. If it needs an adapter, help me create a read-only one.",
        ],
      },
    ],
  },
  {
    id: "connect",
    title: "Connect your agent",
    intro:
      "Connect once, then ask for website tasks in ordinary language. No pairing code is needed in the normal flow.",
    sections: [
      {
        title: "Open the private link",
        steps: [
          "Ask your agent to connect ToolGraft.",
          "Open its five-minute connection link in the browser with the extension installed.",
          "Approve Connect this agent. If the approval screen does not appear, click ToolGraft in Chrome’s extensions menu.",
        ],
      },
      {
        title: "Make links open approval directly",
        text: "In extension Settings, enable one-tab connections and approve Chrome’s optional permission for local pages at 127.0.0.1. Future ToolGraft links open the approval screen in that tab. Each agent still needs your approval.",
      },
      {
        title: "Your connected agents",
        text: "Your agents lists approved clients and whether they are currently connected. Disconnect revokes that agent’s connection. Closing its chat may leave it waiting without removing approval. A different project folder or client name can require another approval; the same name does not prove the same identity.",
      },
      {
        title: "Already set up?",
        prompts: [
          "Connect to ToolGraft using the setup already installed here. Check the connection and tell me what website tools are available.",
        ],
      },
    ],
  },
  {
    id: "use",
    title: "Use website tools",
    intro:
      "Say which website to use, what you want, and any limits. Your agent finds available tools and opens or reuses the website.",
    sections: [
      {
        title: "Start with an outcome",
        prompts: [
          "Find three Toyota Corollas under $15,000 on ClasificadosOnline. Include year, town, mileage and links; say when a field is missing.",
          "Show me five recent developer tools on Lobsters, with their discussion links. Explain what you know from the listings and what you have not checked.",
        ],
      },
      {
        title: "Keep the browser running",
        text: "You do not have to open every page yourself. ToolGraft opens task pages on demand and can clean up eligible background tabs it created. Tabs you open, activate or navigate are protected. Sign in normally when a site requires it; ToolGraft never asks you to send your password to your agent.",
      },
      {
        title: "Read the result, not just the success badge",
        text: "Missing fields should remain unknown. Tool results can contain inaccurate or untrusted website content. Ask for source links and verification of important filters. A site can change or show a bot check; an adapter is not a promise of permanent access.",
      },
      {
        title: "When the conversation stops",
        prompts: [
          "Resume my ToolGraft task. Check any existing approval or draft before starting another one.",
        ],
      },
    ],
  },
  {
    id: "create",
    title: "Create and repair adapters",
    intro:
      "Your agent writes the adapter using your existing model setup. ToolGraft supplies inspection, validation and installation tools.",
    sections: [
      {
        title: "Ask for the behavior you need",
        prompts: [
          "Create a read-only ToolGraft adapter for this website so I can search by keyword and read item details. Ask me about anything unclear.",
          "Improve my ClasificadosOnline adapter to read listing descriptions. Preserve search, test the changes, and leave unknown fields empty.",
        ],
      },
      {
        title: "Ask, try, keep",
        steps: [
          "Your agent inspects representative pages after you approve site access.",
          "It creates or edits a draft, then validates the package. Validation alone does not test the website.",
          "For read-only adapters, approve Try update in the review tab. The candidate runs in a temporary tab without replacing an installed version.",
          "Ask the agent to check the returned examples. If they are wrong, it repairs the draft and requests another trial.",
          "Choose Keep update when satisfied. The agent verifies the installed tools and continues your original task.",
        ],
      },
      {
        title: "What approval means",
        text: "Generated scripts are trusted code with access to the approved site. Read-only labels and passing tests are not a sandbox or a security guarantee. Write adapters use installation review and separate approval for each write.",
      },
      {
        title: "Editing and export",
        text: "Supported installed managed-script adapters can be edited without the original chat or repository. Untouched tools are preserved, and edits propose a new version. Ask your agent to export a local package for backup or review. Export does not publish; community contribution is not implemented yet.",
      },
    ],
  },
  {
    id: "adapters",
    title: "Manage adapters",
    intro:
      "Open full view from the popup to see your library. Installed versions stay pinned until you approve a change.",
    sections: [
      {
        title: "Find what is installed",
        text: "Installed shows cards with name, site, version and status. Search by name, site or tool; filter for adapters that need attention or have an update. Expand details for tools, permissions and version history.",
      },
      {
        title: "Updates and rollback",
        text: "Catalog checks do not install updates automatically. Review each requested version and its changes. Version history can restore retained packages when eligible. Rollback restores adapter code, not actions already taken on a website. Revoked versions cannot be activated.",
      },
      {
        title: "Bring your own package",
        text: "Ask your agent to install a local adapter package or use Import an adapter package in the library. Both require extension review and site permission. The current catalog is local/experimental; a package hash alone does not establish publisher trust.",
      },
      {
        title: "Remove an adapter",
        text: "Remove it from its library card to stop its tools and delete saved package history. Your website account and website data are not deleted. Small version identity records remain to prevent replacing an approved version with different code.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy and permissions",
    intro:
      "You control agent connections, site access and installed versions. Your chosen agent remains responsible for its model and data handling.",
    sections: [
      {
        title: "What leaves your browser",
        text: "Inspected page content and tool results reach your chosen agent and may reach its model provider. Website requests can include search terms and use your signed-in session. Read-only does not mean no data is sent.",
      },
      {
        title: "What you approve",
        steps: [
          "A local agent’s connection to ToolGraft.",
          "Access to the specific sites you want to use.",
          "Generated adapter trials, installation and manual updates.",
          "Individual write operations declared by an adapter.",
        ],
      },
      {
        title: "Usage analytics",
        text: "Website analytics are limited to the configured public site and offer an opt-out. Local previews do not send them. Extension analytics are off until you enable them in Settings. Events exclude site URLs, searches, adapter names, code, inputs and results. The analytics server still receives network information such as your IP address.",
      },
      {
        title: "Current boundaries",
        text: "ToolGraft has no account service, hosted AI or public relay. Gmail and Microsoft 365 adapters have not been verified. Approved script adapters are trusted code; validation and confirmation prompts do not sandbox malicious behavior.",
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    intro:
      "Start with the visible state. Keep your existing setup and saved adapters while checking what is missing.",
    sections: [
      {
        title: "My agent cannot see ToolGraft",
        text: "After adding the MCP configuration, start a new agent session. Confirm Node 24+ is available to that client and that the package path is correct. Keep existing MCP servers when updating configuration. A browser extension alone does not add MCP tools to an agent.",
      },
      {
        title: "The link opens, but nothing connects",
        text: "Use the browser profile with ToolGraft installed. Open the extension from Chrome’s menu if same-tab approval is not enabled. Links expire after five minutes; ask for a fresh one. The browser and MCP must run on the same computer.",
      },
      {
        title: "Use a pairing code as a fallback",
        text: "In Your agents, open Trouble connecting? and then Use a pairing code instead. Ask your agent for a fresh code and enter the accompanying port and agent ID under Connection settings if provided. This is an alternative connection method, not an API key.",
      },
      {
        title: "Connected, but the website tool does not work",
        text: "Enable Allow User Scripts in Chrome’s extension details, check the adapter’s site permission, and sign in normally if needed. Ask your agent to check the page and installed version. Do not repeatedly retry a write whose outcome is unknown.",
      },
      {
        title: "A review expired or the browser restarted",
        text: "Ask your agent to resume. It can recover a saved draft, re-inspect and request fresh approval. Do not reinstall everything or replay an old approval. If a panel fails to load after a local extension update, reload ToolGraft in chrome://extensions and reopen the panel.",
      },
    ],
  },
  {
    id: "manual",
    title: "Manual agent setup",
    intro:
      "Use this only if your agent cannot configure its MCP connection for you. Download the package, select your client and merge the generated settings without replacing other servers.",
    sections: [],
  },
  {
    id: "developers",
    title: "Developer reference",
    intro:
      "Normal setup uses the single ToolGraft MCP package. The native WebMCP connection below is an advanced path for the older native-only examples.",
    sections: [
      {
        title: "Agent-readable instructions",
        text: "The MCP exposes versioned instructions through toolgraft_get_instructions. Your agent can discover, inspect, scaffold, validate, try, install and repair adapters. A separate skill is optional. Shared instructions and runtime contracts live in the repository’s packages.",
      },
      {
        title: "Contributing",
        text: "The intended repository is particular-labs/toolgraft, licensed MIT. Public publication is still on hold. Adapter export is local; a separate community adapter repository and automated contribution workflow are proposed, not available.",
      },
    ],
  },
];
