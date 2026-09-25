import {
  changes,
  type ActivationPlan,
  type Manifest,
} from "@toolgraft/adapter-schema";
export function reviewTitle(plan: ActivationPlan | undefined, m: Manifest) {
  return plan?.action === "rollback"
    ? `Roll back ${m.title} to ${m.version}?`
    : plan?.action === "update"
      ? `Update ${m.title} to ${m.version}?`
      : `Install ${m.title}?`;
}
export function approvalLabel(plan: ActivationPlan | undefined, m: Manifest) {
  return plan?.action === "rollback"
    ? `Approve rollback to ${m.version}`
    : "Approve site access and install";
}
export function appendVersionChange(
  target: HTMLElement,
  plan: ActivationPlan | undefined,
  manifest: Manifest,
) {
  if (!plan?.previous) return;
  const section = document.createElement("section");
  section.className = "version-change";
  target.append(section);
  const heading = document.createElement("h3");
  heading.textContent =
    plan.action === "rollback" ? "Rollback changes" : "Update changes";
  const direction = document.createElement("p");
  direction.textContent = `${plan.fromVersion} → ${manifest.version}`;
  section.append(heading, direction);
  if (plan.action === "rollback") {
    const warning = document.createElement("p");
    warning.className = "warning";
    warning.textContent =
      "This restores older adapter code. It may restore old bugs; it does not undo changes already made on the website.";
    section.append(warning);
  }
  const diff = document.createElement("pre");
  diff.textContent = JSON.stringify(changes(plan.previous, manifest), null, 2);
  section.append(diff);
}
