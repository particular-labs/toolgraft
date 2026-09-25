import { cp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { buildClasificados } from "./clasificados-adapter.mts";
import {
  registrySchema,
  revocationsSchema,
  canonical,
  sha256,
} from "@toolgraft/adapter-schema";
const dest = resolve("dist/release");
// Local notes can remain in the checkout after being removed from Git. Package
// only tracked documentation/example source, never an entire working directory.
async function copyTracked(directory: string) {
  const files = execFileSync("git", ["ls-files", "-z", "--", directory], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    const target = resolve(dest, file);
    await mkdir(dirname(target), { recursive: true });
    await cp(file, target);
  }
}
const mcpArchive = `toolgraft-mcp-${JSON.parse(await readFile("packages/mcp/package.json", "utf8")).version}.tgz`;
const index = registrySchema.parse(
  JSON.parse(await readFile("registry/index.v1.json", "utf8")),
);
revocationsSchema.parse(
  JSON.parse(await readFile("registry/revocations.v1.json", "utf8")),
);
const manifest = JSON.parse(
  await readFile("apps/extension/.output/chrome-mv3/manifest.json", "utf8"),
);
if (
  manifest.manifest_version !== 3 ||
  manifest.host_permissions?.length ||
  manifest.content_scripts?.length
)
  throw new Error(
    "Unexpected production permissions or global content scripts",
  );
if (manifest.options_ui?.open_in_tab !== true)
  throw new Error("Extension options must open in a full browser tab.");
if (
  manifest.permissions.sort().join(",") !==
  ["activeTab", "alarms", "storage", "userScripts", "scripting"]
    .sort()
    .join(",")
)
  throw new Error("Unexpected extension permissions");
await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp("apps/extension/.output/chrome-mv3", resolve(dest, "extension"), {
  recursive: true,
});
await cp("apps/web/dist", resolve(dest, "site"), { recursive: true });
await cp("registry", resolve(dest, "site/registry"), { recursive: true });
await cp("apps/playground/dist", resolve(dest, "playground"), {
  recursive: true,
});
await cp(`packages/brand/assets/${mcpArchive}`, resolve(dest, mcpArchive));
await copyTracked("docs");
const classifieds = await buildClasificados();
await writeFile(
  resolve(dest, "local.clasificados-online-0.1.0.tgz"),
  classifieds.bytes,
);
await copyTracked("examples/clasificados-online");
await cp("third-party", resolve(dest, "extension/third-party"), {
  recursive: true,
});
await cp("LICENSE", resolve(dest, "extension/LICENSE"));
await cp(
  "THIRD_PARTY_NOTICES.md",
  resolve(dest, "extension/THIRD_PARTY_NOTICES.md"),
);
await cp("docs/licenses", resolve(dest, "extension/licenses"), {
  recursive: true,
});
for (const entry of index.entries)
  await cp(
    resolve("registry", entry.artifact),
    resolve(dest, `${entry.id}-${entry.version}.tgz`),
  );
execFileSync(
  "zip",
  ["-qr", resolve(dest, `toolgraft-${manifest.version}-chrome.zip`), "."],
  {
    cwd: resolve(dest, "extension"),
  },
);
await cp(
  resolve(dest, `toolgraft-${manifest.version}-chrome.zip`),
  resolve(dest, `site/toolgraft-${manifest.version}-chrome.zip`),
);
const files = (await readdir(dest)).filter(
  (f) => f.endsWith(".zip") || f.endsWith(".tgz"),
);
const hashes = Object.fromEntries(
  await Promise.all(
    files.map(async (f) => [
      f,
      await sha256(new Uint8Array(await readFile(resolve(dest, f)))),
    ]),
  ),
);
await writeFile(resolve(dest, "SHA256SUMS.json"), canonical(hashes) + "\n");
console.log(
  `Release candidate assembled in ${dest}. Public review and publication are separate gates.`,
);
