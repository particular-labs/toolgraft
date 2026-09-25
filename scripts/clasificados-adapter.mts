import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileDraft, type Draft } from "../packages/mcp/src/builder.ts";
export async function clasificadosDraft(): Promise<Draft> {
  const draft = JSON.parse(
    await readFile("examples/clasificados-online/adapter.json", "utf8"),
  );
  draft.tools[0].execute = await readFile(
    "examples/clasificados-online/search.js",
    "utf8",
  );
  return draft;
}
export async function buildClasificados() {
  const draft = await clasificadosDraft();
  const built = await compileDraft(
    draft,
    await readFile("packages/mcp/dist/runtime.js", "utf8"),
    await readFile("LICENSE", "utf8"),
  );
  const dir = "examples/clasificados-online/dist";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/adapter.tgz`, built.bytes);
  await writeFile(`${dir}/draft.json`, JSON.stringify(draft, null, 2) + "\n");
  await writeFile(
    `${dir}/receipt.json`,
    JSON.stringify(
      {
        id: draft.id,
        version: draft.version,
        digest: built.digest,
        manifest: built.package.manifest,
        review: "experimental",
        liveBehavior:
          "Run the live case in tests/browser/clasificados.spec.ts; compilation alone does not prove execution.",
      },
      null,
      2,
    ) + "\n",
  );
  return built;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const built = await buildClasificados();
  console.log(`Built local ClasificadosOnline adapter: ${built.digest}`);
}
