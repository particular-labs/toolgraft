import { build } from "esbuild";
import {
  cp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { instructionsMarkdown } from "@toolgraft/agent-core";
import { execFileSync } from "node:child_process";
import { rename } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts", "src/bridge-host.ts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: [
    "@modelcontextprotocol/sdk/*",
    "esbuild",
    "typescript",
    "ws",
    "zod",
  ],
  banner: { js: "#!/usr/bin/env node" },
});
await build({
  entryPoints: ["../adapter-sdk/src/managed.ts"],
  outfile: "dist/runtime.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "ToolGraftRuntime",
  target: "chrome138",
  minify: true,
});
await copyFile("../../LICENSE", "dist/LICENSE");
await mkdir("dist/licenses", { recursive: true });
for (const file of ["fflate.txt", "webmcp-today-schema.txt"])
  await copyFile("../../docs/licenses/" + file, "dist/licenses/" + file);
await writeFile(
  "dist/THIRD_PARTY_NOTICES.md",
  "ToolGraft is MIT, Particular Labs. Bundled fflate 0.8.3 and @webmcp-today/schema 0.3.0 retain their MIT licenses in licenses/. Runtime dependencies retain the licenses distributed by npm.\n",
);
await writeFile("dist/instructions.md", instructionsMarkdown());
await mkdir("dist/connect", { recursive: true });
for (const name of ["connection.html", "connection.css"])
  await copyFile(name, `dist/connect/${name}`);
for (const name of ["brand.css", "fonts.css", "icon.svg", "fonts"])
  await cp(`../brand/assets/${name}`, `dist/connect/${name}`, {
    recursive: true,
  });
const source = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(
  "dist/package.json",
  JSON.stringify(
    {
      name: source.name,
      version: source.version,
      description: source.description,
      type: "module",
      license: "MIT",
      // npm trusted publishing requires this to match the publishing repository.
      repository: source.repository,
      homepage: source.homepage,
      bin: { "toolgraft-mcp": "index.js" },
      engines: source.engines,
      dependencies: Object.fromEntries(
        Object.entries(source.dependencies).filter(
          ([, v]) => !String(v).startsWith("workspace:"),
        ),
      ),
    },
    null,
    2,
  ) + "\n",
);
const [packed] = JSON.parse(
  execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", "../../brand/assets"],
    { cwd: "dist", encoding: "utf8" },
  ),
);
await rename(
  `../brand/assets/${packed.filename}`,
  `../brand/assets/toolgraft-mcp-${source.version}.tgz`,
);
// Shared assets are copied into both products; ship only the current MCP build.
for (const file of await readdir("../brand/assets"))
  if (
    /^toolgraft-mcp-\d+\.\d+\.\d+\.tgz$/.test(file) &&
    file !== `toolgraft-mcp-${source.version}.tgz`
  )
    await rm(`../brand/assets/${file}`);
