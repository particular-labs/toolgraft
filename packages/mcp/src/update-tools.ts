import { draftSchema, type Draft } from "./builder";

/** Apply explicit operations; untouched function source is never regenerated. */
export function updateTools(
  draft: Draft,
  add: Draft["tools"],
  update: Draft["tools"],
  remove: string[],
) {
  const names = [
    ...add.map((t) => t.name),
    ...update.map((t) => t.name),
    ...remove,
  ];
  if (!names.length || new Set(names).size !== names.length)
    throw new Error(
      "Specify at least one change, and change each tool only once.",
    );
  const existing = new Map(draft.tools.map((t) => [t.name, t]));
  for (const t of add)
    if (existing.has(t.name))
      throw new Error(`Tool ${t.name} already exists. Use update.`);
  for (const name of [...update.map((t) => t.name), ...remove])
    if (!existing.has(name)) throw new Error(`Tool ${name} does not exist.`);
  const replacements = new Map(update.map((t) => [t.name, t]));
  return draftSchema.parse({
    ...draft,
    tools: [
      ...draft.tools
        .filter((t) => !remove.includes(t.name))
        .map((t) => replacements.get(t.name) ?? t),
      ...add,
    ],
  });
}
