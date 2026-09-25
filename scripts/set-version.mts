// Usage: pnpm release:version 0.7.0
// Moves every product version site in lockstep, then regenerates agent docs.
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next ?? ""))
  throw new Error("Usage: pnpm release:version <major.minor.patch>");
const current = JSON.parse(await readFile("package.json", "utf8")).version;
if (next === current) throw new Error(`Already at ${current}`);

// Each file holds the version exactly once; anything else means the list drifted.
const files = [
  "package.json",
  "packages/mcp/package.json",
  "packages/agent-core/package.json",
  "apps/extension/package.json",
  "packages/adapter-schema/src/index.ts",
  "packages/agent-core/src/index.ts",
  "apps/web/get-started.html",
  ".mcp.json",
  ".cursor/mcp.json",
  ".codex/config.toml",
];
const texts = await Promise.all(files.map((f) => readFile(f, "utf8")));
texts.forEach((text, i) => {
  const count = text.split(current).length - 1;
  if (count !== 1)
    throw new Error(`${files[i]}: expected one "${current}", found ${count}`);
});
// Validate everything before writing anything.
await Promise.all(
  files.map((f, i) => writeFile(f, texts[i].replace(current, next))),
);
execFileSync("pnpm", ["docs:generate"], { stdio: "inherit" });
console.log(`${current} -> ${next}. Commit, then tag v${next} and push it.`);
