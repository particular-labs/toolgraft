import { it, expect } from "vitest";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { compileDraft } from "../../packages/mcp/src/builder";
import { recoverInstalledDraft } from "../../packages/mcp/src/edit";
import { sha256 } from "@toolgraft/adapter-schema";
import { clasificadosDraft } from "../../scripts/clasificados-adapter.mts";

const bundled = await build({
  entryPoints: ["packages/adapter-sdk/src/managed.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "ToolGraftRuntime",
  target: "chrome138",
  minify: true,
  write: false,
});
const runtime = bundled.outputFiles[0]!.text;
const license = await readFile("LICENSE", "utf8");
it("recovers the shipped Clasificados managed source without repository lookup or host execution", async () => {
  const source = await clasificadosDraft();
  const built = await compileDraft(source, runtime, license);
  // The exact previously tested 0.1.0 archive remains immutable.
  expect(built.digest).toBe(
    "4ae8931831c71d987c2b569760a54c18c27dff681038bf1cf25a5d7804a10712",
  );
  const recovered = await recoverInstalledDraft(
    built.package,
    source.url,
    runtime,
  );
  expect(recovered.tools.map((t) => t.name)).toEqual(["search_classifieds"]);
  expect((await compileDraft(recovered, runtime, license)).digest).toBe(
    built.digest,
  );
});
it("rejects corrupt, foreign and lossy bundles without running their source", async () => {
  const source = await clasificadosDraft();
  source.tools[0]!.execute = '() => { throw new Error("must not execute"); }';
  source.tools[0]!.inputSchema = {
    type: "object",
    properties: { offset: { type: "number", minimum: -10 } },
    additionalProperties: false,
  };
  const built = await compileDraft(source, runtime, license);
  expect(
    (await recoverInstalledDraft(built.package, source.url, runtime)).tools,
  ).toHaveLength(1);
  await expect(
    recoverInstalledDraft(
      { ...built.package, payload: built.package.payload + "x" },
      source.url,
      runtime,
    ),
  ).rejects.toThrow("SHA-256");
  for (const payload of [
    built.package.payload + '\nthrow new Error("must not execute");',
    built.package.payload.replace(
      'throw new Error("must not execute")',
      "return capturedHelper()",
    ),
    'throw new Error("must not execute");',
  ]) {
    const p = {
      ...built.package,
      payload,
      manifest: {
        ...built.package.manifest,
        payloadSha256: await sha256(payload),
      },
    };
    // A standalone function referring to a page global can be losslessly copied;
    // a wrapper/captured helper outside the compiler format cannot be.
    if (payload.includes("capturedHelper")) {
      const withHelper = "const capturedHelper = () => 1;\n" + payload;
      await expect(
        recoverInstalledDraft(
          {
            ...p,
            payload: withHelper,
            manifest: {
              ...p.manifest,
              payloadSha256: await sha256(withHelper),
            },
          },
          source.url,
          runtime,
        ),
      ).rejects.toThrow("EDIT_SOURCE_UNAVAILABLE");
    } else
      await expect(
        recoverInstalledDraft(p, source.url, runtime),
      ).rejects.toThrow("EDIT_SOURCE_UNAVAILABLE");
  }
  await expect(
    recoverInstalledDraft(built.package, "https://example.org/wrong", runtime),
  ).rejects.toThrow("EDIT_SOURCE_UNAVAILABLE");
});
