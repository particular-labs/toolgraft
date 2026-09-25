import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  managedCodex as codexConfig,
  managedJson as jsonConfig,
} from "@toolgraft/agent-setup/managed-config";
for (const [path, contents] of [
  [".codex/config.toml", codexConfig()],
  [".mcp.json", jsonConfig()],
  [".cursor/mcp.json", jsonConfig()],
]) {
  let existing: string | undefined;
  try {
    existing = await readFile(path!, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (existing !== undefined && existing !== contents)
    throw new Error(
      `Keep your existing ${path}; merge the ToolGraft entry manually. Nothing in that file was replaced.`,
    );
  await mkdir(dirname(path!), { recursive: true });
  await writeFile(path!, contents!);
  console.log(`Ready: ${path}`);
}
