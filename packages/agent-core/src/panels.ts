export const PANEL_PROTOCOL = 1;
export const panelRecovery =
  "ToolGraft could not load this panel. Reload ToolGraft in chrome://extensions, then reopen it. Your saved adapters have not been removed.";
export function panelError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error ?? "");
  return !value ||
    /undefined|cannot read properties|is not a function|receiving end does not exist/i.test(
      value,
    )
    ? panelRecovery
    : value;
}
