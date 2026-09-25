import { execFileSync } from "node:child_process";
const base = process.env.IMMUTABLE_BASE;
if (!base || /^0+$/.test(base)) {
  console.log("No comparison base; initial publication only.");
  process.exit(0);
}
const changed = execFileSync(
  "git",
  ["diff", "--name-status", base, "HEAD", "--", "registry/packages"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
for (const line of changed)
  if (!line.startsWith("A\t"))
    throw new Error(`Published package changed: ${line}`);
console.log("Existing registry artifacts are unchanged.");
