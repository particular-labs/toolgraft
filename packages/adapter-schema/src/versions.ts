import type { Manifest } from "./index.ts";

/** Stable major.minor.patch only, as required by manifestSchema. */
export function compareVersions(a: string, b: string): number {
  const valid = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (!valid.test(a) || !valid.test(b))
    throw new Error("Invalid adapter version");
  const left = a.split(".").map(BigInt),
    right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i]! < right[i]!) return -1;
    if (left[i]! > right[i]!) return 1;
  }
  return 0;
}
export type VersionAction = "install" | "update" | "rollback" | "reinstall";
export function versionAction(
  current: string | undefined,
  target: string,
): VersionAction {
  if (!current) return "install";
  const order = compareVersions(target, current);
  return order > 0 ? "update" : order < 0 ? "rollback" : "reinstall";
}
export type ActivationPlan = {
  action: VersionAction;
  fromVersion: string | null;
  fromHash: string | null;
  previous: Manifest | null;
};
