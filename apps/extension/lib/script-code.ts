import type { Package } from "@toolgraft/adapter-schema";

/** One initialization per approved version and document, including idle injection. */
export function scriptCode(p: Package) {
  const key = JSON.stringify(
    `__toolgraft_loaded_${p.manifest.id}@${p.manifest.version}`,
  );
  return `if (!globalThis[${key}]) { globalThis[${key}] = true;\n${p.payload}\n}`;
}
