/** A short-lived local invitation. Never log its fragment or treat it as an API key. */
export function parseConnectionInvitation(value: string) {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    const fields = new URLSearchParams(url.hash.slice(1));
    const agentId = fields.get("agent");
    const label = fields.get("label");
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.username ||
      url.password ||
      url.pathname !== "/connect" ||
      url.search ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      (!/^#ticket=[a-f0-9]{64}$/.test(url.hash) &&
        !(
          /^#ticket=[a-f0-9]{64}&agent=[a-f0-9]{32}&label=[^&]*$/.test(
            url.hash,
          ) &&
          label &&
          label.length <= 80 &&
          !/[\x00-\x1f\x7f]/.test(label)
        ))
    )
      return null;
    return {
      port,
      ticket: fields.get("ticket")!,
      ...(agentId ? { agentId, label: label! } : {}),
    };
  } catch {
    return null;
  }
}
export const connectionSteps = [
  "Ask your agent to connect ToolGraft. It gives you a private connection link that expires in five minutes.",
  "Open that link in the browser with ToolGraft installed. With one-tab connections enabled, approve Connect this agent on the opened tab. Otherwise click ToolGraft in the extensions menu first.",
  "Return to your agent and ask for a website task. You approve site access and adapter installation in the browser.",
];
